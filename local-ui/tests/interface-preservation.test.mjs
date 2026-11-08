import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('packaged HTML, all styles and icon are byte-for-byte original',async()=>{
  const record=JSON.parse(await fs.readFile(path.join(root,'build/manifest.json')));
  for(const [file,hash]of Object.entries(record.unchangedAssets)) {
    const bytes=await fs.readFile(path.join(root,'build/site',file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
    assert.deepEqual(bytes,await fs.readFile(path.join(root,'frontend/public',file)));
  }
});
test('local bundle contains no remote transport or service worker runtime',async()=>{
  const bundle=await fs.readFile(path.join(root,'build/site/app.js'),'utf8');
  assert.doesNotMatch(bundle,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/);
  assert.doesNotMatch(bundle,/navigator\.serviceWorker\.register/);
  const meta=JSON.parse(await fs.readFile(path.join(root,'build/bundle-inputs.json')));
  const inputs=Object.keys(meta.inputs).join('\n');
  assert.doesNotMatch(inputs,/web\/core\/api\.mjs|web\/offline\/(runtime|sync|outbox|sw-client)\.mjs/);
  assert.match(inputs,/web\/local\/client\.mjs/);
});
test('data namespace is distinct from website and native preview data',async()=>{
  const {LOCAL_DATABASE_NAME,LOCAL_SCOPE}=await import('../frontend/web/local/api.mjs');
  assert.notEqual(LOCAL_DATABASE_NAME,'haoduoyu-offline');
  assert.notEqual(LOCAL_DATABASE_NAME,'haoduoyu-offline.db');
  assert.match(LOCAL_SCOPE,/^local:/);
});
test('shared bundle has no whole-database/cache reset and local invalidation cannot clear saved content',async()=>{
  const bundle=await fs.readFile(path.join(root,'build/site/app.js'),'utf8');
  assert.doesNotMatch(bundle,/\bdeleteDatabase\s*\(|\blocalStorage\.clear\s*\(|\bsessionStorage\.clear\s*\(|\bcaches\.delete\s*\(/);
  const actions=await fs.readFile(path.join(root,'frontend/web/actions.mjs'),'utf8');
  const reset=actions.slice(actions.indexOf('function actionResetDraft'),actions.indexOf('function actionDraftSort'));
  assert.match(reset,/#filter-panel/);
  assert.doesNotMatch(reset,/getOfflineRuntime|transaction|\.delete\(|\.clear\(/);
  const {createMemoryDB}=await import('../frontend/web/offline/db.mjs');
  const {createStandaloneRuntime}=await import('../frontend/web/local/runtime.mjs');
  const db=createMemoryDB(), runtime=createStandaloneRuntime({db}); await runtime.composerReady;
  await runtime.composerDrafts.set('future','','synthetic retained composer');
  await runtime.call('/todos',{method:'POST',body:{id:'22222222-2222-4222-8222-222222222222',date:'2026-11-08',text:'synthetic saved todo'}});
  const before=await db.transaction(['entities','meta'],'readonly',async tx=>[await tx.getAll('entities'),await tx.getAll('meta')]);
  assert.throws(()=>runtime.invalidate({forget:true}),/独立本机版本/);
  const after=await db.transaction(['entities','meta'],'readonly',async tx=>[await tx.getAll('entities'),await tx.getAll('meta')]);
  assert.deepEqual(after,before);
});
