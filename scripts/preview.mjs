// Portable local preview only; no Cloudflare or Sites account is contacted.
import { fixture } from '../tests/harness.mjs';
import { resolve } from 'node:path';
const port=Number(process.env.PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT must be 1024..65535');
const origin='http://127.0.0.1:'+port;
const persist=resolve(process.env.PREVIEW_D1_DIRECTORY||'.preview/d1');
const {mf}=await fixture(undefined,{port,origin,persist,bootstrap:false,bootstrapSecret:process.env.MATRIX_BOOTSTRAP_SECRET||''});
console.log('Local Worker/D1 preview: '+String(await mf.ready));
console.log('No administrator or sample business data is created automatically.');
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await mf.dispose();process.exit(0);});
