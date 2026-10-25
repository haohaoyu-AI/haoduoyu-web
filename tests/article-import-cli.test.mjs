// CLI-only synthetic fixtures. No user manuscript, production host or real token.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {runImportCli} from '../scripts/article-import.mjs';

const execute=promisify(execFile);
const repository=fileURLToPath(new URL('../',import.meta.url));
const cli=fileURLToPath(new URL('../scripts/article-import.mjs',import.meta.url));
const title='黄婷婷九年没提的名字，被一句“更容易做朋友”说死了';
const bodyMarker='SYNTHETIC_MANUSCRIPT_NEVER_EXPORT_7348';
const token=Buffer.from('synthetic test capability; never a real credential').toString('base64url');
const defaults={directory:'tt/tt1_1024',run_dir:'tt1_1024',account_id:'toutiao-haoduoyu',platform:'toutiao',slot:'tt1',
  run_date:'2026-10-24',source_timezone:'Asia/Shanghai',writer:'dedao',illustrator:'codex'};
const log=[
  '2026-10-24 08:00:00 流水线 开始：合成流程',
  '2026-10-24 08:01:00 写作 开始：合成写作',
  '2026-10-24 08:10:00 写作 结束：合成写作结束',
  '2026-10-24 08:10:00 配图 开始：合成配图',
  '2026-10-24 08:20:00 配图 结束：图数=25',
  '2026-10-24 08:20:00 导入 开始：合成导入',
  '2026-10-24 08:30:00 导入 结束：草稿已存 pgc_id=7699934907375567402',
  '2026-10-24 08:31:00 流水线 结束：合成流程结束',
].join('\n');

async function fixture(t,entries=[defaults]) {
  const directory=await mkdtemp(join(tmpdir(),'SYNTHETIC_PRIVATE_IMPORT_ROOT_'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=join(directory,'selected'),config=join(directory,'selected-config.json');
  await mkdir(root);
  for(const entry of entries) {
    const folder=join(root,entry.directory);await mkdir(folder,{recursive:true});
    await Promise.all([
      writeFile(join(folder,'timelog.txt'),log),writeFile(join(folder,'title.txt'),title+'\n'),
      writeFile(join(folder,'check.md'),'- 字数: 2236\n- 小标题: 5\n- 图数: 25\n- watchdog 重跑次数: 1\n'),
      writeFile(join(folder,'article.txt'),bodyMarker+'\n合成正文，不能作为台账 notes 或日志上传。\n'),
    ]);
  }
  const save=async value=>writeFile(config,JSON.stringify(value));
  await save({format:'haoduoyu-article-import-config-v1',entries});
  return {directory,root,config,save};
}

async function run(args,env={}) {
  const settings={cwd:repository,env:{...process.env,...env},timeout:20000,maxBuffer:2*1024*1024};
  if(!Object.hasOwn(env,'HAODUOYU_IMPORT_TOKEN'))delete settings.env.HAODUOYU_IMPORT_TOKEN;
  try {const result=await execute(process.execPath,[cli,...args],settings);return {code:0,...result};}
  catch(error) {
    if(typeof error.code!=='number')throw error;
    return {code:error.code,stdout:error.stdout||'',stderr:error.stderr||''};
  }
}
const selected=f=>['--config',f.config,'--root',f.root];
const parsed=result=>JSON.parse(result.stdout.trim());
function sanitized(result,f) {
  const output=result.stdout+'\n'+result.stderr;
  assert.ok(!output.includes(bodyMarker),'manuscript body must not be emitted');
  assert.ok(!output.includes(f.directory),'private source/config paths must not be emitted');
  assert.ok(!output.includes(token),'environment credential must not be emitted');
}

async function mockService(t) {
  const state={requests:[],rows:[],patches:0};
  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://localhost');let text='';
    for await(const chunk of request)text+=chunk;
    state.requests.push({method:request.method,url:url.pathname+url.search,authorization:request.headers.authorization,body:text});
    response.setHeader('Content-Type','application/json');
    if(request.headers.authorization!=='Bearer '+token){response.writeHead(401);response.end(JSON.stringify({error:{code:'UNAUTHORIZED'}}));return;}
    if(request.method==='GET'&&url.pathname==='/api/v1/articles') {
      const status=url.searchParams.get('status'),account=url.searchParams.get('account_id');
      const page=Number(url.searchParams.get('page')),page_size=Number(url.searchParams.get('page_size'));
      const rows=state.rows.filter(row=>row.status===status&&row.account_id===account),offset=(page-1)*page_size;
      response.end(JSON.stringify({data:rows.slice(offset,offset+page_size),meta:{total:rows.length,page,page_size,offset,has_more:offset+page_size<rows.length}}));return;
    }
    if(request.method==='GET'&&url.pathname.startsWith('/api/v1/articles/')) {
      const row=state.rows.find(item=>item.id===url.pathname.split('/').at(-1));
      response.writeHead(row?200:404);response.end(JSON.stringify(row?{data:row}:{error:{code:'NOT_FOUND'}}));return;
    }
    if(request.method==='PATCH'&&url.pathname==='/api/v1/articles') {
      state.patches++;const payload=JSON.parse(text);
      assert.equal(payload.version,0);assert.ok(request.headers['idempotency-key']);
      const row={...payload,id:randomUUID(),version:1,status:payload.status||'draft_saved',slot:payload.slot??null,
        run_date:payload.run_date??null,run_dir:payload.run_dir??null,url:payload.url??null,published_at:payload.published_at??null,
        platform:'toutiao',upsert_action:'created'};
      state.rows.push(row);response.writeHead(201);response.end(JSON.stringify({data:row}));return;
    }
    response.writeHead(404);response.end(JSON.stringify({error:{code:'NOT_FOUND'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {state,origin:'http://127.0.0.1:'+server.address().port};
}

test('default dry-run is fully offline and projects the explicit synthetic tt1_1024 without body or path leakage',async t=>{
  const f=await fixture(t);let requests=0;
  const result=await run(selected(f),{HAODUOYU_IMPORT_TOKEN:token});
  assert.equal(result.code,0);sanitized(result,f);
  const guarded=await runImportCli(selected(f),{
    env:new Proxy({},{get(){throw Error('Dry-run must not access credentials');}}),
    fetchImpl(){requests++;throw Error('Dry-run must not contact a remote target');},
  });
  assert.equal(guarded.exitCode,0);assert.deepEqual(guarded.result,parsed(result));
  assert.equal(requests,0,'dry-run must not even read the remote target');
  const report=parsed(result);assert.equal(report.format,'haoduoyu-article-import-plan-v1');assert.equal(report.mode,'dry-run');
  const row=report.entries[0];assert.equal(row.entry_id,'tt1_1024');assert.equal(row.action,'candidate');
  assert.equal(row.record.run_date,'2026-10-24');assert.equal(row.record.started_at,'2026-10-24T00:00:00.000Z');
  assert.equal(row.record.title,title);assert.equal(row.record.char_count,2236);assert.equal(row.record.subheading_count,5);
  assert.equal(row.record.image_count,25);assert.equal(row.record.draft_ref.pgc_id,'7699934907375567402');
  assert.equal(row.record.status,'draft_saved');assert.deepEqual(row.warnings,[]);
  assert.equal(row.record.url,null);assert.equal(row.record.published_at,null);
  assert.ok(!Object.hasOwn(row.proposal,'url'));assert.ok(!Object.hasOwn(row.proposal,'published_at'));
  assert.ok(row.provenance.char_count.every(item=>item.source==='check'));
  assert.match(row.source_summary.article.sha256,/^[a-f0-9]{64}$/);
});

test('unparsed counts remain null with issues and are omitted from a proposed PATCH rather than clearing fields',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.root,defaults.directory,'check.md'),'- 字数: 不知道\n- 图数: 25\n');
  const result=await run([...selected(f),'--dry-run']);sanitized(result,f);
  const row=parsed(result).entries[0];assert.equal(row.record.char_count,null);assert.equal(row.record.subheading_count,null);
  assert.ok(!Object.hasOwn(row.proposal,'char_count'));assert.ok(!Object.hasOwn(row.proposal,'subheading_count'));
  assert.ok(row.issues.some(item=>item.field==='char_count'));assert.notEqual(row.record.char_count,0);
});

test('identical duplicate inputs skip and conflicting duplicate identities fail before any apply request',async t=>{
  const f=await fixture(t,[defaults,{...defaults,directory:'other/copy'}]);
  const duplicate=await run(selected(f));assert.equal(duplicate.code,0);sanitized(duplicate,f);
  assert.equal(parsed(duplicate).entries.filter(row=>row.action==='candidate').length,1);
  assert.equal(parsed(duplicate).entries.filter(row=>row.action==='skipped').length,1);
  await writeFile(join(f.root,'other/copy','title.txt'),'另一条明确合成标题\n');
  const service=await mockService(t),conflict=await run([...selected(f),'--apply','--confirm-apply','--origin',service.origin,'--allow-loopback-http'],{HAODUOYU_IMPORT_TOKEN:token});
  assert.equal(conflict.code,1);sanitized(conflict,f);assert.equal(service.state.requests.length,0);
  assert.ok(parsed(conflict).entries.every(row=>row.action==='failed'));
});

test('apply needs every explicit gate and accepts no token argument or credential config',async t=>{
  const f=await fixture(t),service=await mockService(t);
  for(const args of [
    [...selected(f),'--apply'],
    [...selected(f),'--apply','--origin',service.origin,'--allow-loopback-http'],
    [...selected(f),'--apply','--confirm-apply','--origin',service.origin,'--allow-loopback-http'],
    [...selected(f),'--token',token],
    [...selected(f),'--apply','--confirm-apply','--origin','https://user:password@example.invalid'],
  ]) {const result=await run(args);assert.equal(result.code,1);sanitized(result,f);}
  assert.equal(service.state.requests.length,0);
  await f.save({format:'haoduoyu-article-import-config-v1',entries:[defaults],token});
  const result=await run(selected(f));assert.equal(result.code,1);sanitized(result,f);
});

test('malformed or symlinked configuration reports safe codes without echoing content or private paths',async t=>{
  const f=await fixture(t);
  await writeFile(f.config,'{"credential":"'+token+'", BROKEN');
  const malformed=await run(selected(f));assert.equal(malformed.code,1);sanitized(malformed,f);
  await f.save({format:'haoduoyu-article-import-config-v1',entries:[defaults]});
  const alias=join(f.directory,'configuration-alias.json');await symlink(f.config,alias);
  const linked=await run(['--config',alias,'--root',f.root]);assert.equal(linked.code,1);sanitized(linked,f);
});

test('a bad entry does not erase the successfully parsed proposal of another independent entry',async t=>{
  const second={...defaults,directory:'tt/tt2_1024',run_dir:'tt2_1024',slot:'tt2'};
  const f=await fixture(t,[defaults,second]);await writeFile(join(f.root,second.directory,'title.txt'),'第一行\n第二行\n');
  const result=await run(selected(f));assert.equal(result.code,1);sanitized(result,f);
  const report=parsed(result);assert.equal(report.entries[0].action,'candidate');assert.equal(report.entries[1].action,'failed');
  assert.equal(report.entries[0].proposal.title,title);
});

test('explicit loopback apply uses a header-only token, creates once and skips an identical later batch',async t=>{
  const f=await fixture(t),service=await mockService(t);
  const args=[...selected(f),'--apply','--confirm-apply','--origin',service.origin,'--allow-loopback-http'];
  const first=await run(args,{HAODUOYU_IMPORT_TOKEN:token});assert.equal(first.code,0);sanitized(first,f);
  assert.equal(parsed(first).mode,'apply');assert.equal(service.state.patches,1);
  const second=await run(args,{HAODUOYU_IMPORT_TOKEN:token});assert.equal(second.code,0);sanitized(second,f);
  assert.equal(service.state.patches,1,'repeat import must not issue another PATCH');
  const applied=parsed(second).apply;
  assert.equal(applied.results[0].action,'skipped');
  for(const request of service.state.requests) {
    assert.ok(!request.url.includes(token));assert.ok(!request.body.includes(bodyMarker));
    assert.equal(request.authorization,'Bearer '+token);
  }
  const original=await readFile(join(f.root,defaults.directory,'article.txt'),'utf8');assert.ok(original.includes(bodyMarker));
});

test('apply redacts escaped token substrings recursively and expected baselines cannot carry security fields',async t=>{
  const f=await fixture(t),escaped=['SYNTHETIC',String.fromCharCode(34),String.fromCharCode(92),'CAPABILITY'].join('_');
  await writeFile(join(f.root,defaults.directory,'title.txt'),'合成 '+escaped+' 标题\n');
  await writeFile(join(f.root,defaults.directory,'check.md'),'- 字数: 未取得\n');
  let requests=0;
  const result=await runImportCli([...selected(f),'--apply','--confirm-apply','--origin','https://synthetic.invalid'],{
    env:{HAODUOYU_IMPORT_TOKEN:escaped},fetchImpl(){requests++;throw Error('A failed proposal must not reach the target');},
  });
  assert.equal(result.exitCode,1);assert.equal(requests,0);
  assert.ok(!result.result.entries[0].record.title.includes(escaped),'escaped credential substring must be redacted before serialization');
  assert.ok(result.result.entries[0].record.title.includes('[REDACTED]'));
  await f.save({format:'haoduoyu-article-import-config-v1',entries:[{...defaults,
    expected:{id:randomUUID(),version:1,fields:{password_hash:token}}}]});
  const rejected=await run(selected(f));assert.equal(rejected.code,1);sanitized(rejected,f);
});
