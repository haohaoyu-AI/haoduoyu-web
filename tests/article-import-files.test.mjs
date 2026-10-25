import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,link,rename,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readImportEntry,readImportConfig,IMPORT_SOURCE_LIMITS} from '../scripts/article-import/files.mjs';

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'synthetic-import-files-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=join(directory,'sources'),entry=join(root,'tt','tt1_1024'),outside=join(directory,'outside');
  await mkdir(entry,{recursive:true});await mkdir(outside);
  for(const [name,value]of Object.entries({'timelog.txt':'2026-10-24 09:00:00 写作 开始：合成\n',
    'check.md':'- 字数: 2236\n','title.txt':'合成标题\n','article.txt':'合成正文，仅本地读取，不作为台账字段\n'}))await writeFile(join(entry,name),value);
  return {directory,root,entry,outside,config:join(directory,'config.json'),options:{root,entry:{directory:'tt/tt1_1024'}}};
}
const codes=result=>result.issues.map(item=>item.code);
const sha=value=>createHash('sha256').update(value).digest('hex');
function sanitized(result,paths=[]) {
  const diagnostic=JSON.stringify({issues:result.issues,source_summary:result.source_summary});
  for(const path of paths)assert.equal(diagnostic.includes(path),false);
  assert.equal(diagnostic.includes('合成正文'),false);
}

test('fixed explicit sources preserve UTF-8/BOM bytes and expose only source hashes in diagnostics',async t=>{
  const app=await fixture(t),raw=Buffer.from('\ufeff合成标题\r\n第二行\r第三行\n');
  await writeFile(join(app.entry,'title.txt'),raw);
  await writeFile(join(app.root,'tt','used_topics.txt'),'2026-10-24 | 合成作者 | 合成标题 | used for 第1篇\n');
  const result=await readImportEntry({...app.options,entry:{...app.options.entry,used_topics:'tt/used_topics.txt'}});
  assert.deepEqual(result.issues,[]);assert.equal(result.files.title,raw.toString('utf8'));
  assert.equal(result.files.title.charCodeAt(0),0xfeff);
  assert.deepEqual(result.source_summary.title,{present:true,bytes:raw.length,lines:3,sha256:sha(raw)});
  assert.equal(result.files.used_samples,null);assert.equal(result.source_summary.used_samples.bytes,null);
  assert.match(result.files.used_topics,/合成作者/);sanitized(result,[app.root,app.directory]);
});

test('relative source traversal, absolute/drive/backslash/NUL paths and unsafe optional filenames fail closed',async t=>{
  const app=await fixture(t);
  for(const directory of ['../outside','/tmp/absolute','C:/outside','tt\\tt1_1024','tt//tt1_1024','tt/./tt1_1024','tt/../outside','tt\0bad','.']) {
    const result=await readImportEntry({...app.options,entry:{directory}});
    assert.deepEqual(codes(result),['SOURCE_UNSAFE_PATH']);assert.ok(Object.values(result.files).every(value=>value===null));
    sanitized(result,[app.root,app.directory,directory]);
  }
  for(const used_topics of ['../used_topics.txt','/tmp/used_topics.txt','tt/other.txt','C:/used_topics.txt']) {
    const result=await readImportEntry({...app.options,entry:{...app.options.entry,used_topics}});
    assert.deepEqual(codes(result),['SOURCE_UNSAFE_PATH']);
  }
});

test('source root, ancestor and file symlinks are rejected including links that point within the root',async t=>{
  const app=await fixture(t);await writeFile(join(app.outside,'secret.txt'),'synthetic external marker');
  await symlink(join(app.outside,'secret.txt'),join(app.entry,'used_topics.txt'));
  const file=await readImportEntry({...app.options,entry:{...app.options.entry,used_topics:'tt/tt1_1024/used_topics.txt'}});
  assert.ok(codes(file).includes('SOURCE_SYMLINK'));assert.equal(file.files.used_topics,null);
  await symlink(app.root,join(app.directory,'root-link'));
  const root=await readImportEntry({...app.options,root:join(app.directory,'root-link')});
  assert.deepEqual(codes(root),['SOURCE_SYMLINK']);assert.equal(root.files.title,null);
  await symlink(join(app.root,'tt'),join(app.root,'alias'));
  const parent=await readImportEntry({...app.options,entry:{directory:'alias/tt1_1024'}});
  assert.ok(codes(parent).every(code=>code==='SOURCE_SYMLINK'));assert.equal(parent.files.article,null);
  sanitized(file,[app.outside,'synthetic external marker']);
});

test('nonregular sources and hardlinks are rejected before reading',async t=>{
  const app=await fixture(t);
  await rm(join(app.entry,'title.txt'));await mkdir(join(app.entry,'title.txt'));
  const directory=await readImportEntry(app.options);assert.ok(codes(directory).includes('SOURCE_NOT_REGULAR'));
  await rm(join(app.entry,'title.txt'),{recursive:true});await writeFile(join(app.outside,'linked.txt'),'synthetic link');
  await link(join(app.outside,'linked.txt'),join(app.entry,'title.txt'));
  const hard=await readImportEntry(app.options);assert.ok(codes(hard).includes('SOURCE_HARDLINK'));assert.equal(hard.files.title,null);
});

test('per-file, entry-total and line limits are bounded and overrides may only lower hard limits',async t=>{
  const app=await fixture(t);
  await writeFile(join(app.entry,'article.txt'),'x'.repeat(101));
  const file=await readImportEntry({...app.options,limits:{maxFileBytes:100}});
  assert.ok(codes(file).includes('SOURCE_TOO_LARGE'));assert.equal(file.files.article,null);
  const total=await readImportEntry({...app.options,limits:{maxEntryBytes:60}});
  assert.ok(codes(total).includes('SOURCE_TOTAL_TOO_LARGE'));
  const lines=await readImportEntry({...app.options,limits:{maxLines:1}});assert.equal(lines.issues.length,0);
  await writeFile(join(app.entry,'title.txt'),'one\ntwo\n');
  const overflow=await readImportEntry({...app.options,limits:{maxLines:1}});
  assert.ok(codes(overflow).includes('SOURCE_TOO_MANY_LINES'));assert.equal(overflow.files.title,null);
  for(const limits of [{maxFileBytes:IMPORT_SOURCE_LIMITS.maxFileBytes+1},{maxEntryBytes:0},{maxLines:1.5}])
    assert.deepEqual(codes(await readImportEntry({...app.options,limits})),['SOURCE_LIMIT_INVALID']);
});

test('missing and invalid UTF-8 files return sanitized issues without replacement characters',async t=>{
  const app=await fixture(t);await rm(join(app.entry,'title.txt'));
  await writeFile(join(app.entry,'article.txt'),Buffer.from([0x61,0xc3,0x28]));
  const result=await readImportEntry(app.options);
  assert.ok(codes(result).includes('SOURCE_MISSING'));assert.ok(codes(result).includes('SOURCE_INVALID_UTF8'));
  assert.equal(result.files.title,null);assert.equal(result.files.article,null);
  assert.equal(result.source_summary.title.sha256,null);sanitized(result,[app.root]);
});

test('file replacement, directory symlink replacement and content mutation races fail closed',async t=>{
  const app=await fixture(t),name=join(app.entry,'title.txt');
  const swapped=await readImportEntry(app.options,{beforeOpen:async({source})=>{
    if(source!=='title')return;await rename(name,name+'.old');await writeFile(name,'replacement');
  }});
  assert.ok(codes(swapped).includes('SOURCE_CHANGED'));assert.equal(swapped.files.title,null);
  const mutated=await readImportEntry(app.options,{afterRead:async({source})=>{
    if(source==='article')await writeFile(join(app.entry,'article.txt'),'mutated content');
  }});
  assert.ok(codes(mutated).includes('SOURCE_CHANGED'));assert.equal(mutated.files.article,null);
  await mkdir(join(app.outside,'moved'));
  const replaced=await readImportEntry(app.options,{afterOpen:async({source})=>{
    if(source!=='timelog')return;await rename(app.entry,join(app.outside,'moved','original'));
    await symlink(app.outside,app.entry);
  }});
  assert.ok(codes(replaced).includes('SOURCE_CHANGED'));assert.equal(replaced.files.timelog,null);
  assert.ok(Object.values(replaced.files).every(value=>value===null));sanitized(replaced,[app.root,app.outside]);
});

test('configuration reader reuses safe file access with strict size, UTF-8 and diagnostic privacy',async t=>{
  const app=await fixture(t);const text='{"root":"SYNTHETIC_PRIVATE_PATH","entries":[]}\n';await writeFile(app.config,text);
  const config=await readImportConfig({path:app.config});assert.equal(config.text,text);assert.deepEqual(config.issues,[]);
  assert.equal(config.source_summary.sha256,sha(text));sanitized(config,[app.config,'SYNTHETIC_PRIVATE_PATH']);
  const large=await readImportConfig({path:app.config,limits:{maxConfigBytes:10}});
  assert.deepEqual(codes(large),['CONFIG_TOO_LARGE']);assert.equal(large.text,null);
  await writeFile(app.config,Buffer.from([0xc3,0x28]));
  assert.deepEqual(codes(await readImportConfig({path:app.config})),['CONFIG_INVALID_UTF8']);
  await rm(app.config);await symlink(join(app.entry,'title.txt'),app.config);
  assert.deepEqual(codes(await readImportConfig({path:app.config})),['CONFIG_SYMLINK']);
  const missing=await readImportConfig({path:join(app.directory,'missing.json')});assert.deepEqual(codes(missing),['CONFIG_MISSING']);
  assert.deepEqual(codes(await readImportConfig({path:app.directory+'/../config.json'})),['CONFIG_UNSAFE_PATH']);
});

test('invalid decoded files still consume the bounded entry input budget',async t=>{
  const app=await fixture(t);
  for(const name of ['timelog.txt','check.md','title.txt','article.txt'])await writeFile(join(app.entry,name),Buffer.from([0xff,0xff,0xff,0xff]));
  const result=await readImportEntry({...app.options,limits:{maxEntryBytes:8}});
  assert.equal(result.bytes_read,8);
  assert.equal(codes(result).filter(code=>code==='SOURCE_INVALID_UTF8').length,2);
  assert.equal(codes(result).filter(code=>code==='SOURCE_TOTAL_TOO_LARGE').length,2);
  assert.ok(Object.values(result.files).every(value=>value===null));
});

test('configuration changes and unreadable sources never expose OS errors, paths or content',async t=>{
  const app=await fixture(t);await writeFile(app.config,'{"synthetic":true}');
  const changed=await readImportConfig({path:app.config},{afterRead:async()=>writeFile(app.config,'{"different":true}')});
  assert.deepEqual(codes(changed),['CONFIG_CHANGED']);assert.equal(changed.text,null);sanitized(changed,[app.config]);
  const hidden=join(app.entry,'title.txt');await chmod(hidden,0);
  try {
    const result=await readImportEntry(app.options);
    assert.ok(codes(result).includes('SOURCE_UNREADABLE'));assert.equal(result.files.title,null);sanitized(result,[hidden]);
  } finally {await chmod(hidden,0o600);}
});
