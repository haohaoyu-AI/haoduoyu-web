// Regenerate after executor/docs changes; bundle contains no runtime credentials.
import fs from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
const files={},root='haoduoyu-dedao-executor/';
for(const name of ['browser','client','executor','runtime','configuration','oauth','download-receipt','acceptance','setup'])files[root+`scripts/dedao/${name}.mjs`]=new Uint8Array(await fs.readFile(`scripts/dedao/${name}.mjs`));
files[root+'scripts/dedao/start.ps1']=new Uint8Array(await fs.readFile('scripts/dedao/start.ps1'));
for(const name of ['Start-Dedao.cmd','Verify-1-Then-3.cmd'])files[root+name]=new Uint8Array(await fs.readFile('scripts/dedao/'+name));
const docs=await fs.readFile('docs/dedao.md','utf8');files[root+'README.md']=strToU8(docs);
const metadata={name:'haoduoyu-dedao-executor',version:'1.1.2',private:true,type:'module',engines:{node:'>=22.13.0'},scripts:{start:'node scripts/dedao/setup.mjs',verify:'node scripts/dedao/setup.mjs --acceptance'},dependencies:{'@modelcontextprotocol/sdk':'1.32.1','playwright-core':'1.60.0'}};
files[root+'package.json']=strToU8(JSON.stringify(metadata,null,2)+'\n');
const lock=JSON.parse(await fs.readFile('scripts/dedao/executor-package-lock.json','utf8'));
if(lock.name!==metadata.name||lock.version!==metadata.version||JSON.stringify(lock.packages[''].dependencies)!==JSON.stringify(metadata.dependencies))throw Error('Executor dependency lock does not match package metadata');
files[root+'package-lock.json']=strToU8(JSON.stringify(lock,null,2)+'\n');
await fs.writeFile('public/dedao-executor.zip',zipSync(files,{level:9,mtime:new Date('2026-10-09T00:00:00Z')}));
await fs.writeFile('public/dedao-setup.txt',docs);
console.log('Generated credential-free executor package and connection guide.');
