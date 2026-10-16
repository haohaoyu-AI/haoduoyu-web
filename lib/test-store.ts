import { env } from 'cloudflare:workers';
export function db(){if(!env.DB)throw new Error('storage unavailable');return env.DB;}
export function diagnosticBucket(){if(!env.BUCKET)throw Error('diagnostic storage unavailable');return env.BUCKET;}
export function owner(r:Request){return r.headers.get('oai-authenticated-user-id');}
export async function list(owner:string){return (await db().prepare('SELECT id,created,state FROM connection_tests WHERE owner=? ORDER BY created DESC LIMIT 10').bind(owner).all()).results;}
