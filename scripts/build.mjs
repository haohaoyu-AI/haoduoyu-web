import { readFile,writeFile,mkdir,rm,cp } from 'node:fs/promises';
import { resolve,dirname,relative } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=resolve(root,'public'),dist=resolve(root,'dist');
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8'};
const assets={};
for(const name of ['index.html','app.js','style.css','openapi.json','favicon.svg','robots.txt','llms.txt']) {
  assets[name]={type:types[name.split('.').at(-1)],content:await readFile(resolve(publicRoot,name),'utf8')};
}
assets['api-docs']={type:types.html,content:await readFile(resolve(publicRoot,'api-docs.html'),'utf8')};
await writeFile(resolve(root,'src/assets.generated.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
const manifest=JSON.parse(await readFile(resolve(root,'.openai/hosting.json'),'utf8'));
if(manifest.project_id) {
  assert.match(manifest.project_id,/^appgprj_/);
  assert.notEqual(manifest.project_id,'appgprj_6ac1907e61a48191a067ce3c30b21265','This standalone project must not target the preserved old site');
}
assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,null);assert.ok(!manifest.static);
const runtime=JSON.parse(await readFile(resolve(root,'runtime.json'),'utf8'));
const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
assert.equal(journal.entries.length,1,'Fresh database uses one initial matrix migration');
assert.equal(journal.entries[0].idx,0);
const sql=await readFile(resolve(root,'drizzle',journal.entries[0].tag+'.sql'),'utf8');
let tables=0;
for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) {
  assert.match(statement,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\s+`matrix_/,'Only matrix schema belongs in the new database');
  assert.ok(!/\b(?:INSERT|DELETE|DROP|UPDATE|ALTER)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:no action|cascade)/gi,'')),'Initial migration contains no business rows or destructive changes');
  if(statement.startsWith('CREATE TABLE')) tables++;
}
assert.equal(tables,11);
assert.equal(relative(root,dist),'dist','Build output must remain inside this project');
await rm(dist,{recursive:true,force:true});await mkdir(resolve(dist,'server'),{recursive:true});
await build({entryPoints:[resolve(root,'src/worker.mjs')],bundle:true,format:'esm',platform:'neutral',external:['node:*'],target:'es2022',outfile:resolve(dist,'server/index.js')});
await mkdir(resolve(dist,'.openai'),{recursive:true});
await cp(resolve(root,'.openai/hosting.json'),resolve(dist,'.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(dist,'.openai/drizzle'),{recursive:true});
await writeFile(resolve(dist,'server/wrangler.json'),JSON.stringify({name:'haoduoyu-matrix-new',main:'index.js',...runtime,d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]},null,2)+'\n');
const worker=await import(pathToFileURL(resolve(dist,'server/index.js')).href+'?build='+Date.now());
assert.equal(typeof worker.default?.fetch,'function');
console.log('Built independent Sites Worker: DB only, one generated initial migration, 11 matrix tables, no legacy tables or R2 binding.');
