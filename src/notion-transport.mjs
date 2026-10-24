import {createHash} from 'node:crypto';

const api='https://api.notion.com/v1',version='2026-03-11';
const sections=['todos','templates','accounts','articles','observations','daily_metrics'];
const format='haoduoyu-business-snapshot-v1',titlePrefix='好多鱼业务快照 ';
const business={sections,format,titlePrefix,seal:'haoduoyu-snapshot-complete',legacy:'业务快照'};
const dailyNotes={sections:['notes'],format:'haoduoyu-daily-notes-v1',titlePrefix:'碎碎念 ',seal:'haoduoyu-daily-notes-complete',legacy:'碎碎念'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{
  if(typeof value!=='string'||!/^([a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value))throw Error();
  return value.replaceAll('-','').toLowerCase();
};
const plain=block=>{
  if(block?.type!=='paragraph'||block.has_children)return null;
  const text=block.paragraph?.rich_text;
  if(!Array.isArray(text)||text.some(r=>r.type!=='text'||typeof r.text?.content!=='string'))return null;
  return text.map(r=>r.text.content).join('');
};
const block=text=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:text}}]}});
const stable=value=>{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
};
function chunks(text) {
  const result=[];let part='';
  for(const char of text) {if(part.length+char.length>1800){result.push(part);part='';}part+=char;}
  if(part)result.push(part);return result;
}
function content(snapshot,{sections,format}) {
  if(!snapshot||snapshot.snapshot_format!==format||snapshot.timezone!=='Asia/Shanghai'||
    !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)||!Number.isFinite(Date.parse(snapshot.date+'T00:00:00Z'))||
    new Date(snapshot.date+'T00:00:00Z').toISOString().slice(0,10)!==snapshot.date||
    !/^[a-f\d]{64}$/.test(snapshot.content_hash)||typeof snapshot.generated_at!=='string'||!Number.isFinite(Date.parse(snapshot.generated_at))||
    sections.some(k=>!Array.isArray(snapshot[k])))throw Error();
  const data=Object.fromEntries(sections.map(k=>[k,snapshot[k].map(stable).sort((a,b)=>{
    const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;
  })]));
  const encoded=JSON.stringify(stable(data));
  if(Buffer.byteLength(encoded)>128*1024)throw Error();
  // Defense in depth: only business arrays are read; credential-shaped fields are rejected.
  const inspect=(value,depth=0)=>{
    if(depth>12)throw Error();
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)) {
      if(/password|passwd|secret|token|session|csrf|api[_-]?key|authorization|security_config/i.test(key))throw Error();
      inspect(item,depth+1);
    }
  };
  inspect(data);
  if(format===dailyNotes.format&&(data.notes.length!==1||data.notes.some(row=>!row||row.date!==snapshot.date||
    typeof row.text!=='string'||Buffer.byteLength(row.text)>65536||!['active','cleared','deleted'].includes(row.state)||
    Object.keys(row).sort().join(',')!=='date,state,text'||(row.state!=='active'&&row.text!==''))))throw Error();
  const counts=Object.fromEntries(sections.map(k=>[k,data[k].length]));
  const texts=[`date: ${snapshot.date}\ntimezone: ${snapshot.timezone}\ncontent_hash: ${snapshot.content_hash}`,
    'counts: '+JSON.stringify(counts)];
  for(const name of sections) {
    texts.push(name+': '+counts[name]);
    for(const [i,row] of data[name].entries())texts.push(...chunks(name+'['+(i+1)+']: '+JSON.stringify(stable(row))));
  }
  if(texts.length>600)throw Error();
  return {texts,counts};
}

/** Read+Insert only. No automatic write retries, page updates or deletes. */
async function pushSnapshot({token,parentId,snapshot,previousDelivery,fetchImpl=fetch,requestBudget},protocol) {
  const {format,titlePrefix,seal,legacy}=protocol;
  let requests=0,uncertainWrite=false;
  const error=(code,retryAfter)=>{
    const e=new Error('Notion snapshot operation did not complete.');
    e.code=code;e.uncertainWrite=uncertainWrite;
    if(retryAfter!==undefined){e.retryAfter=retryAfter;e.retryable=true;}
    return e;
  };
  try {
    let parent,body,previous;
    try {
      parent=id(parentId);
      if(typeof token!=='string'||!token||token.length>4096||/[\r\n]/.test(token))throw Error();
      body=content(snapshot,protocol);
      if(previousDelivery) {
        previous={...previousDelivery,page_id:id(previousDelivery.page_id)};
        if(!Number.isSafeInteger(previous.version)||previous.version<1||previous.version>999999||
          !/^[a-f0-9]{64}$/.test(previous.content_hash))throw Error();
      }
    }catch {throw error('NOTION_INVALID_SNAPSHOT');}
    const request=async(path,{method='GET',payload}={})=>{
      if(requests>=40||requestBudget&&(!Number.isSafeInteger(requestBudget.remaining)||requestBudget.remaining<1))throw error('NOTION_BUDGET');
      const serialized=payload===undefined?undefined:JSON.stringify(payload);
      if(serialized&&Buffer.byteLength(serialized)>400*1024)throw error('NOTION_TOO_LARGE');
      requests++;
      if(requestBudget)requestBudget.remaining--;
      if(method!=='GET')uncertainWrite=true;
      let response;
      try {response=await fetchImpl(api+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),
        headers:{Authorization:'Bearer '+token,'Notion-Version':version,'Content-Type':'application/json'},body:serialized});}
      catch {throw error(method==='GET'?'NOTION_UNAVAILABLE':'NOTION_UNKNOWN');}
      if(response.status===429||response.status===529) {
        const raw=response.headers.get('Retry-After'),wait=/^\d{1,6}$/.test(raw||'')?Math.min(86400,Math.max(1,Number(raw))):60;
        try {await response.body?.cancel();}catch {}
        throw error('NOTION_RATE_LIMIT',wait);
      }
      if(!response.ok) {
        try {await response.body?.cancel();}catch {}
        throw error(method!=='GET'&&response.status>=500?'NOTION_UNKNOWN':'NOTION_UNAVAILABLE');
      }
      const reader=response.body?.getReader();let size=0;const bytes=[];
      try {
        if(!reader||Number(response.headers.get('Content-Length')||0)>512*1024)throw Error();
        for(;;) {
          const {value,done}=await reader.read();if(done)break;
          size+=value.byteLength;if(size>512*1024)throw Error();bytes.push(value);
        }
        return JSON.parse(Buffer.concat(bytes).toString('utf8'));
      }catch {try {await reader?.cancel();}catch {}throw error(method==='GET'?'NOTION_RESPONSE_LIMIT':'NOTION_UNKNOWN');}
    };
    const list=async blockId=>{
      const all=[],seen=new Set();let cursor;
      do {
        const query=new URLSearchParams({page_size:'100'});if(cursor)query.set('start_cursor',cursor);
        const page=await request('/blocks/'+id(blockId)+'/children?'+query);
        if(!Array.isArray(page.results)||page.results.length>100||typeof page.has_more!=='boolean')throw error('NOTION_RESPONSE_LIMIT');
        all.push(...page.results);
        if(!page.has_more) {
          if(page.next_cursor!==null&&page.next_cursor!==undefined)throw error('NOTION_RESPONSE_LIMIT');
          return all;
        }
        cursor=page.next_cursor;
        if(typeof cursor!=='string'||!cursor||cursor.length>256||seen.has(cursor))throw error('NOTION_RESPONSE_LIMIT');
        seen.add(cursor);
      }while(true);
    };
    const marker=v=>`${format}|date=${snapshot.date}|hash=${snapshot.content_hash}|version=${v}`;
    const texts=v=>[marker(v),...body.texts,`${seal}|sha256=${sha(JSON.stringify(body.texts))}|blocks=${body.texts.length+2}`];
    const inspect=blocks=>{
      const actual=blocks.map(plain);
      if(actual.some(x=>x===null))throw error('NOTION_INCOMPLETE');
      const first=new RegExp('^'+format+'\\|date=(\\d{4}-\\d{2}-\\d{2})\\|hash=([a-f\\d]{64})\\|version=([1-9]\\d*)$').exec(actual[0]||'');
      const last=new RegExp('^'+seal+'\\|sha256=([a-f\\d]{64})\\|blocks=(\\d+)$').exec(actual.at(-1)||'');
      if(!first||!last||Number(last[2])!==actual.length||last[1]!==sha(JSON.stringify(actual.slice(1,-1))))throw error('NOTION_INCOMPLETE');
      return {date:first[1],hash:first[2],version:Number(first[3]),actual};
    };
    const candidates=async()=>{
      const result=[],seen=new Set();
      for(const entry of await list(parent)) {
        if(entry.type!=='child_page')continue;
        const title=entry.child_page?.title||'';
        if(!title.startsWith(titlePrefix+snapshot.date+' v')) {
          if(title.includes(snapshot.date)&&title.includes(legacy)&&id(entry.id)!==previous?.page_id)
            throw error('NOTION_LEGACY_CONFLICT');
          continue;
        }
        const number=title.slice((titlePrefix+snapshot.date+' v').length);
        if(!/^[1-9]\d{0,5}$/.test(number))continue;
        const pageId=id(entry.id);if(seen.has(pageId))throw error('NOTION_RESPONSE_LIMIT');seen.add(pageId);
        result.push({pageId,version:Number(number)});
      }
      return result;
    };
    const same=(actual,expected)=>actual.length===expected.length&&actual.every((s,i)=>s===expected[i]);
    const result=(pageId,v,status)=>({status,page_id:pageId,version:v,verified:true,
      page_url:'https://www.notion.so/'+pageId,content_hash:snapshot.content_hash,counts:body.counts,requests});
    let latest=0,latestPage;
    const versions=new Set();
    const existing=await candidates(),knownIds=new Set(existing.map(c=>c.pageId));
    if(previous&&!knownIds.has(previous.page_id)) {
      const page=await request('/pages/'+previous.page_id);
      let actualParent;try {actualParent=id(page.parent?.page_id);}catch {throw error('NOTION_INCOMPLETE');}
      if(actualParent!==parent||page.archived===true||page.in_trash===true)throw error('NOTION_INCOMPLETE');
      existing.push({pageId:previous.page_id,version:previous.version});knownIds.add(previous.page_id);
    }
    for(const candidate of existing) {
      const old=inspect(await list(candidate.pageId));
      if(old.date!==snapshot.date||old.version!==candidate.version)throw error('NOTION_INCOMPLETE');
      if(candidate.pageId===previous?.page_id&&(old.version!==previous.version||old.hash!==previous.content_hash))
        throw error('NOTION_INCOMPLETE');
      if(versions.has(old.version))throw error('NOTION_UNKNOWN');versions.add(old.version);
      if(old.version>latest){latest=old.version;latestPage={old,pageId:candidate.pageId};}
    }
    if(latestPage?.old.hash===snapshot.content_hash) {
      if(!same(latestPage.old.actual,texts(latest)))throw error('NOTION_INCOMPLETE');
      return result(latestPage.pageId,latest,'skipped');
    }
    const next=latest+1,expected=texts(next),blocks=expected.map(block),groups=[];
    if(next>999999)throw error('NOTION_TOO_LARGE');
    for(let i=0;i<blocks.length;i+=50)groups.push(blocks.slice(i,i+50));
    const needed=groups.length+Math.ceil(blocks.length/100)+2;
    if(requests+needed>40||requestBudget&&requestBudget.remaining<needed)throw error('NOTION_BUDGET');
    const reconcile=async()=>{
      const matches=[];
      for(const candidate of await candidates())if(candidate.version===next) {
        const read=await list(candidate.pageId);
        if(plain(read[0])===marker(next))matches.push({candidate,read});
      }
      if(matches.length!==1)throw error('NOTION_UNKNOWN');
      const found=matches[0],complete=inspect(found.read);
      if(!same(complete.actual,expected))throw error('NOTION_INCOMPLETE');
      return result(found.candidate.pageId,next,latest?'versioned':'created');
    };
    let pageId;
    try {
      const created=await request('/pages',{method:'POST',payload:{parent:{type:'page_id',page_id:parent},
        properties:{title:{type:'title',title:[{type:'text',text:{content:titlePrefix+snapshot.date+' v'+next}}]}},children:groups[0]}});
      try {pageId=id(created.id);if(pageId===parent||knownIds.has(pageId))throw Error();}catch {throw error('NOTION_UNKNOWN');}
    }catch(e) {if(e.code==='NOTION_UNKNOWN')return await reconcile();throw e;}
    for(const group of groups.slice(1)) {
      try {await request('/blocks/'+pageId+'/children',{method:'PATCH',payload:{children:group}});}
      catch(e) {if(e.code==='NOTION_UNKNOWN')return await reconcile();throw e;}
    }
    const read=inspect(await list(pageId));
    if(!same(read.actual,expected))throw error('NOTION_INCOMPLETE');
    return result(pageId,next,latest?'versioned':'created');
  }catch(e) {
    if(e?.code?.startsWith('NOTION_')&&typeof e.uncertainWrite==='boolean')throw e;
    throw error('NOTION_UNAVAILABLE');
  }
}

export const pushNotionSnapshot=options=>pushSnapshot(options,business);
export const pushNotionNote=options=>pushSnapshot(options,dailyNotes);
