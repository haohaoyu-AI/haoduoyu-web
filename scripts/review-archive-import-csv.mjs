// Local workbook-export adapter. No transport, login or public output.
import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {archiveDay,archiveInstant,archiveUuid} from '../src/review-archive-model.mjs';
import {stable} from '../src/security.mjs';

const csvLimit = 16*1024*1024;
const configLimit = 64*1024;
const pageRows = 8;
const pageBytes = 225000;
const maxPages = 400;
const repository = fileURLToPath(new URL('../',import.meta.url));
const badKeys = new Set(['__proto__','prototype','constructor']);
const options = new Set(['--csv','--mapping','--output']);
const formats = new Set(['text','number','grouped-number','percent','ratio','json']);
const isObject = value => value!==null && typeof value==='object' && !Array.isArray(value);
const shape = (value,keys) => isObject(value) && Object.keys(value).every(key=>keys.includes(key));
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const identifier = digest => digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);
const error = code => { throw Object.assign(new Error(code),{code}); };

function isSafeText(value,max) {
  return typeof value==='string' && value.length>0 && value.length<=max && value.isWellFormed() &&
    !/[\x00-\x1f\x7f]/u.test(value);
}

export function parseArchiveCsv(input,separator=',') {
  if (typeof input!=='string' || ![',','\t'].includes(separator) || Buffer.byteLength(input)>csvLimit) error('CSV_INPUT');
  const lines = [];
  let row = [], value = '', quoted = false, closed = false;
  const pushField = () => { row.push(value); value=''; closed=false; };
  const pushRow = () => {
    pushField();
    lines.push(row);
    row=[];
    if (lines.length>pageRows*maxPages+1) error('CSV_ROW_LIMIT');
  };
  const text = input.replace(/^\uFEFF/u,'');
  for (let index=0;index<text.length;index++) {
    const char = text[index];
    if (quoted) {
      if (char!=='"') { value+=char; continue; }
      if (text[index+1]==='"') { value+='"'; index++; continue; }
      quoted=false; closed=true; continue;
    }
    if (char===separator) { pushField(); continue; }
    if (char==='\n'||char==='\r') {
      if (char==='\r'&&text[index+1]==='\n') index++;
      pushRow();
      continue;
    }
    if (closed || char==='"'&&value) error('CSV_QUOTES');
    if (char==='"') quoted=true;
    else value+=char;
  }
  if (quoted) error('CSV_QUOTES');
  if (row.length || value || closed) pushRow();
  const [headers,...rows] = lines;
  if (!headers?.length||headers.length>250||headers.some(key=>!isSafeText(key,200))||new Set(headers).size!==headers.length)
    error('CSV_HEADERS');
  if (rows.some(values=>values.length!==headers.length)) error('CSV_ROW_WIDTH');
  return {headers,rows};
}

function byDot(value,key,datum) {
  const parts = key.split('.');
  if (parts.some(part=>!/^[a-z][a-z0-9_]{0,70}$/u.test(part)||badKeys.has(part))||parts.length>2) error('CONFIG_FIELD');
  if (parts.length===1) { value[key]=datum; return; }
  const [group,prop] = parts;
  if (value[group]!==undefined&&!isObject(value[group])) error('CONFIG_OVERLAP');
  value[group]??={};
  value[group][prop]=datum;
}

function numeric(value,format) {
  if (format==='percent') {
    if (!value.endsWith('%')) error('CSV_PERCENT');
    value=value.slice(0,-1);
  }
  if (format==='grouped-number'&&value.includes(',')) {
    if (!/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(value)) error('CSV_NUMBER');
    value=value.replaceAll(',','');
  }
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value)) error('CSV_NUMBER');
  const number = Number(format==='ratio'?value+'e2':value);
  if (!Number.isFinite(number)||Math.abs(number)>Number.MAX_SAFE_INTEGER) error('CSV_NUMBER');
  return number;
}

function mappedValue(value,spec) {
  const datum = value.trim();
  if (spec.values && Object.hasOwn(spec.values,datum)) return spec.values[datum];
  if (!datum) return undefined;
  if (spec.values) error('CSV_VALUE_UNMAPPED');
  if (spec.format==='text') return datum;
  if (spec.format==='json') {
    try { return JSON.parse(datum); } catch { error('CSV_CELL_JSON'); }
  }
  return numeric(datum,spec.format);
}

function column(input,headers) {
  const spec = typeof input==='string'?{column:input}:input;
  if (!shape(spec,['column','format','values'])||!headers.has(spec.column)||!formats.has(spec.format??'text')||
    spec.values!==undefined&&(!isObject(spec.values)||Object.keys(spec.values).some(key=>badKeys.has(key))||
      Object.values(spec.values).some(value=>value!==null&&!['string','number','boolean'].includes(typeof value))))
    error('CONFIG_COLUMN');
  return cells=>mappedValue(cells[headers.get(spec.column)],{...spec,format:spec.format??'text'});
}

function columns(input,headers) {
  if (!isObject(input)||Object.keys(input).length>50) error('CONFIG_COLUMNS');
  const groups = new Set(Object.keys(input).map(key=>key.split('.')[0]).filter(key=>Object.hasOwn(input,key)));
  if (Object.keys(input).some(key=>key.includes('.')&&groups.has(key.split('.')[0]))) error('CONFIG_OVERLAP');
  const entries = Object.entries(input).map(([name,spec])=>[name,column(spec,headers)]);
  for (const [name] of entries) byDot({},name,null);
  return cells=>{
    const output = {};
    for (const [name,read] of entries) {
      const reading = read(cells);
      if (reading!==undefined) byDot(output,name,reading);
    }
    return output;
  };
}

function mappingFor(mapping,headers,kind) {
  if (!shape(mapping,['key','item_id','record','references','snapshot'])) error('CONFIG_MAPPING');
  const record = columns(mapping.record??{},headers);
  const referenceInputs = mapping.references??[];
  if (!Array.isArray(referenceInputs)||referenceInputs.length>2) error('CONFIG_REFERENCE');
  const refs = referenceInputs.map(ref=>{
    if (!shape(ref,['kind','columns'])||!['draft','publication'].includes(ref.kind)||
      !isObject(ref.columns)||!Object.hasOwn(ref.columns,'platform_id')||Object.hasOwn(ref.columns,'kind'))
      error('CONFIG_REFERENCE');
    return {kind:ref.kind,read:columns(ref.columns,headers)};
  });
  const key = mapping.key===undefined?null:column(mapping.key,headers);
  const item = mapping.item_id===undefined?null:column(mapping.item_id,headers);
  const observations = mapping.snapshot;
  if (kind==='metrics'&&observations===undefined) error('CONFIG_SNAPSHOT');
  const snapshot = observations===undefined?null:snapshotMapping(observations,headers);
  return (cells,index) => {
    const itemId = item?.(cells);
    if (itemId!==undefined) {
      try { archiveUuid(itemId); } catch { error('CSV_ITEM_ID'); }
    }
    const row = {key:key?.(cells)??'row-'+(index+2),record:record(cells)};
    if (!isSafeText(row.key,120)) error('CSV_ROW_KEY');
    if (itemId!==undefined) row.item_id=itemId;
    const references = refs.flatMap(({kind:label,read})=>{
      const fields = read(cells);
      if (!Object.keys(fields).length) return [];
      return [{kind:label,...fields}];
    });
    if (references.length) row.refs=references;
    if (snapshot) row.snapshot=snapshot(cells,row);
    return row;
  };
}

function snapshotMapping(value,headers) {
  if (!shape(value,['observed_at','source_key','metrics'])||value.observed_at===undefined||!isObject(value.metrics)||
    !Object.keys(value.metrics).length||Object.keys(value.metrics).some(name=>name.includes('.'))) error('CONFIG_SNAPSHOT');
  const stamp = column(value.observed_at,headers);
  const key = value.source_key===undefined?null:column(value.source_key,headers);
  const metrics = columns(value.metrics,headers);
  return (cells,row)=>{
    let observed;
    try { observed=archiveInstant(stamp(cells)); } catch { error('CSV_OBSERVATION_TIME'); }
    const identity = row.refs?.find(ref=>ref.kind==='publication')?.platform_id??row.item_id??row.key;
    return {source_key:key?.(cells)??hash([identity,observed]),observed_at:observed,metrics:metrics(cells)};
  };
}

function validateMapping(config) {
  if (!shape(config,['run_id','kind','source','source_key','scope','mapping','separator','whole_scope','total_rows'])||
    !['directory','drafts','metrics'].includes(config.kind)||!isSafeText(config.source,100)||
    config.source_key!==undefined&&!isSafeText(config.source_key,200)||
    config.whole_scope!==undefined&&typeof config.whole_scope!=='boolean'||
    config.total_rows!==undefined&&(!Number.isSafeInteger(config.total_rows)||config.total_rows<0||config.total_rows>pageRows*maxPages)) error('CONFIG_INPUT');
  const raw = config.scope;
  if (!shape(raw,['account','platform','kind','collected_at','from','to'])||raw.account!=='V字'||raw.platform!=='toutiao'||
    !['article','micro'].includes(raw.kind)||!Object.hasOwn(raw,'from')||!Object.hasOwn(raw,'to')) error('CONFIG_SCOPE');
  try {
    const scope = {...raw,collected_at:archiveInstant(raw.collected_at),from:archiveDay(raw.from??null),to:archiveDay(raw.to??null)};
    if (scope.from!==null&&scope.to!==null&&scope.from>scope.to) error('CONFIG_SCOPE');
    if (config.run_id!==undefined) archiveUuid(config.run_id);
    return scope;
  } catch { error('CONFIG_SCOPE'); }
}

export function buildArchiveImportPages(csv,config) {
  const scope = validateMapping(config);
  const {headers,rows} = parseArchiveCsv(csv,config.separator??',');
  const ref = hash(csv);
  const sourceKey = config.source_key??ref;
  const envelope = {run_id:config.run_id??identifier(hash([config.kind,config.source,sourceKey,scope])),
    kind:config.kind,source:config.source,source_key:sourceKey,scope};
  const mapped = mappingFor(config.mapping,new Map(headers.map((header,i)=>[header,i])),config.kind);
  const prepared = rows.map(mapped);
  if (prepared.some(row=>row.snapshot&&row.snapshot.observed_at>scope.collected_at)) error('CSV_OBSERVATION_TIME');
  if (config.whole_scope===true&&config.total_rows!==prepared.length) error('CONFIG_COVERAGE');
  const groups = splitRows(prepared);
  return groups.map((data,index)=>({...envelope,page:index+1,rows:data,coverage:{last_page:index+1===groups.length,
    whole_scope:config.whole_scope??false,...(config.total_rows!==undefined?{total_rows:config.total_rows}:{})}}));
}

function splitRows(rows) {
  const groups = [];
  let group = [], bytes = 0;
  for (const row of rows) {
    const length = Buffer.byteLength(JSON.stringify(row),'utf8')+1;
    if (length>pageBytes) error('CSV_PAGE_LIMIT');
    if (group.length===pageRows||bytes+length>pageBytes) {
      groups.push(group); group=[]; bytes=0;
    }
    group.push(row); bytes+=length;
  }
  groups.push(group);
  if (groups.length>maxPages) error('CSV_PAGE_LIMIT');
  return groups;
}

function inside(root,path) {
  const rel = relative(root,path);
  return !rel || !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);
}

async function validateDestination(output) {
  if (!isAbsolute(output)||resolve(output)!==output||output===dirname(output)) error('OUTPUT_PATH');
  const parent = await realpath(dirname(output));
  const target = join(parent,basename(output));
  if (inside(repository,target)||target.split(sep).some(part=>['dist','build','public','artifacts','.git'].includes(part))) error('OUTPUT_NOT_PRIVATE');
  for (let path=parent;;path=dirname(path)) {
    try {
      const marker = await lstat(join(path,'.git'));
      if (!marker.isDirectory()) error('OUTPUT_NOT_PRIVATE');
      // Some managed environments mount an empty .git placeholder in /tmp.
      // A repository directory has HEAD, while a worktree marker is a file.
      await lstat(join(path,'.git','HEAD'));
      error('OUTPUT_NOT_PRIVATE');
    }
    catch (cause) { if (cause?.code!=='ENOENT') throw cause; }
    if (path===dirname(path)) break;
  }
  const parentMode = await stat(parent);
  if (!parentMode.isDirectory()||parentMode.mode&0o022&&!(parentMode.mode&0o1000)) error('OUTPUT_PARENT_MODE');
  return target;
}

async function boundedText(path,limit) {
  const info = await stat(path);
  if (!info.isFile()||info.size>limit) error('INPUT_FILE_LIMIT');
  const bytes = await readFile(path);
  if (bytes.length>limit) error('INPUT_FILE_LIMIT');
  try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { error('INPUT_UTF8'); }
}

export async function writeArchiveImportPages({csv,mapping,output}) {
  const target = await validateDestination(output);
  const [source,optionsText] = await Promise.all([boundedText(csv,csvLimit),boundedText(mapping,configLimit)]);
  let config;
  try { config=JSON.parse(optionsText); } catch { error('CONFIG_JSON'); }
  const pages = buildArchiveImportPages(source,config);
  await mkdir(target,{mode:0o700});
  const filenames = [];
  for (const page of pages) {
    const name = 'page-'+String(page.page).padStart(4,'0')+'.json';
    await writeFile(join(target,name),JSON.stringify(page)+'\n',{flag:'wx',mode:0o600});
    filenames.push(name);
  }
  await writeFile(join(target,'manifest.json'),JSON.stringify({run_id:pages[0].run_id,pages:filenames})+'\n',{flag:'wx',mode:0o600});
}

function cli(args) {
  if (args.length!==6) error('ARGS');
  const pairs = new Map();
  for (let index=0;index<args.length;index+=2) {
    if (!options.has(args[index])||pairs.has(args[index])||!isAbsolute(args[index+1])) error('ARGS');
    pairs.set(args[index],args[index+1]);
  }
  return {csv:pairs.get('--csv'),mapping:pairs.get('--mapping'),output:pairs.get('--output')};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try { await writeArchiveImportPages(cli(process.argv.slice(2))); }
  catch (cause) {
    // Emit fixed codes only. Even an OS error must never print the input path.
    const code = cause?.code;
    process.stderr.write((typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,45}$/u.test(code)?code:'ARCHIVE_CONVERSION_FAILED')+'\n');
    process.exitCode=1;
  }
}
