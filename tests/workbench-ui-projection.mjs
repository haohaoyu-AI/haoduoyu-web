import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('./workbench-ui-delta.json',import.meta.url),'utf8'));
export const workbenchAddedModules=['web/ui/workbench.mjs','web/pages/workbench-settings.mjs'];
const hash=source=>createHash('sha256').update(source).digest('hex');
export async function projectWorkbenchFrontend(file,source) {
  const entry=manifest.files[file];
  if(!entry)return source;
  assert.equal(hash(source),entry.after_sha256,'exact approved workbench delta: '+file);
  if(entry.before_sha256===null)return '';
  const before=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),entry.before_sha256,'workbench production baseline stays exact: '+file);
  return before;
}
