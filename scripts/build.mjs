import { readFile,writeFile,mkdir,rm,cp } from 'node:fs/promises';
import { resolve,dirname,relative } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { frontendBundle } from './frontend-build.mjs';
import { cloudflareConfig } from './cloudflare-config.mjs';
import {articleMigrationTag,validateMigrationSource} from './migration-contract.mjs';
import {buildServiceWorkerAssets} from './service-worker-build.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=resolve(root,'public'),dist=resolve(root,'dist');
const args=process.argv.slice(2);
assert.ok(args.length<=1&&(!args.length||/^--target=(platform|cloudflare)$/.test(args[0])),
  'Usage: node scripts/build.mjs [--target=platform|--target=cloudflare]');
const target=args[0]?.slice('--target='.length)||'platform';
const runtime=JSON.parse(await readFile(resolve(root,'runtime.json'),'utf8'));
const standalone=target==='cloudflare'?cloudflareConfig(runtime,process.env):null;
await writeFile(resolve(publicRoot,'app.js'),await frontendBundle(root));
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8',webmanifest:'application/manifest+json; charset=utf-8'};
const assets={};
for(const name of ['index.html','app.js','tokens.css','style.css','memos.css','glass.css','workbench.css','mobile.css','sw-update.css','manifest.webmanifest','openapi.json','favicon.svg','robots.txt','llms.txt']) {
  assets[name]={type:types[name.split('.').at(-1)],content:await readFile(resolve(publicRoot,name),'utf8')};
}
assets['api-docs']={type:types.html,content:await readFile(resolve(publicRoot,'api-docs.html'),'utf8')};
const shell=buildServiceWorkerAssets({indexHtml:assets['index.html'].content,
  swSource:await readFile(resolve(publicRoot,'sw.js'),'utf8'),
  assets:Object.fromEntries(Object.entries(assets).filter(([name])=>name.endsWith('.css')||
    ['app.js','favicon.svg','manifest.webmanifest'].includes(name)).map(([name,asset])=>['/'+name,asset.content]))});
assets['index.html'].content=shell.indexHtml;assets['sw.js']={type:types.js,content:shell.swSource};
await writeFile(resolve(publicRoot,'index.html'),shell.indexHtml);
await writeFile(resolve(publicRoot,'sw.js'),shell.swSource);
for(const asset of Object.values(assets)) {
  const bytes=Buffer.from(asset.content,'utf8');
  asset.etag='\"'+createHash('sha256').update(bytes).digest('hex')+'\"';
  asset.length=bytes.length;
}
await writeFile(resolve(root,'src/assets.generated.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
if(target==='platform') {
  const manifest=JSON.parse(await readFile(resolve(root,'.openai/hosting.json'),'utf8'));
  if(manifest.project_id) {
    assert.match(manifest.project_id,/^appgprj_/);
    assert.notEqual(manifest.project_id,'appgprj_6ac1907e61a48191a067ce3c30b21265','This standalone project must not target the preserved old site');
  }
  assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,null);assert.ok(!manifest.static);
}
const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
assert.equal(journal.entries.length,9,'Initial schema, additive workbench modules and reviewed article graph migration');
let tables=0;
for(const [idx,entry] of journal.entries.entries()) {
  assert.equal(entry.idx,idx);
  const sql=await readFile(resolve(root,'drizzle',entry.tag+'.sql'),'utf8');
  if(idx===5) {
    validateMigrationSource(entry.tag,sql);
    assert.equal(entry.tag,articleMigrationTag);
    continue; // The reviewed rebuild preserves 16 logical tables; its temporary CREATEs are not additions.
  }
  for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) {
    if(idx===3&&['ALTER TABLE `matrix_todos` ADD `deleted_at` text;',
      'ALTER TABLE `matrix_todo_template_links` ADD `created_with_todo` integer DEFAULT 1 NOT NULL;'].includes(statement)) continue;
    assert.match(statement,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\s+`matrix_/,'Only matrix schema belongs in this database');
    assert.ok(!/\b(?:INSERT|DELETE|DROP|UPDATE|ALTER)\b/i.test(statement.replace(/ON (?:UPDATE|DELETE) (?:no action|cascade)/gi,'')),
      'Migrations contain no business rows or destructive changes');
    if(statement.startsWith('CREATE TABLE')) tables++;
  }
}
assert.equal(tables,22);
assert.equal(relative(root,dist),'dist','Build output must remain inside this project');
const output=target==='platform'?dist:resolve(dist,'cloudflare');
const entry=target==='platform'?resolve(output,'server/index.js'):resolve(output,'index.js');
await rm(output,{recursive:true,force:true});await mkdir(dirname(entry),{recursive:true});
await build({entryPoints:[resolve(root,'src/worker.mjs')],bundle:true,format:'esm',platform:'neutral',external:['node:*'],target:'es2022',outfile:entry});
if(target==='platform') {
  await mkdir(resolve(output,'.openai'),{recursive:true});
  await cp(resolve(root,'.openai/hosting.json'),resolve(output,'.openai/hosting.json'));
  await cp(resolve(root,'drizzle'),resolve(output,'.openai/drizzle'),{recursive:true});
  await writeFile(resolve(output,'server/wrangler.json'),JSON.stringify({name:'haoduoyu-matrix-new',main:'index.js',...runtime,d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]},null,2)+'\n');
} else {
  await mkdir(resolve(output,'migrations'),{recursive:true});
  for(const {tag} of journal.entries) await cp(resolve(root,'drizzle',tag+'.sql'),resolve(output,'migrations',tag+'.sql'));
  const file=standalone.configured?'wrangler.json':'wrangler.template.json';
  await writeFile(resolve(output,file),JSON.stringify(standalone.config,null,2)+'\n');
}
const worker=await import(pathToFileURL(entry).href+'?build='+Date.now());
assert.equal(typeof worker.default?.fetch,'function');
console.log(target==='platform'?'Built independent Sites Worker: DB only, nine reviewed migrations, 22 matrix tables, no legacy tables or R2 binding.':
  'Built standalone Cloudflare Worker and nine reviewed migrations locally; '+(standalone.configured?'configuration supplied.':'unconfigured template only.')+' No resources created or deployed.');
