import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
export const reconciliationModules=['web/pages/article-reconciliation.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex');
export function projectReconciliation(file,source) {
  const manifest=JSON.parse(readFileSync(new URL('./reconciliation-ui-delta.json',import.meta.url),'utf8'));
  const expected=manifest.files[file];if(!expected)return source;
  assert.equal(hash(source),expected.after,'exact approved reconciliation delta / exact memo additions retain every released article frontend AST node: '+file);
  if(expected.before===null)return '';
  const before=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),expected.before);return before;
}
