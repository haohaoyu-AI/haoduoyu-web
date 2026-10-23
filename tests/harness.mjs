import {assertRequestId, traceJSON} from './request-trace-projection.mjs';
import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const ORIGIN='http://localhost';
export const USERNAME='synthetic-admin';
export const PASSWORD='Integration-only-password-2026!';
export async function applyFixtureMigrations(db,{through=Infinity}={}) {
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  await db.prepare('CREATE TABLE IF NOT EXISTS __fixture_migrations(name TEXT PRIMARY KEY)').run();
  const migrated=await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='matrix_control'").first();
  // Adopt the original synthetic fixture's initial migration when reopening it.
  if(migrated) await db.prepare('INSERT OR IGNORE INTO __fixture_migrations(name) VALUES(?)').bind(journal.entries[0].tag).run();
  for(const entry of journal.entries.slice(0,through)) {
    if(await db.prepare('SELECT name FROM __fixture_migrations WHERE name=?').bind(entry.tag).first()) continue;
    const sql=await readFile(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8');
    const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(sql=>db.prepare(sql));
    await db.batch([...statements,db.prepare('INSERT INTO __fixture_migrations(name) VALUES(?)').bind(entry.tag)]);
  }
}
export async function fixture(t,{persist=false,port=0,origin=ORIGIN,username=USERNAME,password=PASSWORD,bootstrap=true,trustConnectingIp=false,migrationCount=Infinity,bootstrapSecret=randomBytes(32).toString('hex')}={}) {
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const workerPath=process.env.TEST_WORKER_PATH||fileURLToPath(new URL('../dist/server/index.js',import.meta.url));
  const mf=new Miniflare({modules:true,cf:false,scriptPath:workerPath,modulesRoot:dirname(workerPath),
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],d1Persist:persist,
    bindings:{SITE_ORIGIN:origin,MATRIX_BOOTSTRAP_SECRET:bootstrapSecret,...(trustConnectingIp?{TRUST_CF_CONNECTING_IP:'1'}:{})},host:'127.0.0.1',port,
    outboundService:()=>new Response('External requests disabled',{status:502})});
  if(t) t.after(()=>mf.dispose());
  try {
  const db=await mf.getD1Database('DB');
  await applyFixtureMigrations(db,{through:migrationCount});
  async function request(path,{method='GET',body,session,token,headers={}}={}) {
    const requestHeaders={...headers};
    if(body!==undefined) requestHeaders['Content-Type']='application/json';
    if(session) {requestHeaders.Cookie=session.cookie;requestHeaders['X-CSRF-Token']=session.csrfToken;}
    if(token) requestHeaders.Authorization=`Bearer ${token}`;
    if(!['GET','HEAD'].includes(method)&&!Object.hasOwn(requestHeaders,'Origin')) requestHeaders.Origin=origin;
    const response=await mf.dispatchFetch(origin+path,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    const rawJson=json;assertRequestId(response.headers,true);
    if(json!==undefined)json=traceJSON(json,response.status,response.headers,true);
    return {status:response.status,headers:response.headers,text,json,rawJson,data:json?.data};
  }
  if(bootstrap) {
    const result=await request('/api/v1/bootstrap',{method:'POST',token:bootstrapSecret,body:{username,password}});
    if(result.status!==201) throw new Error('Synthetic bootstrap failed: '+result.text);
  }
  async function login(value=password) {
    const result=await request('/api/v1/auth/login',{method:'POST',body:{username,password:value}});
    if(result.status!==200) throw new Error('Synthetic login failed: '+result.text);
    const cookie=result.headers.get('set-cookie').split(';')[0];
    return {cookie,csrfToken:result.data.csrfToken};
  }
  return {mf,db,request,login,bootstrapSecret,origin};
  } catch(error) {
    await mf.dispose();
    throw error;
  }
}
