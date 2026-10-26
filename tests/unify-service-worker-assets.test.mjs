import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';
import {assets} from '../src/assets.generated.mjs';
import {buildServiceWorkerAssets,shellAssetPaths} from '../scripts/service-worker-build.mjs';

const root=new URL('../',import.meta.url);
const read=file=>readFile(new URL(file,root),'utf8');
const request=(path,options={})=>worker.fetch(new Request('http://localhost'+path,options),{});
const security=['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'];

test('the committed shell reproduces its exact built version, complete stylesheet set and public bytes',async()=>{
  const index=await read('public/index.html'),sw=await read('public/sw.js');
  const shellAssets=Object.fromEntries(Object.entries(assets).filter(([name])=>name.endsWith('.css')||
    ['app.js','favicon.svg','manifest.webmanifest'].includes(name)).map(([name,asset])=>['/'+name,asset.content]));
  const result=buildServiceWorkerAssets({indexHtml:index,swSource:sw,assets:shellAssets});
  assert.equal(result.indexHtml,index);assert.equal(result.swSource,sw);
  assert.ok(result.config.assets.every(asset=>!asset.url.startsWith('/api/')&&asset.url!=='/sw.js'));
  assert.equal(result.config.assets.filter(asset=>asset.url==='/offline.css').length,1);
  const linked=[...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
    .map(match=>new URL(match[1].replaceAll('&amp;','&'),'http://localhost').pathname);
  assert.equal(linked.at(-1),'/offline.css','todo offline UI stylesheet is last in the cascade');
  assert.deepEqual([...linked].sort(),Object.keys(shellAssets).filter(path=>path.endsWith('.css')).sort(),
    'every linked stylesheet is in the same complete shell generation');
  for(const path of shellAssetPaths)assert.ok(result.config.assets.some(asset=>asset.url===path));
  for(const entry of result.config.assets) {
    const response=await request(entry.url+'?__shell='+result.version);
    assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.url);
    assert.deepEqual(bytes,Buffer.from(await read('public/'+(entry.url==='/'?'index.html':entry.url.slice(1)))));
  }
});

test('only the SW adds its root scope header and exact no-cache GET/HEAD/304 behavior',async()=>{
  const bytes=Buffer.from(await read('public/sw.js')),etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';
  const control=await request('/glass.css');
  for(const method of ['GET','HEAD'])for(const conditional of [false,true]) {
    const response=await request('/sw.js?ignored=1',{method,headers:conditional?{'If-None-Match':etag}:{}});
    assert.equal(response.status,conditional?304:200);assert.equal(response.headers.get('Cache-Control'),'no-cache');
    assert.equal(response.headers.get('Service-Worker-Allowed'),'/');assert.equal(response.headers.get('ETag'),etag);
    assert.equal(response.headers.has('Set-Cookie'),false);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'||conditional?Buffer.alloc(0):bytes);
    for(const header of security)assert.equal(response.headers.get(header),control.headers.get(header));
  }
  for(const path of ['/app.js','/mobile.css','/sw-update.css','/offline.css','/manifest.webmanifest','/%73w.js','/health','/api/v1/auth/me']) {
    const response=await request(path);assert.equal(response.headers.has('Service-Worker-Allowed'),false,path);
    if(path!=='/app.js')assert.equal(response.headers.get('Cache-Control'),'no-store',path);
    await response.text();
  }
  assert.equal((await request('/sw.js',{method:'POST'})).status,404);
});

test('manifest MIME, default-hidden update UI and the API-independent entrypoint stay explicit',async()=>{
  const response=await request('/manifest.webmanifest');
  assert.equal(response.headers.get('Content-Type'),'application/manifest+json; charset=utf-8');
  const manifest=await response.json();assert.equal(manifest.name,'好多鱼');assert.equal(manifest.scope,'/');
  assert.equal(manifest.start_url,'/?page=todos');assert.ok(manifest.icons.some(icon=>icon.src==='/favicon.svg'));
  const index=await read('public/index.html');assert.ok(!index.includes('sw-update-notice'));
  const main=await read('web/main.mjs');assert.match(main,/import \{ startServiceWorker \} from "\.\/offline\/sw-client\.mjs"/);
  assert.match(main,/registerEvents\(\);\s*startServiceWorker\(\);\s*init\(\);/);
  assert.doesNotMatch(main,/offline\/(?:runtime|api|sync|outbox|db)\.mjs/);
});
