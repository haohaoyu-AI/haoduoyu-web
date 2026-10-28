// Independent, closed inverse for the two reviewed UI refinements.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const smallFixBaseline='0dbeffcd6060d12d770a436b00a7caa924d1efec';
export const smallFixProduct='bcb0dc48ae67797023b5c53162e3d4bbf44ac2d2';
export const smallFixHashes=Object.freeze({
  '.ci/public-assets.json':'115e5adbbe7a8c1101d37d643b6a83946c1496f12a1fba432f1a8251b480e748',
  'public/app.js':'758c6c4db956a5faa47c4ef4dd51915b4c21e2e8311835cf14fef2694c20b0d0',
  'public/index.html':'dcc62b60a14bbb27c6845a6cb942e01f2a23b37573d207ecac29ccbf032300e7',
  'public/sw.js':'fc0269be10c9eadcede7420fcaa02457b49d3bf15d752bd96a68adaa876894cd',
  'public/tokens.css':'ea9b64c41d23e09a6bf9f212b009aaa467e6d6e47394edd8b25f710143b46533',
  'public/workbench.css':'7ec0a96429c31de1b731dc1a33237849edb11a888d3605e8f7d4a61b69404254',
  'tests/daily-todos-ui.test.mjs':'f0d9d6371d2bc2a2d6d166788be841b607cab76c34fd7510a0aba008d9f23a15',
  'web/pages/daily-notes.mjs':'b37808af380bb77a2a725765534f6a85bac8f01034b9ede98db6aa3c37cd49bd',
  'web/pages/todos.mjs':'8ba630c84fa9f245898bf74b61816059ee306ee377d7581b4da956c2c5c989ea'
});
const root=new URL('../',import.meta.url);
const hash=s=>createHash('sha256').update(s).digest('hex');
const before=f=>execFileSync('git',['show',smallFixBaseline+':'+f],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
export const isSmallFixProduct=(file,source)=>Object.hasOwn(smallFixHashes,file)&&hash(source)===smallFixHashes[file];
export function projectSmallFix(file,source) {
  if(!Object.hasOwn(smallFixHashes,file))return source;
  const old=before(file);
  if(source===old)return source;
  assert.ok(isSmallFixProduct(file,source),'exact approved small UI fix bytes: '+file);
  return old;
}
