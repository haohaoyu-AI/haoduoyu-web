// Offline synthetic fixtures only. No web/model call or user's article is read.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {zipSync, strToU8, zlibSync, unzipSync} from 'fflate';

const nativeRequire=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const sql=new DatabaseSync(':memory:');
const migrations=fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort();
assert.ok(migrations.includes('0032_local_word_only_jobs.sql'));
for(const name of migrations)sql.exec(fs.readFileSync('drizzle/'+name,'utf8'));
const db={async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements){if(/^\s*SELECT/i.test(statement.query)){sql.prepare(statement.query).all(...statement.values);result.push({meta:{changes:0}});}else result.push(await statement.run());}sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}},prepare:query=>({bind:(...values)=>({query,values,
  first:async()=>sql.prepare(query).get(...values)||null,
  all:async()=>({results:sql.prepare(query).all(...values)}),
  run:async()=>({meta:{changes:Number(sql.prepare(query).run(...values).changes)}}),
})})};
const objects=new Map();
let afterPut=null;
const bucket={
  async put(key,bytes){objects.set(key,new Uint8Array(bytes));if(afterPut)await afterPut(key);},
  async get(key){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})}:null;},
  async head(key){return objects.has(key)?{size:objects.get(key).length}:null;},
  async list({prefix}){return {truncated:false,objects:[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,bytes])=>({key,size:bytes.length}))};},
  async delete(key){objects.delete(key);},
};
const wakes=[];
let callbackStatus=202;
let callbackDisconnected=false;
const mockFetch=async(url,init)=>{
  assert.equal(url,'https://word-worker.example.org/offline-fixture');
  assert.equal(init.method,'POST');
  assert.equal(init.redirect,'manual');
  wakes.push({event:JSON.parse(init.body),headers:clone(init.headers)});
  if(callbackDisconnected)throw new TypeError('OFFLINE MOCK: simulated disconnected callback transport');
  return new Response('',{status:callbackStatus});
};
const modules={};
function load(name){
  if(modules[name])return modules[name];
  const exports={};modules[name]=exports;
  const source=fs.readFileSync('lib/'+name+'.ts','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:request=>request==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:request.startsWith('./')?load(request.slice(2)):nativeRequire(request),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Set,Map,Error,URL,btoa,atob,Date,File,ReadableStream,Response,Request,Headers,AbortSignal,DOMException,fetch:mockFetch,setTimeout,clearTimeout,console:{info(){}}},{filename:'lib/'+name+'.ts'});
  return exports;
}
const core=load('local-word-jobs'),layout=load('local-word-layout'),manifest=load('article-manifest'),wordCore=load('word-recovery');
const executions=new Map();
const articles=load('articles'),articleTools=load('article-tools');
const owner='offline-local-owner',other='offline-other-owner';
const title='OFFLINE MOCK: synthetic local Word fixture';
const body=['Synthetic opening paragraph.','','Synthetic section','Synthetic final paragraph.'];
const source=[title,...body];
const rawSource=source.join('\n\n');
function input(overrides={}){return {request_key:randomUUID(),filename:'offline-synthetic.txt',source_sha256:hash(rawSource),title,paragraphs:[...body],subheading_indices:[2],original_sha256:hash(JSON.stringify(source)),...overrides};}
const row=id=>sql.prepare('SELECT * FROM local_word_jobs WHERE id=?').get(id);
// Independent legacy cases use separate owners so unknown historical holders
// cannot be mistaken for ended executors by the new serial guard.
const fixtureOwner=id=>row(id)?.owner||owner;
const call=(name,args)=>core.localWordCall(fixtureOwner(args?.job_id),name,args?.execution?.execution_id==='synthetic-receipt-needs-target-binding'?{...args,execution:{...args.execution,execution_id:executions.get(args.job_id)?.execution_id}}:args);
const receipt=()=>({executor:'xiaoyu_agent',execution_id:'synthetic-receipt-needs-target-binding',model:'offline-mock',rendered_pages:1,verification_summary:'OFFLINE MOCK receipt for synthetic fixture; no cloud executor or page renderer was run.'});
let groups=0;
async function check(name,fn){await fn();groups++;console.log('PASS '+name);}

// A clearly labelled 2x1 RGB raster fixture, generated for validation tests only.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function pngChunk(type,data){const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(strToU8(type),4);bytes.set(data,8);view.setUint32(data.length+8,crc32(bytes.subarray(4,data.length+8)));return bytes;}
function syntheticPng(pixels=[220,30,30,30,30,220]){const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,2);view.setUint32(4,1);header[8]=8;header[9]=2;const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlibSync(new Uint8Array([0,...pixels]))),pngChunk('IEND',new Uint8Array())];const bytes=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;}
const image=syntheticPng(),alternateImage=syntheticPng([30,220,30,220,220,30]);
const imagePlan=(after=2,bytes=image)=>[{sha256:hash(bytes),source_url:'https://images.example.org/offline-synthetic-2x1.png',source_title:'OFFLINE MOCK: generated 2x1 validation raster; not a researched public image',after_paragraph:after}];
const escape=string=>string.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function word({text=source,headings=[3],imageAfter=3,bytes=image,crop=0,stretch=false,floating=false,rotate=0,external=false,headerText=null,omitImage=false,transformMismatch=false}={}){
  const cx=5486400,cy=stretch?5486400:2743200;
  const picture=`<w:p><w:r><w:drawing><wp:${floating?'anchor':'inline'}><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="OFFLINE MOCK synthetic raster"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="OFFLINE MOCK synthetic raster"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/>${crop?`<a:srcRect l="${crop}"/>`:''}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${rotate?` rot="${rotate}"`:''}><a:off x="0" y="0"/><a:ext cx="${transformMismatch?cx+4:cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:${floating?'anchor':'inline'}></w:drawing></w:r></w:p>`;
  const paragraphs=text.map((value,i)=>`<w:p>${headings.includes(i)?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':''}${value?`<w:r><w:t xml:space="preserve">${escape(value)}</w:t></w:r>`:''}</w:p>${!omitImage&&i===imageAfter?picture:''}`).join('');
  const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+(headerText!==null?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':'')+'</Types>';
  const files={
    '[Content_Types].xml':strToU8(types),
    '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml':strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraphs}<w:sectPr>${headerText!==null?'<w:headerReference w:type="default" r:id="rIdHeader"/>':''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
    'word/_rels/document.xml.rels':strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${external?'https://images.example.org/offline.png':'media/offline-synthetic.png'}"${external?' TargetMode="External"':''}/>${headerText!==null?'<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>':''}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml':strToU8('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>'),
    'word/media/offline-synthetic.png':bytes,
  };
  if(headerText!==null)files['word/header1.xml']=strToU8(`<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${escape(headerText)}</w:t></w:r></w:p></w:hdr>`);
  return zipSync(files);
}
const docx=word();
async function grantWord(job,claim){
  const binding={target_kind:'local_word',target_id:job.id,claim_token:claim.claim_token,input_sha256:row(job.id).input_sha256,execution_token:randomUUID(),execution_id:randomUUID(),request_key:randomUUID(),execution_scope:'heavy'};
  const result=await wordCore.wordRecoveryCall(fixtureOwner(job.id),'acquire_word_execution',binding);assert.equal(result.acquired,true);executions.set(job.id,binding);return binding;
}
async function checkpoint(state,bytes,kind,metadata={}){
  const binding=executions.get(state.job.id),key=hash(bytes)+JSON.stringify(metadata);state.cps||=new Map();if(state.cps.has(key))return;
  const asset_id=randomUUID(),scope={target_kind:binding.target_kind,target_id:binding.target_id,claim_token:binding.claim_token,input_sha256:binding.input_sha256,execution_token:binding.execution_token,asset_id};
  await wordCore.checkpointCall(fixtureOwner(state.job.id),'begin_word_checkpoint',{...scope,kind,sha256:hash(bytes),size:bytes.length,chunks:Math.ceil(bytes.length/65536),metadata});
  for(let offset=0,index=0;offset<bytes.length;offset+=65536,index++)await wordCore.checkpointCall(fixtureOwner(state.job.id),'put_word_checkpoint_chunk',{...scope,index,data_base64:Buffer.from(bytes.subarray(offset,offset+65536)).toString('base64')});
  await wordCore.checkpointCall(fixtureOwner(state.job.id),'finalize_word_checkpoint',scope);state.cps.set(key,asset_id);
}
async function imageCheckpoints(state,plan){for(const entry of plan){const bytes=entry.sha256===hash(image)?image:entry.sha256===hash(alternateImage)?alternateImage:null;assert.ok(bytes,'valid fixture images must have actual known bytes');await checkpoint(state,bytes,'image',{source_url:entry.source_url,source_title:entry.source_title,after_paragraph:entry.after_paragraph});}}
async function claimedJob(frozenInput=input(),{grant=true,plan=imagePlan()}={}){const fixtureScope=owner+'-case-'+randomUUID();const created=await core.createLocalWordJob(fixtureScope,frozenInput);const claim=await call('claim_local_word_job',{job_id:created.job.id});assert.equal(claim.claimed,true);const state={job:created.job,base:{job_id:created.job.id,claim_token:claim.claim_token},claim};if(grant){const binding=await grantWord(state.job,claim);state.base.execution_token=binding.execution_token;await imageCheckpoints(state,plan);}return state;}
async function startedJob(bytes=docx,{chunks=1,sha=hash(bytes),plan=imagePlan(),frozenInput}={}){const state=await claimedJob(frozenInput,{plan});await call('record_local_word_images',{...state.base,images:plan});await checkpoint(state,bytes,'word');const begun=await call('begin_local_word_output',{...state.base,size:bytes.length,sha256:sha,chunks});return {...state,bytes,begun,upload:{...state.base,output_id:begun.output_id}};}
async function uploadOne(state){return call('put_local_word_output_chunk',{...state.upload,index:0,data_base64:Buffer.from(state.bytes).toString('base64')});}
async function invalidWord(options,{frozenInput}={}){const state=await claimedJob(frozenInput),bytes=word(options);await call('record_local_word_images',{...state.base,images:imagePlan()});let checkpointRejected=false;try{await checkpoint(state,bytes,'word');}catch{checkpointRejected=true;}if(checkpointRejected){await assert.rejects(call('begin_local_word_output',{...state.base,size:bytes.length,sha256:hash(bytes),chunks:1}));}else{const begun=await call('begin_local_word_output',{...state.base,size:bytes.length,sha256:hash(bytes),chunks:1});state.bytes=bytes;state.upload={...state.base,output_id:begun.output_id};await uploadOne(state);await assert.rejects(call('finalize_local_word_output',{...state.upload,execution:receipt()}));}assert.equal(row(state.job.id).state,'processing');assert.equal(row(state.job.id).result_key,null);}
const protectedTables=()=>sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('local_word_jobs','local_word_queue_claims') AND name NOT LIKE 'word_%' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const protectedSnapshot=()=>JSON.stringify(protectedTables().map(name=>({name,rows:sql.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()})));

let job,baseline;
await check('all SQLite migrations execute; independent scope/state CHECK constraints reject invalid rows',async()=>{
  job=(await core.createLocalWordJob(owner,input())).job;
  assert.match(job.id,/^localword_[0-9a-f-]{36}$/);
  assert.equal(job.source_kind,'local_desktop');assert.equal(job.output_mode,'word_only');assert.deepEqual(clone(job.destinations),[]);
  for(const change of ["output_mode='article'","source_kind='cloud'","destinations_json='[\"toutiao\"]'","state='completed'","dispatch_state='posted'"])assert.throws(()=>sql.exec(`UPDATE local_word_jobs SET ${change} WHERE id='${job.id}'`),/CHECK constraint|local_word_frozen_input/);
});
await check('missing owner, bad identity, empty text, bad basename/format/digests and Heading1 indices reject',async()=>{
  await assert.rejects(core.createLocalWordJob('',input()));
  const bad=[{request_key:'not-uuid'},{filename:'../source.txt'},{filename:'D:\\source.txt'},{filename:'source.pdf'},{source_sha256:'a'.repeat(63)},{source_sha256:'A'.repeat(64)},{title:''},{title:'title\nbody'},{paragraphs:[]},{paragraphs:['',' ']},{paragraphs:[7]},{original_sha256:'f'.repeat(64)},{subheading_indices:[1]},{subheading_indices:[3,2]},{subheading_indices:[2,2]},{subheading_indices:[4]}];
  const before=sql.prepare('SELECT count(*) AS n FROM local_word_jobs').get().n;
  for(const change of bad)await assert.rejects(core.createLocalWordJob(owner,input(change)));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM local_word_jobs').get().n,before);
});
await check('unknown platform/event/output flags rejected rather than normalized into article submission',async()=>{
  for(const extra of [{destinations:['toutiao']},{output_mode:'word_only'},{source_kind:'local_desktop'},{publish:true},{event:'article.submitted'},{article_id:randomUUID()},{auth_token:'synthetic-never-real'}])await assert.rejects(core.createLocalWordJob(owner,{...input(),...extra}));
});
await check('all desktop-supported extensions accept valid frozen synthetic input',async()=>{
  for(const filename of ['offline-synthetic.docx','offline-synthetic.md','offline-synthetic.TXT','离线合成稿.txt'])assert.equal((await core.createLocalWordJob(owner,input({filename}))).job.filename,filename);
});
await check('omitted and explicit zero leading blanks canonicalize to the same idempotent input',async()=>{
  for(const explicitFirst of [false,true]){const value=input(),first=await core.createLocalWordJob(owner,explicitFirst?{...value,leading_blank_paragraphs:0}:value),repeat=await core.createLocalWordJob(owner,explicitFirst?value:{...value,leading_blank_paragraphs:0});assert.equal(first.job.id,repeat.job.id);assert.equal(first.job.input_sha256,repeat.job.input_sha256);assert.equal(repeat.reused,true);assert.equal(row(first.job.id).leading_blank_paragraphs,0);assert.equal(JSON.parse(row(first.job.id).input_json).leading_blank_paragraphs,0);assert.equal((await core.readLocalWordJob(owner,first.job.id,true)).input.leading_blank_paragraphs,0);}
});
await check('leading blank count rejects invalid values, missing full-source hash and aggregate overflow',async()=>{
  const before=sql.prepare('SELECT count(*) AS n FROM local_word_jobs').get().n;
  for(const value of [null,false,'2',-1,1.5,4999,NaN,Infinity,Number.MAX_SAFE_INTEGER])await assert.rejects(core.createLocalWordJob(owner,input({leading_blank_paragraphs:value})));
  await assert.rejects(core.createLocalWordJob(owner,input({leading_blank_paragraphs:2})));
  for(const [leading,count] of [[0,5000],[2,4998],[4998,2]]){const paragraphs=Array(count).fill('x'),full=[...Array(leading).fill(''),title,...paragraphs];await assert.rejects(core.createLocalWordJob(owner,input({leading_blank_paragraphs:leading,paragraphs,subheading_indices:[],original_sha256:hash(JSON.stringify(full))})));}
  assert.equal(sql.prepare('SELECT count(*) AS n FROM local_word_jobs').get().n,before);
  for(const [leading,count] of [[0,4999],[2,4997],[4998,1]]){const paragraphs=Array(count).fill('x'),full=[...Array(leading).fill(''),title,...paragraphs],created=await core.createLocalWordJob(owner,input({leading_blank_paragraphs:leading,paragraphs,subheading_indices:[],original_sha256:hash(JSON.stringify(full))}));assert.equal(created.job.state,'queued');assert.equal(row(created.job.id).leading_blank_paragraphs,leading);}
});
await check('SQLite leading-blank column defaults to zero, stays frozen and rejects invalid persisted counts',async()=>{
  assert.ok(sql.prepare('PRAGMA table_info(local_word_jobs)').all().some(column=>column.name==='leading_blank_paragraphs'));assert.equal(row(job.id).leading_blank_paragraphs,0);const before=JSON.stringify(row(job.id));assert.throws(()=>sql.prepare('UPDATE local_word_jobs SET leading_blank_paragraphs=? WHERE id=?').run(2,job.id),/local_word_frozen_input/);assert.equal(JSON.stringify(row(job.id)),before);
  const template=row(job.id),keys=Object.keys(template),statement=sql.prepare(`INSERT INTO local_word_jobs(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`);
  for(const count of [-1,4999,1.5,'not-an-integer',null]){const bad={...template,id:'localword_'+randomUUID(),request_key:randomUUID(),leading_blank_paragraphs:count};assert.throws(()=>statement.run(...keys.map(key=>bad[key])),/CHECK constraint|NOT NULL constraint/);}
});
await check('exact frozen source including blank paragraph is returned only to its owner',async()=>{
  const read=await core.readLocalWordJob(owner,job.id,true);assert.deepEqual(clone(read.input.paragraphs),body);assert.deepEqual(clone(read.input.subheading_indices),[2]);assert.equal(read.input.original_sha256,hash(JSON.stringify(source)));
  const publicRead=await core.readLocalWordJob(owner,job.id);assert.equal(publicRead.connection_ready,false);assert.equal(publicRead.input,undefined);assert.equal(publicRead.output,undefined);
  for(const bad of [job.id.slice(10),'localword_'+randomUUID()])await assert.rejects(core.readLocalWordJob(owner,bad));
  await assert.rejects(core.readLocalWordJob(other,job.id));
  assert.equal(wakes.length,0);assert.equal(job.dispatch_state,'pending');
});
await check('executor read uses Title without mutating shared Heading1 format or exposing it to browser reads',async()=>{
  const shared=load('output-format').outputFormat,sharedBefore=clone(shared),expected=clone(shared);
  assert.equal(shared.title.style,'Heading1');expected.title.style='Title';
  const before=JSON.stringify(row(job.id)),changes=sql.prepare('SELECT total_changes() AS n').get().n,wakeCount=wakes.length;
  let first,last;
  for(let index=0;index<2;index++){
    const read=await call('read_local_word_job',{job_id:job.id});assert.equal(read.output_format.title.style,'Title');assert.deepEqual(clone(read.output_format),expected);assert.deepEqual(clone(shared),sharedBefore);assert.equal(shared.title.style,'Heading1');
    last=clone(read);if(last.job.word_progress)delete last.job.word_progress.read_at;if(first)assert.deepEqual(last,first);else first=last;
  }
  const browserRead=await core.readLocalWordJob(owner,job.id);assert.equal(Object.hasOwn(browserRead,'output_format'),false);
  assert.equal(JSON.stringify(row(job.id)),before);assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,changes);assert.equal(wakes.length,wakeCount);assert.deepEqual(clone(shared),sharedBefore);
  fs.mkdirSync('.local-word-test-output/write',{recursive:true});
  fs.writeFileSync('.local-word-test-output/write/read-local-word-title-style.evidence.json',JSON.stringify({synthetic_only:true,scope:'OFFLINE MOCK synthetic job; actual localWordCall read and shared output-format module; no cloud/model/user draft',output_format:first.output_format,shared_title_style_before:sharedBefore.title.style,shared_title_style_after:shared.title.style,remaining_fields_equal:JSON.stringify(first.output_format)===JSON.stringify(expected),repeat_read_identical:JSON.stringify(first)===JSON.stringify(last),browser_has_output_format:Object.hasOwn(browserRead,'output_format'),sqlite_total_changes_before:changes,sqlite_total_changes_after:sql.prepare('SELECT total_changes() AS n').get().n,job_row_unchanged:JSON.stringify(row(job.id))===before,wake_count_before:wakeCount,wake_count_after:wakes.length},null,2)+'\n');
});
await check('SQLite immutable-source trigger blocks direct title/body/hash/identity edits',async()=>{
  const before=JSON.stringify(row(job.id));
  for(const [field,value] of [['title','Changed title'],['input_json','{}'],['original_sha256','b'.repeat(64)],['source_sha256','b'.repeat(64)],['filename','changed.txt'],['request_key',randomUUID()],['owner',other],['created','2000-01-01T00:00:00.000Z']])assert.throws(()=>sql.prepare('UPDATE local_word_jobs SET '+field+'=? WHERE id=?').run(value,job.id),/local_word_frozen_input/);
  assert.equal(JSON.stringify(row(job.id)),before);
});
await check('same request is idempotent under concurrent creation; changed source with same key rejects',async()=>{
  const value=input();const results=await Promise.all([core.createLocalWordJob(owner,value),core.createLocalWordJob(owner,value),core.createLocalWordJob(owner,value)]);
  assert.equal(new Set(results.map(r=>r.job.id)).size,1);assert.equal(sql.prepare('SELECT count(*) AS n FROM local_word_jobs WHERE owner=? AND request_key=?').get(owner,value.request_key).n,1);assert.equal(results.filter(r=>!r.reused).length,1);
  assert.ok(results.every(result=>result.connection_ready===false));
  await assert.rejects(core.createLocalWordJob(owner,{...value,filename:'changed.md'}));
  const sameKeyOther=await core.createLocalWordJob(other,value);assert.notEqual(sameKeyOther.job.id,results[0].job.id);
});
await check('existing article/other subscriptions are unchanged; dedicated wake uses exact stable job ID',async()=>{
  await articles.createArticle(owner,new File(['OFFLINE MOCK legacy article\nLegacy synthetic paragraph.'],'legacy-offline.txt'));
  const secret='whsec_'+Buffer.alloc(32,42).toString('base64'),expires='2099-01-01T00:00:00.000Z';
  for(const [id,event] of [['offline-article','article.submitted'],['offline-editorial','editorial.requested'],['offline-local','local_word.requested']])sql.prepare('INSERT INTO event_subscriptions(id,owner,callback,secret,expires,active,generation,event_name) VALUES(?,?,?,?,?,?,?,?)').run(id,owner,'https://word-worker.example.org/offline-fixture',secret,expires,'active','offline-synthetic-generation',event);
  baseline=protectedSnapshot();const before=wakes.length;
  const created=await core.createLocalWordJob(owner,input());assert.equal(wakes.length,before+1);assert.equal(created.job.state,'queued');assert.equal(created.job.dispatch_state,'accepted');
  assert.equal(created.connection_ready,true);assert.equal((await core.readLocalWordJob(owner,created.job.id)).connection_ready,true);
  const wake=wakes.at(-1);assert.equal(wake.event.name,'local_word.requested');assert.equal(wake.event.eventId,'local_word_evt_'+created.job.id);assert.deepEqual(wake.event.data,{job_id:created.job.id});assert.equal(wake.headers['webhook-id'],wake.event.eventId);assert.equal(wake.headers['X-MCP-Subscription-Id'],'offline-local');
  assert.equal(protectedSnapshot(),baseline);
});
await check('unknown callback survives and concurrent retries are fenced with same event identity',async()=>{
  callbackStatus=503;const created=await core.createLocalWordJob(owner,input());assert.equal(created.job.state,'queued');assert.equal(created.job.dispatch_state,'unknown');const first=wakes.at(-1);
  const before=wakes.length;await call('retry_local_word_dispatch',{job_id:created.job.id});assert.equal(wakes.length,before);
  sql.prepare('UPDATE local_word_jobs SET dispatch_until=NULL WHERE id=?').run(created.job.id);callbackStatus=202;
  const recovered=await Promise.all([call('retry_local_word_dispatch',{job_id:created.job.id}),call('retry_local_word_dispatch',{job_id:created.job.id})]);assert.equal(wakes.length,before+1);assert.deepEqual(wakes.at(-1).event,first.event);assert.ok(recovered.some(r=>r.job.dispatch_state==='accepted'));assert.equal(row(created.job.id).state,'queued');
});
await check('mock disconnected callback preserves frozen pending task and same-ID recovery',async()=>{
  callbackDisconnected=true;const value=input(),created=await core.createLocalWordJob(owner,value);callbackDisconnected=false;assert.equal(created.job.state,'queued');assert.equal(created.job.dispatch_state,'unknown');assert.equal(JSON.parse(row(created.job.id).input_json).original_sha256,value.original_sha256);const first=wakes.at(-1);
  sql.prepare('UPDATE local_word_jobs SET dispatch_until=NULL WHERE id=?').run(created.job.id);const retry=await call('retry_local_word_dispatch',{job_id:created.job.id});assert.equal(retry.job.dispatch_state,'accepted');assert.deepEqual(wakes.at(-1).event,first.event);assert.equal(retry.job.state,'queued');
});
await check('exactly one concurrent claim wins and the raw ephemeral token is never stored/returned in reads',async()=>{
  const claims=await Promise.all([call('claim_local_word_job',{job_id:job.id}),call('claim_local_word_job',{job_id:job.id})]);assert.equal(claims.filter(c=>c.claimed).length,1);
  const winner=claims.find(c=>c.claimed);assert.equal(row(job.id).claim_hash,hash(winner.claim_token));assert.equal(JSON.stringify(row(job.id)).includes(winner.claim_token),false);assert.equal(JSON.stringify(await call('read_local_word_job',{job_id:job.id})).includes(winner.claim_token),false);
  await assert.rejects(core.localWordCall(other,'claim_local_word_job',{job_id:job.id}));
});
await check('expiry never rotates an unknown original local executor claim; every stale mutation rejects',async()=>{
  const state=await claimedJob();sql.prepare('UPDATE local_word_jobs SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',state.job.id);
  const recovered=await call('claim_local_word_job',{job_id:state.job.id});assert.equal(recovered.claimed,false);assert.equal(recovered.reason,'original_executor_end_unconfirmed');assert.equal(row(state.job.id).claim_hash,hash(state.base.claim_token));
  for(const [name,args] of [['record_local_word_images',{images:imagePlan()}],['begin_local_word_output',{size:docx.length,sha256:hash(docx),chunks:1}],['fail_local_word_job',{message:'OFFLINE MOCK stale worker'}]])await assert.rejects(call(name,{...state.base,...args}));
  await assert.rejects(call('record_local_word_images',{...state.base,images:imagePlan()}));
  const corrupted=await claimedJob();sql.prepare('UPDATE local_word_jobs SET claim_expires=? WHERE id=?').run('not-a-date',corrupted.job.id);await assert.rejects(call('record_local_word_images',{...corrupted.base,images:imagePlan()}));await assert.rejects(call('fail_local_word_job',{...corrupted.base,message:'OFFLINE MOCK corrupted lease'}));assert.equal(row(corrupted.job.id).output_meta,null);
});
await check('tools reject extra platform fields and unknown operations without changing the job',async()=>{
  const state=await claimedJob(),before=JSON.stringify(row(state.job.id));
  for(const [name,args] of [['read_local_word_job',{job_id:state.job.id,destinations:['toutiao']}],['claim_local_word_job',{job_id:state.job.id,platform:'zhihu'}],['fail_local_word_job',{...state.base,message:'OFFLINE MOCK',publish:true}],['claim_article',{...state.base}]])await assert.rejects(call(name,args));
  assert.equal(JSON.stringify(row(state.job.id)),before);
});
await check('image plan requires supported public URL, valid hash and nonempty-paragraph anchor range',async()=>{
  const state=await claimedJob();const valid=imagePlan()[0];
  for(const images of [[],[{...valid,sha256:'bad'}],[{...valid,source_url:'file:///C:/private.png'}],[{...valid,source_url:'https://images.example.org/source.png?token=synthetic'}],[{...valid,after_paragraph:4}],[{...valid,after_paragraph:-1}],[{...valid,source_title:''}]])await assert.rejects(call('record_local_word_images',{...state.base,images}));
  for(const source_url of ['https://127.0.0.1/source.png','https://192.168.1.2/source.png','https://[::1]/source.png','https://localhost/source.png','https://box.internal/source.png','https://one-label/source.png','https://images.example.org./source.png'])await assert.rejects(call('record_local_word_images',{...state.base,images:[{...valid,source_url}]}));
  await assert.rejects(call('record_local_word_images',{...state.base,images:[{...valid,platform:'toutiao'}]}));
  await assert.rejects(call('begin_local_word_output',{...state.base,size:docx.length,sha256:hash(docx),chunks:1}));
});
await check('image plan freezes exact hash/anchor and remains immutable after output begins',async()=>{
  const state=await claimedJob();const first=await call('record_local_word_images',{...state.base,images:imagePlan()});const repeat=await call('record_local_word_images',{...state.base,images:imagePlan()});assert.equal(repeat.cached,true);assert.equal(repeat.layout_sha256,first.layout_sha256);
  for(const images of [imagePlan(0),imagePlan(2,alternateImage)])await assert.rejects(call('record_local_word_images',{...state.base,images}));
  await checkpoint(state,docx,'word');await call('begin_local_word_output',{...state.base,size:docx.length,sha256:hash(docx),chunks:1});assert.equal((await call('record_local_word_images',{...state.base,images:imagePlan()})).cached,true);
});
await check('raster fixture actually decodes and Word geometry preserves its 2:1 ratio and Heading1',async()=>{
  load('image-integrity').assertRasterImage(image);assert.equal(new DataView(image.buffer).getUint32(16),2);assert.equal(new DataView(image.buffer).getUint32(20),1);
  const verified=await layout.verifyLocalWordLayout(docx,source,[2]);assert.equal(verified.heading1_count,1);assert.equal(verified.image_count,1);assert.equal(verified.blank_paragraphs_preserved,true);assert.equal(verified.uncropped,true);assert.equal(verified.aspect_ratio_verified,true);
  assert.deepEqual(clone(await manifest.inspectWordImages(docx)),[{sha256:hash(image),after_paragraph:2}]);
});

let completed;
await check('chunk order/conflicts/incomplete output reject; exact duplicate chunks and identities resume',async()=>{
  completed=await startedJob(docx,{chunks:2});const same=await call('begin_local_word_output',{...completed.base,size:docx.length,sha256:hash(docx),chunks:2});assert.equal(same.output_id,completed.begun.output_id);
  for(const change of [{size:docx.length+1},{sha256:'a'.repeat(64)},{chunks:1}])await assert.rejects(call('begin_local_word_output',{...completed.base,size:docx.length,sha256:hash(docx),chunks:2,...change}));
  const cut=Math.floor(docx.length/2),first=Buffer.from(docx.subarray(0,cut)).toString('base64'),second=Buffer.from(docx.subarray(cut)).toString('base64');
  await assert.rejects(call('put_local_word_output_chunk',{...completed.upload,index:1,data_base64:second}));
  await call('put_local_word_output_chunk',{...completed.upload,index:0,data_base64:first});assert.equal((await call('put_local_word_output_chunk',{...completed.upload,index:0,data_base64:first})).duplicate,true);
  await assert.rejects(call('put_local_word_output_chunk',{...completed.upload,index:0,data_base64:btoa('conflicting offline mock bytes')}));
  await assert.rejects(call('finalize_local_word_output',{...completed.upload,execution:receipt()}));
  await call('put_local_word_output_chunk',{...completed.upload,index:1,data_base64:second});assert.equal((await call('read_local_word_job',{job_id:completed.job.id})).output.next_index,2);
});
await check('invalid upload metadata, base64, chunk bounds and oversized chunks reject',async()=>{
  const state=await startedJob();
  for(const args of [{index:-1,data_base64:'YQ=='},{index:1,data_base64:'YQ=='},{index:0,data_base64:'%'},{index:0,data_base64:''},{index:0,data_base64:Buffer.alloc(65537).toString('base64')},{index:0,data_base64:Buffer.alloc(docx.length+1).toString('base64')},{index:0,data_base64:'YQ==',output_id:randomUUID()}])await assert.rejects(call('put_local_word_output_chunk',{...state.upload,...args}));
  const fresh=await claimedJob();await call('record_local_word_images',{...fresh.base,images:imagePlan()});
  for(const args of [{size:0},{size:20000001},{sha256:'bad'},{chunks:0},{chunks:401}])await assert.rejects(call('begin_local_word_output',{...fresh.base,size:docx.length,sha256:hash(docx),chunks:1,...args}));
});
await check('execution receipt rejects absent, fabricated executor and extra fields; mock scope is honest',async()=>{
  for(const execution of [null,{...receipt(),executor:'automatic-model'},{...receipt(),execution_id:'bad'},{...receipt(),rendered_pages:0},{...receipt(),model:''},{...receipt(),verification_summary:''},{...receipt(),platform:'toutiao'},{...receipt(),verification_summary:completed.base.claim_token}])await assert.rejects(call('finalize_local_word_output',{...completed.upload,execution}));
});
await check('actual DOCX finalizes at word_completed, authenticates bytes, and preserves source/metadata',async()=>{
  const frozen=row(completed.job.id).input_json;const done=await call('finalize_local_word_output',{...completed.upload,execution:receipt()});assert.equal(done.terminal,true);assert.equal(done.platforms_allowed,false);assert.equal(done.job.state,'word_completed');assert.equal(done.job.word.ready,true);assert.equal(done.job.word.sha256,hash(docx));assert.equal(done.job.word.size,docx.length);
  const saved=row(completed.job.id);assert.equal(saved.input_json,frozen);assert.equal(saved.error,null);assert.equal(saved.destinations_json,'[]');
  const meta=JSON.parse(saved.output_meta);assert.equal(meta.execution.model,'offline-mock');assert.match(meta.execution.verification_summary,/no cloud executor or page renderer/);assert.match(meta.execution.attestation,/not_server_proven/);assert.equal(meta.verification.layout.heading1_count,1);assert.equal(meta.verification.layout.blank_paragraphs_preserved,true);
  const response=await core.downloadLocalWord(fixtureOwner(completed.job.id),completed.job.id);assert.equal(response.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.equal(response.headers.get('content-length'),String(docx.length));assert.equal(response.headers.get('x-word-sha256'),hash(docx));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),docx);
});
await check('actual Chinese UTF-8 title/body/blank/Heading1 survive immutable Word verification',async()=>{
  const unicode=['离线合成稿：原文保留','第一段。','','小标题','最后一段。'];const created=await core.createLocalWordJob(owner+'-unicode-'+randomUUID(),input({title:unicode[0],paragraphs:unicode.slice(1),source_sha256:hash(unicode.join('\n\n')),original_sha256:hash(JSON.stringify(unicode)),filename:'离线合成稿.docx'}));const claim=await call('claim_local_word_job',{job_id:created.job.id}),binding=await grantWord(created.job,claim),base={job_id:created.job.id,claim_token:claim.claim_token,execution_token:binding.execution_token},state={job:created.job,base};await imageCheckpoints(state,imagePlan());await call('record_local_word_images',{...base,images:imagePlan()});const bytes=word({text:unicode});await checkpoint(state,bytes,'word');const begun=await call('begin_local_word_output',{...base,size:bytes.length,sha256:hash(bytes),chunks:1}),upload={...base,output_id:begun.output_id};await call('put_local_word_output_chunk',{...upload,index:0,data_base64:Buffer.from(bytes).toString('base64')});const done=await call('finalize_local_word_output',{...upload,execution:receipt()});assert.equal(done.job.state,'word_completed');assert.equal(done.job.title,unicode[0]);assert.deepEqual(clone((await call('read_local_word_job',{job_id:created.job.id})).input.paragraphs),unicode.slice(1));
});
let leadingDocx;
await check('actual Word preserves two leading blanks and applies body Heading1 after their full-source offset',async()=>{
  const full=['','',...source],frozenInput=input({leading_blank_paragraphs:2,source_sha256:hash(full.join('\n\n')),original_sha256:hash(JSON.stringify(full))});leadingDocx=word({text:full,headings:[5],imageAfter:5});const state=await startedJob(leadingDocx,{frozenInput});await uploadOne(state);const done=await call('finalize_local_word_output',{...state.upload,execution:receipt()});assert.equal(done.job.state,'word_completed');assert.equal(row(state.job.id).leading_blank_paragraphs,2);const read=await call('read_local_word_job',{job_id:state.job.id});assert.equal(read.input.leading_blank_paragraphs,2);assert.deepEqual(clone(read.input.paragraphs),body);assert.equal(JSON.parse(row(state.job.id).output_meta).verification.layout.blank_paragraphs_preserved,true);assert.deepEqual(clone(await manifest.inspectWordImages(leadingDocx)),[{sha256:hash(image),after_paragraph:2}]);assert.deepEqual(new Uint8Array(await (await core.downloadLocalWord(fixtureOwner(state.job.id),state.job.id)).arrayBuffer()),leadingDocx);
});
await check('actual Word rejects omitted/extra leading blanks and unshifted Heading1',async()=>{
  const full=['','',...source];
  for(const options of [{text:source,headings:[3],imageAfter:3},{text:['','',...full.slice(1)],headings:[6],imageAfter:6},{text:full,headings:[3],imageAfter:5}]){const frozenInput=input({leading_blank_paragraphs:2,original_sha256:hash(JSON.stringify(full))});await invalidWord(options,{frozenInput});}
});
await check('completed task is terminal and repeated finalize is read-only, not a second output',async()=>{
  const before=JSON.stringify(row(completed.job.id)),count=objects.size;const repeated=await call('finalize_local_word_output',{...completed.upload,execution:receipt()});assert.equal(repeated.read_only,true);assert.equal(repeated.terminal,true);assert.equal(JSON.stringify(row(completed.job.id)),before);assert.equal(objects.size,count);assert.equal((await call('claim_local_word_job',{job_id:completed.job.id})).claimed,false);
  await assert.rejects(call('finalize_local_word_output',{...completed.upload,output_id:randomUUID(),execution:receipt()}));
  for(const [name,args] of [['fail_local_word_job',{message:'OFFLINE MOCK'}],['record_local_word_images',{images:imagePlan()}],['begin_local_word_output',{size:docx.length,sha256:hash(docx),chunks:2}],['put_local_word_output_chunk',{...completed.upload,index:0,data_base64:'YQ=='}]])await assert.rejects(call(name,{...completed.base,...args}));
  const wakesBefore=wakes.length;await call('retry_local_word_dispatch',{job_id:completed.job.id});assert.equal(wakes.length,wakesBefore);
});
await check('SQLite terminal trigger prevents completed output/manifest replacement or requeue',async()=>{
  const before=JSON.stringify(row(completed.job.id));
  for(const [field,value] of [['state','queued'],['result_key','replacement.docx'],['output_meta','{}'],['artifact_manifest','{}']])assert.throws(()=>sql.prepare('UPDATE local_word_jobs SET '+field+'=? WHERE id=?').run(value,completed.job.id),/local_word_terminal/);
  assert.equal(JSON.stringify(row(completed.job.id)),before);
});
await check('same article title receives distinct suggested Word filenames without overwriting jobs',async()=>{
  const second=await startedJob();await uploadOne(second);const done=await call('finalize_local_word_output',{...second.upload,execution:receipt()});assert.notEqual(done.job.word.filename,(await core.readLocalWordJob(fixtureOwner(completed.job.id),completed.job.id)).job.word.filename);assert.notEqual(row(second.job.id).result_key,row(completed.job.id).result_key);
});
await check('download rejects wrong owner, missing/tampered result bytes and restores same verified output',async()=>{
  await assert.rejects(core.downloadLocalWord(other,completed.job.id));const saved=row(completed.job.id),bytes=objects.get(saved.result_key);objects.delete(saved.result_key);await assert.rejects(core.downloadLocalWord(fixtureOwner(completed.job.id),completed.job.id));objects.set(saved.result_key,bytes.subarray(1));await assert.rejects(core.downloadLocalWord(fixtureOwner(completed.job.id),completed.job.id));const corrupt=bytes.slice();corrupt[20]^=1;objects.set(saved.result_key,corrupt);await assert.rejects(core.downloadLocalWord(fixtureOwner(completed.job.id),completed.job.id));objects.set(saved.result_key,bytes);assert.equal((await core.downloadLocalWord(fixtureOwner(completed.job.id),completed.job.id)).status,200);
});
await check('frozen total SHA rejects different bytes even when every part SHA is internally valid',async()=>{
  const state=await claimedJob();await call('record_local_word_images',{...state.base,images:imagePlan()});await checkpoint(state,docx,'word');await assert.rejects(call('begin_local_word_output',{...state.base,size:docx.length,sha256:'a'.repeat(64),chunks:1}));assert.equal(row(state.job.id).output_meta,null);assert.equal(row(state.job.id).result_key,null);
});
await check('part SHA validates stored R2 bytes and missing parts without regenerating output',async()=>{
  const state=await startedJob();await uploadOne(state);const part=JSON.parse(row(state.job.id).output_meta).parts[0],bytes=objects.get(part.key);objects.delete(part.key);await assert.rejects(call('finalize_local_word_output',{...state.upload,execution:receipt()}));const corrupt=bytes.slice();corrupt[10]^=1;objects.set(part.key,corrupt);await assert.rejects(call('finalize_local_word_output',{...state.upload,execution:receipt()}));objects.set(part.key,bytes);assert.equal((await call('begin_local_word_output',{...state.base,size:docx.length,sha256:hash(docx),chunks:1})).output_id,state.begun.output_id);assert.equal((await call('finalize_local_word_output',{...state.upload,execution:receipt()})).terminal,true);
});
await check('lease expiry during chunk storage fences the write and retains the same output/holder without regrant',async()=>{
  const state=await startedJob(),claimHash=row(state.job.id).claim_hash;let recovered;afterPut=async key=>{if(!key.includes('/output/'))return;afterPut=null;sql.prepare('UPDATE local_word_jobs SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',state.job.id);recovered=await call('claim_local_word_job',{job_id:state.job.id});};
  await assert.rejects(uploadOne(state));afterPut=null;assert.equal(recovered.claimed,false);assert.equal(row(state.job.id).claim_hash,claimHash);assert.equal(JSON.parse(row(state.job.id).output_meta).parts.length,0);assert.equal(JSON.parse(row(state.job.id).output_meta).output_id,state.begun.output_id);assert.equal(sql.prepare('SELECT count(*) AS n FROM word_serial_slots WHERE owner=?').get(fixtureOwner(state.job.id)).n,1);await assert.rejects(call('begin_local_word_output',{...state.base,size:docx.length,sha256:hash(docx),chunks:1}));
});
await check('lease expiry during final storage fences completion and prevents mainclaim replacement',async()=>{
  const state=await startedJob();await uploadOne(state);afterPut=async key=>{if(!key.includes('/result-'))return;afterPut=null;sql.prepare('UPDATE local_word_jobs SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',state.job.id);};await assert.rejects(call('finalize_local_word_output',{...state.upload,execution:receipt()}));afterPut=null;assert.equal(row(state.job.id).state,'processing');assert.equal(row(state.job.id).result_key,null);assert.equal((await call('claim_local_word_job',{job_id:state.job.id})).claimed,false);assert.equal(JSON.parse(row(state.job.id).output_meta).output_id,state.begun.output_id);assert.equal(sql.prepare('SELECT count(*) AS n FROM word_serial_slots WHERE owner=?').get(fixtureOwner(state.job.id)).n,1);
});
await check('malformed image bytes cannot become a ready checkpoint or a native image plan',async()=>{
  const malformed=image.slice();malformed[malformed.length-1]^=1;const state=await claimedJob(),plan=imagePlan(2,malformed);await assert.rejects(checkpoint(state,malformed,'image',{source_url:plan[0].source_url,source_title:plan[0].source_title,after_paragraph:2}));await assert.rejects(call('record_local_word_images',{...state.base,images:plan}));assert.equal(row(state.job.id).result_key,null);assert.equal(row(state.job.id).output_meta,null);
});
await check('ordered distinct embedded images preserve both exact hashes and nonempty anchors',async()=>{
  const files=unzipSync(word({imageAfter:0}));let xml=new TextDecoder().decode(files['word/document.xml']);const picture=xml.match(/<w:p><w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r><\/w:p>/)[0];xml=xml.replace('<w:sectPr>',picture.replaceAll('rIdImage','rIdAlternate')+'<w:sectPr>');files['word/document.xml']=strToU8(xml);files['word/_rels/document.xml.rels']=strToU8(new TextDecoder().decode(files['word/_rels/document.xml.rels']).replace('</Relationships>','<Relationship Id="rIdAlternate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/offline-alternate.png"/></Relationships>'));files['word/media/offline-alternate.png']=alternateImage;
  const bytes=zipSync(files),plan=[...imagePlan(0),...imagePlan(3,alternateImage)];const state=await startedJob(bytes,{plan});await uploadOne(state);const done=await call('finalize_local_word_output',{...state.upload,execution:receipt()});assert.equal(done.job.state,'word_completed');assert.equal(JSON.parse(row(state.job.id).output_meta).verification.image_count,2);
  files['word/document.xml']=strToU8(xml.replaceAll('rIdImage','rIdTemporary').replaceAll('rIdAlternate','rIdImage').replaceAll('rIdTemporary','rIdAlternate'));const swapped=await startedJob(zipSync(files),{plan});await uploadOne(swapped);await assert.rejects(call('finalize_local_word_output',{...swapped.upload,execution:receipt()}));assert.equal(row(swapped.job.id).result_key,null);
});
for(const [name,options] of [
  ['changed title',{text:['Altered title',...body]}],
  ['changed body',{text:[title,'Altered opening',...body.slice(1)]}],
  ['reordered paragraphs',{text:[title,body[3],body[1],body[2],body[0]]}],
  ['missing blank paragraph',{text:source.filter(Boolean),headings:[2],imageAfter:2}],
  ['added blank paragraph',{text:[...source,'']}],
  ['missing Heading1',{headings:[]}],
  ['wrong embedded raster hash',{bytes:alternateImage}],
  ['wrong image anchor',{imageAfter:0}],
  ['missing image',{omitImage:true}],
  ['floating image',{floating:true}],
  ['cropped image',{crop:1000}],
  ['stretched raster ratio',{stretch:true}],
  ['mismatched transform geometry',{transformMismatch:true}],
  ['rotated picture',{rotate:60000}],
  ['external image link',{external:true}],
  ['nonempty hidden header',{headerText:'Unexpected injected header'}],
])await check('actual DOCX rejects '+name,()=>invalidWord(options));
await check('active Word failure retains its holder until actual safe end; another owner remains independent',async()=>{
  const failed=await claimedJob();for(const message of ['',failed.base.claim_token,'OFFLINE\nMOCK','OFFLINE MOCK: synthetic unavailable image source'])await assert.rejects(call('fail_local_word_job',{...failed.base,message}));assert.equal(row(failed.job.id).state,'processing');const binding=executions.get(failed.job.id),current=await wordCore.wordRecoveryView(fixtureOwner(failed.job.id),'local_word',failed.job.id);const interruption=await wordCore.wordRecoveryCall(fixtureOwner(failed.job.id),'report_word_interruption',{...binding,epoch:current.epoch,reason:'repair_failed'});assert.equal(interruption.recovery.status,'waiting_safe_stop');assert.equal(row(failed.job.id).state,'processing');assert.equal((await call('claim_local_word_job',{job_id:failed.job.id})).claimed,false);assert.equal(sql.prepare('SELECT count(*) AS n FROM word_serial_slots WHERE owner=?').get(fixtureOwner(failed.job.id)).n,1);
  const next=await startedJob();await uploadOne(next);assert.equal((await call('finalize_local_word_output',{...next.upload,execution:receipt()})).job.state,'word_completed');assert.equal(row(failed.job.id).state,'processing');
});
await check('every old article/platform operation rejects both localword ID and its stripped UUID',async()=>{
  const before=protectedSnapshot();const names=['read_article','claim_article','record_article_images','begin_article_output','put_article_output_chunk','finalize_article_output','claim_article_delivery','record_article_delivery','reserve_article_upload','consume_article_upload','record_article_upload','record_article_status'];
  for(const id of [completed.job.id,completed.job.id.slice(10)])for(const name of names)await assert.rejects(articleTools.articleCall(owner,name,{article_id:id,claim_token:completed.base.claim_token,platform:'toutiao',state:'completed',destinations:['toutiao','zhihu']}));
  assert.equal(protectedSnapshot(),before);assert.equal(protectedSnapshot(),baseline);
});
await check('public error handling does not leak arbitrary storage, provider or private diagnostics',async()=>{
  assert.equal(core.localWordPublicError(new Error('PRIVATE_OFFLINE_STORAGE_TRACE')),core.localWordPublicError(null));assert.equal(core.localWordPublicError(new Error('PRIVATE_OFFLINE_STORAGE_TRACE')).includes('PRIVATE'),false);
  try{await core.readLocalWordJob(other,job.id);}catch(error){assert.equal(core.localWordPublicError(error),error.message);}
});

await check('queue mainclaim and actual Word grant stay separate; foreign Word executor cannot finalize synthetic DOCX',async()=>{
  const queueOwner='offline-queue-docx-owner',created=await core.createLocalWordJob(queueOwner,input()),executionId='codex/thread/offline-synthetic/run/word',key=randomUUID(),queue=load('local-word-queue');
  const grant=await queue.localWordQueueCall(queueOwner,'claim_pending_local_word_job',{claim_request_key:key,execution_id:executionId});assert.equal(grant.new_execution_grant,true);assert.equal(grant.job_id,created.job.id);const base={job_id:created.job.id,claim_token:grant.claim_token};
  await assert.rejects(core.localWordCall(queueOwner,'record_local_word_images',{...base,images:imagePlan()}));
  const binding=await grantWord(created.job,grant);base.execution_token=binding.execution_token;const state={job:created.job,base};await imageCheckpoints(state,imagePlan());await core.localWordCall(queueOwner,'record_local_word_images',{...base,images:imagePlan()});await checkpoint(state,docx,'word');const upload=await core.localWordCall(queueOwner,'begin_local_word_output',{...base,size:docx.length,sha256:hash(docx),chunks:1});const args={...base,output_id:upload.output_id};await core.localWordCall(queueOwner,'put_local_word_output_chunk',{...args,index:0,data_base64:Buffer.from(docx).toString('base64')});
  await assert.rejects(core.localWordCall(queueOwner,'finalize_local_word_output',{...args,execution:{...receipt(),execution_id:executionId}}));
  await assert.rejects(core.localWordCall(queueOwner,'finalize_local_word_output',{...args,execution:{...receipt(),execution_id:randomUUID()}}));
  const done=await core.localWordCall(queueOwner,'finalize_local_word_output',{...args,execution:{...receipt(),execution_id:binding.execution_id}});assert.equal(done.job.state,'word_completed');assert.equal(JSON.parse(row(created.job.id).output_meta).execution.execution_id,binding.execution_id);
  const recovered=await queue.localWordQueueCall(queueOwner,'read_local_word_claim_receipt',{claim_request_key:key,execution_id:executionId});assert.equal(recovered.claimed,false);assert.equal('claim_token' in recovered,false);assert.equal((await queue.localWordQueueCall(queueOwner,'claim_pending_local_word_job',{claim_request_key:randomUUID(),execution_id:executionId})).status,'empty');assert.equal(protectedSnapshot(),baseline);
});

await check('write labelled real DOCX artifact and JSON evidence only after byte verification',async()=>{
  fs.mkdirSync('.local-word-test-output',{recursive:true});const path='.local-word-test-output/backend-synthetic.docx';fs.writeFileSync(path,docx);const files=unzipSync(fs.readFileSync(path));assert.ok(new TextDecoder().decode(files['word/document.xml']).includes('OFFLINE MOCK'));
  fs.writeFileSync('.local-word-test-output/backend-synthetic.evidence.json',JSON.stringify({fixture:'OFFLINE MOCK synthetic article and generated 2x1 test PNG; not real image research',file:path,size:docx.length,sha256:hash(docx),source_sha256:hash(rawSource),original_sha256:hash(JSON.stringify(source)),image_sha256:hash(image),migration_count:migrations.length,paragraphs:source,subheading_indices:[2],after_paragraph:2,receipt_scope:'offline-mock; no cloud executor or render process run',protected_tables_unchanged:protectedSnapshot()===baseline,test_groups:groups+1},null,2)+'\n');
  const leadingPath='.local-word-test-output/backend-leading-blanks-synthetic.docx';fs.writeFileSync(leadingPath,leadingDocx);fs.writeFileSync('.local-word-test-output/backend-leading-blanks-synthetic.evidence.json',JSON.stringify({fixture:'OFFLINE MOCK synthetic article with two leading blank paragraphs and generated 2x1 test PNG',file:leadingPath,size:leadingDocx.length,sha256:hash(leadingDocx),leading_blank_paragraphs:2,paragraphs:['','',...source],subheading_indices:[2],heading1_full_source_index:5,after_paragraph:2,receipt_scope:'offline-mock; no cloud executor or render process run'},null,2)+'\n');
  const tools=load('local-word-tools');fs.writeFileSync('.local-word-test-output/local-word-tools-schema.json',JSON.stringify({localWordTools:tools.localWordTools,localWordEvent:tools.localWordEvent},null,2)+'\n');
});
sql.close();
console.log(`PASS ${groups} offline local Word groups; ${migrations.length} real SQLite migrations, actual DOCX/PNG inspection, mock R2/fetch only. No cloud/model/render/publication run.`);
