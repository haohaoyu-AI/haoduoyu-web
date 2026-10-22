import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Node 24 already ships this parser. It is a development check only: no new
// dependency, downloaded formatter, runtime bundle code or ignored source area.
const parserModule = {exports: {}};
const parserSource = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
assert.equal(typeof parserSource, 'string', 'Node 24 bundled JavaScript parser is required');
new Function('exports', 'module', parserSource)(parserModule.exports, parserModule);
export const parseWeb = source => parserModule.exports.parse(source, {
  ecmaVersion: 'latest', sourceType: 'module', locations: true,
});
export function visitWeb(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (node.type) callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(item => visitWeb(item, callback));
    else if (value && typeof value === 'object') visitWeb(value, callback);
  }
}
export async function webStyle(root = fileURLToPath(new URL('../web', import.meta.url))) {
  const violations = [];
  let files = 0, functions = 0;
  async function scan(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {await scan(path);continue;}
      if (!path.endsWith('.mjs')) continue;
      files++;
      const source = await readFile(path, 'utf8');
      source.split('\n').forEach((line, index) => {
        if (Array.from(line).length > 160) violations.push({path, line: index + 1, rule: 'line', size: Array.from(line).length});
      });
      visitWeb(parseWeb(source), node => {
        if (node.type === 'TemplateElement' || (node.type === 'Literal' && typeof node.value === 'string')) {
          const raw = source.slice(node.start, node.end);
          if (/[\p{L}\p{N}_#-]\\\n[\p{L}\p{N}_#-]/u.test(raw)) {
            violations.push({path, line: node.loc.start.line, rule: 'word-continuation'});
          }
        }
        if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
        functions++;
        const lines = node.loc.end.line - node.loc.start.line + 1;
        if (lines > 80) violations.push({path, line: node.loc.start.line, rule: 'function', size: lines});
      });
    }
  }
  await scan(root);
  return {files, functions, violations};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await webStyle(process.argv[2]);
  assert.deepEqual(report.violations, [], JSON.stringify(report.violations));
  console.log(`Verified ${report.files} modules / ${report.functions} functions: every line ≤160 characters and function ≤80 lines.`);
}
