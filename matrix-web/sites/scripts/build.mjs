import { readFile,writeFile,mkdir,rm,cp,readdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { build } from 'esbuild';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=resolve(root,'../public'),dist=resolve(root,'dist');
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8'};
const assets={};
for(const name of ['index.html','app.js','style.css','openapi.json','favicon.svg','robots.txt','llms.txt']) {
  try {assets[name]={type:types[name.split('.').at(-1)],content:await readFile(resolve(publicRoot,name),'utf8')};}
  catch(error) {if(error.code!=='ENOENT')throw error;}
}
// Keep the existing public API help content with the preserved Node version.
const source=await readFile(resolve(root,'../src/server.mjs'),'utf8');
const html=source.match(/return res\.end\('(<\!doctype html>.*?)'\);/s)?.[1];
assert.ok(html,'Original public API help must be retained');
assets['api-docs']={type:types.html,content:html};
await writeFile(resolve(root,'src/assets.generated.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
const manifest=JSON.parse(await readFile(resolve(root,'.openai/hosting.json'),'utf8'));
assert.equal(manifest.project_id,'appgprj_6ac1907e61a48191a067ce3c30b21265');
assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,'BUCKET');assert.ok(!manifest.static);
const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
const legacy=JSON.parse(await readFile(resolve(root,'db/legacy-history.json'),'utf8'));
assert.deepEqual(journal.entries.slice(0,legacy.entries.length),legacy.entries,'Existing migration entries are immutable');
for(const [name,hash] of Object.entries(legacy.files)) {
  if(name==='meta/_journal.json') continue; // Its exact old entries are preserved above; the tail is appended.
  const bytes=await readFile(resolve(root,'drizzle',name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Legacy migration/snapshot changed: '+name);
}
assert.equal(journal.entries.length,legacy.entries.length+1);
for(const entry of journal.entries.slice(legacy.entries.length)) {
  const sql=await readFile(resolve(root,'drizzle',entry.tag+'.sql'),'utf8');
  for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) {
    assert.match(statement,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\s+`matrix_/,'Only namespaced schema additions belong in this initial migration');
    assert.ok(!/\b(?:INSERT|DELETE|DROP|UPDATE|ALTER)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:no action|cascade)/gi,'')),'No data or destructive migration');
  }
}
await rm(dist,{recursive:true,force:true});await mkdir(resolve(dist,'server'),{recursive:true});
await build({entryPoints:[resolve(root,'src/worker.mjs')],bundle:true,format:'esm',platform:'neutral',external:['node:*'],target:'es2022',outfile:resolve(dist,'server/index.js')});
await mkdir(resolve(dist,'.openai'),{recursive:true});
await cp(resolve(root,'.openai/hosting.json'),resolve(dist,'.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(dist,'.openai/drizzle'),{recursive:true});
// Same Node compatibility contract as the tested runtime; Sites must confirm it
// honors this build metadata before production. The ID is a local placeholder.
await writeFile(resolve(dist,'server/wrangler.json'),JSON.stringify({name:'haoduoyu-matrix-sites',main:'index.js',compatibility_date:'2026-07-30',compatibility_flags:legacy.runtime_compatibility_flags,d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}],r2_buckets:[{binding:'BUCKET',bucket_name:'site-creator-r2'}]},null,2)+'\n');
const worker=await import(resolve(dist,'server/index.js')+'?build='+Date.now());
assert.equal(typeof worker.default?.fetch,'function');
console.log('Built Sites Worker ESM; preserved DB/BUCKET and all 54 legacy migrations/snapshots; appended only matrix schema.');
