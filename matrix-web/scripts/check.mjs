import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function files(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
}
for (const path of ['src','scripts','tests','public'].flatMap(files).filter(f=>/\.(mjs|js)$/.test(f))) {
  const result = spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if (result.status) process.exit(result.status);
}
const spec = JSON.parse(readFileSync('public/openapi.json','utf8'));
if (!spec.openapi || !spec.paths) throw new Error('OpenAPI规范缺失');
console.log('源码语法与OpenAPI JSON检查通过');
