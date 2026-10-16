// QA only: all inputs are synthetic and passed through stdin, never argv/logs.
import { fixture } from '../tests/harness.mjs';
let input='';for await(const chunk of process.stdin) input+=chunk;
const {password,file,port}=JSON.parse(input);
const {mf}=await fixture(undefined,{password,username:'browser-test-only',persist:file+'.d1',port,origin:'http://127.0.0.1:'+port});
await mf.ready;
console.log(JSON.stringify({port}));
process.on('SIGTERM',async()=>{await mf.dispose();process.exit(0);});
