// Local source access only. Never scans directories, logs paths, or follows
// caller-controlled symlinks. Linux directory descriptors bind every segment.
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';

export const IMPORT_SOURCE_LIMITS=Object.freeze({maxFileBytes:1048576,maxEntryBytes:4194304,maxLines:20000});
export const IMPORT_CONFIG_LIMITS=Object.freeze({maxConfigBytes:262144,maxLines:20000});
const sources=Object.freeze({timelog:'timelog.txt',check:'check.md',title:'title.txt',article:'article.txt'});
const optional=Object.freeze({used_topics:'used_topics.txt',used_samples:'used_samples.txt'});
const emptySummary=()=>({present:false,bytes:null,sha256:null,lines:null});
const readerCodes=new Set(['UNSAFE_PATH','UNSUPPORTED_PLATFORM','SYMLINK','NOT_DIRECTORY','NOT_REGULAR','HARDLINK',
  'CHANGED','TOO_LARGE','TOTAL_TOO_LARGE','TOO_MANY_LINES','INVALID_UTF8','MISSING','UNREADABLE','LIMIT_INVALID','ROOT_INVALID']);
function fault(code){const error=new Error('Local source rejected');error.readerCode=code;throw error;}
function safeCode(error) {
  if(readerCodes.has(error?.readerCode))return error.readerCode;
  if(error?.code==='ENOENT')return 'MISSING';
  if(error?.code==='ELOOP')return 'SYMLINK';
  if(error?.code==='ENOTDIR')return 'NOT_DIRECTORY';
  return 'UNREADABLE';
}
const issue=(prefix,code,source)=>({code:prefix+'_'+code,source,line:null,field:null,
  severity:code==='MISSING'?'warning':'error'});
function limitsFor(input,defaults) {
  const result={...defaults};
  for(const key of Object.keys(defaults))if(input?.[key]!==undefined) {
    if(!Number.isSafeInteger(input[key])||input[key]<1||input[key]>defaults[key])fault('LIMIT_INVALID');
    result[key]=input[key];
  }
  return result;
}
function segments(value,{absolute=false}={}) {
  if(typeof value!=='string'||!value||/[\\:\u0000-\u001f\u007f]/u.test(value)||
    absolute!==isAbsolute(value))fault('UNSAFE_PATH');
  const parts=(absolute?value.slice(1):value).split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))fault('UNSAFE_PATH');
  return parts;
}
function absoluteSegments(value) {
  // A relative selected config path is resolved only after rejecting dot/drive
  // ambiguity; source roots themselves must be explicit absolute paths.
  if(typeof value!=='string'||!value)fault('UNSAFE_PATH');
  segments(value,{absolute:isAbsolute(value)});
  return segments(resolve(value),{absolute:true});
}
const descriptorPath=(handle,name)=>'/proc/self/fd/'+handle.fd+'/'+name;
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
const sameFile=(a,b)=>identity(a,b)&&a.size===b.size&&a.nlink===b.nlink&&
  a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function closeChain(chain) {for(const item of [...chain].reverse())await item.handle.close().catch(()=>{});}
function supported() {
  if(process.platform!=='linux'||!constants.O_NOFOLLOW||!constants.O_DIRECTORY)fault('UNSUPPORTED_PLATFORM');
}
async function openDirectories(parts) {
  supported();const chain=[];
  try {
    const handle=await open('/',constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    chain.push({handle,stat:await handle.stat({bigint:true}),segment:null});
    for(const segment of parts) {
      const path=descriptorPath(chain.at(-1).handle,segment),before=await lstat(path,{bigint:true});
      if(before.isSymbolicLink())fault('SYMLINK');
      if(!before.isDirectory())fault('NOT_DIRECTORY');
      const next=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      const stat=await next.stat({bigint:true});chain.push({handle:next,stat,segment});
      if(!identity(before,stat))fault('CHANGED');
    }
    return chain;
  } catch(error){await closeChain(chain);throw error;}
}
async function verifyChain(chain) {
  let fresh;
  try {
    fresh=await openDirectories(chain.slice(1).map(item=>item.segment));
    if(fresh.length!==chain.length||fresh.some((item,index)=>!identity(item.stat,chain[index].stat)))fault('CHANGED');
  } catch {fault('CHANGED');}
  finally {if(fresh)await closeChain(fresh);}
}
function lineCount(text) {
  if(text==='')return 0;
  const count=(text.match(/\r\n|\r|\n/g)||[]).length;
  return count+(/(?:\r\n|\r|\n)$/.test(text)?0:1);
}

async function readBoundedFile(parts,name,{source,maxBytes,remaining,maxLines},hooks={}) {
  let chain,handle,bytes=0;
  try {
    chain=await openDirectories(parts);const path=descriptorPath(chain.at(-1).handle,name);
    const before=await lstat(path,{bigint:true});
    if(before.isSymbolicLink())fault('SYMLINK');
    if(!before.isFile())fault('NOT_REGULAR');
    if(before.nlink!==1n)fault('HARDLINK');
    if(before.size>BigInt(maxBytes))fault('TOO_LARGE');
    if(before.size>BigInt(remaining))fault('TOTAL_TOO_LARGE');
    // Trusted test hooks are not configuration fields and are never passed by
    // the CLI. They deterministically exercise races with synthetic files.
    await hooks.beforeOpen?.({source});
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const opened=await handle.stat({bigint:true});
    if(!opened.isFile())fault('NOT_REGULAR');
    if(!sameFile(before,opened))fault('CHANGED');
    if(opened.nlink!==1n)fault('HARDLINK');
    await hooks.afterOpen?.({source});
    const chunks=[];
    for(;;) {
      // At most one extra byte is read to detect growth beyond the remaining
      // budget. Failed/invalid reads are charged too, not only retained text.
      const capacity=Math.min(65536,maxBytes-bytes+1,remaining-bytes+1);
      if(capacity<1)fault('TOTAL_TOO_LARGE');
      const buffer=Buffer.allocUnsafe(capacity),result=await handle.read(buffer,0,buffer.length,null);
      if(!result.bytesRead)break;
      bytes+=result.bytesRead;
      if(bytes>maxBytes)fault('TOO_LARGE');
      if(bytes>remaining)fault('TOTAL_TOO_LARGE');
      chunks.push(buffer.subarray(0,result.bytesRead));
    }
    await hooks.afterRead?.({source});
    const after=await handle.stat({bigint:true});
    if(!sameFile(opened,after)||after.size!==BigInt(bytes))fault('CHANGED');
    await verifyChain(chain);
    const atName=await lstat(path,{bigint:true});
    if(!sameFile(after,atName)||atName.isSymbolicLink())fault('CHANGED');
    const raw=Buffer.concat(chunks,bytes);let text;
    try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}catch{fault('INVALID_UTF8');}
    const lines=lineCount(text);if(lines>maxLines)fault('TOO_MANY_LINES');
    return {text,summary:{present:true,bytes,lines,sha256:createHash('sha256').update(raw).digest('hex')}};
  } catch(error) {
    const failure=new Error('Local source rejected');
    failure.readerCode=safeCode(error);failure.readerBytes=bytes;throw failure;
  } finally {
    if(handle)await handle.close().catch(()=>{});
    if(chain)await closeChain(chain);
  }
}

export async function readImportEntry({root,entry,limits}={},hooks={}) {
  const files=Object.fromEntries([...Object.keys(sources),...Object.keys(optional)].map(key=>[key,null]));
  const source_summary=Object.fromEntries(Object.keys(files).map(key=>[key,emptySummary()])),issues=[];
  let base,paths,cap;
  try {
    cap=limitsFor(limits,IMPORT_SOURCE_LIMITS);base=segments(root,{absolute:true});
    const directory=segments(entry?.directory);
    paths=Object.fromEntries(Object.entries(sources).map(([key,name])=>[key,[...directory,name]]));
    for(const [key,name]of Object.entries(optional))if(entry?.[key]!==undefined&&entry[key]!==null) {
      paths[key]=segments(entry[key]);if(paths[key].at(-1)!==name)fault('UNSAFE_PATH');
    }
    let chain;try{chain=await openDirectories(base);}catch(error){if(safeCode(error)==='MISSING')fault('ROOT_INVALID');throw error;}
    finally{if(chain)await closeChain(chain);}
  } catch(error){issues.push(issue('SOURCE',safeCode(error),'config'));return {files,issues,source_summary,bytes_read:0};}
  let used=0;
  for(const [source,path]of Object.entries(paths)) {
    try {
      const result=await readBoundedFile([...base,...path.slice(0,-1)],path.at(-1),
        {source,maxBytes:cap.maxFileBytes,remaining:cap.maxEntryBytes-used,maxLines:cap.maxLines},hooks);
      files[source]=result.text;source_summary[source]=result.summary;used+=result.summary.bytes;
    } catch(error){used+=error.readerBytes||0;issues.push(issue('SOURCE',safeCode(error),source));}
  }
  return {files,issues,source_summary,bytes_read:used};
}

export async function readImportConfig({path,limits}={},hooks={}) {
  try {
    const cap=limitsFor(limits,IMPORT_CONFIG_LIMITS),parts=absoluteSegments(path);
    const result=await readBoundedFile(parts.slice(0,-1),parts.at(-1),
      {source:'config',maxBytes:cap.maxConfigBytes,remaining:cap.maxConfigBytes,maxLines:cap.maxLines},hooks);
    return {text:result.text,issues:[],source_summary:result.summary,bytes_read:result.summary.bytes};
  } catch(error){return {text:null,issues:[issue('CONFIG',safeCode(error),'config')],source_summary:emptySummary(),bytes_read:error.readerBytes||0};}
}
