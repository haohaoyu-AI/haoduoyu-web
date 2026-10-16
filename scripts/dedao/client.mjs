// Codex receives only a private loopback capability. OAuth and claim tokens stay
// in the execution-machine worker's memory, never in prompts or files.
import fs from 'node:fs/promises';
const [operation,...parts]=process.argv.slice(2);
if(!process.env.DEDAO_CONTROL_URL||!process.env.DEDAO_CONTROL_NONCE)throw Error('Run this client inside the worker-started Codex task');
let args={};if(parts.length)args=JSON.parse(parts.length===1&&parts[0].startsWith('@')?await fs.readFile(parts[0].slice(1),'utf8'):parts.join(' '));
const r=await fetch(process.env.DEDAO_CONTROL_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Dedao-Control':process.env.DEDAO_CONTROL_NONCE},body:JSON.stringify({operation,args})});
const result=await r.json();if(!r.ok){process.stderr.write(JSON.stringify(result)+'\n');process.exitCode=1;}else process.stdout.write(JSON.stringify(result)+'\n');
