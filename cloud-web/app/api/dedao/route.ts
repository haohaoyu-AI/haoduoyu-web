import {owner} from '../../../lib/test-store';
import {readDedao,startDedao,resumeDedao,requestDedaoPause} from '../../../lib/dedao';
import {dedaoPublicError} from '../../../lib/dedao-contract';
const headers={'Cache-Control':'private, no-store'};
export async function GET(r:Request){const user=owner(r);if(!user)return Response.json({error:'请用本人账号登录'},{status:401,headers});try{return Response.json(await readDedao(user,new URL(r.url).searchParams.get('batch_id')||undefined),{headers});}catch(e){return Response.json({error:dedaoPublicError(e)},{status:503,headers});}}
export async function POST(r:Request){
 const user=owner(r);if(!user)return new Response('Unauthorized',{status:401});
 if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('x-xiaoyu-upload')!=='1')return new Response('Forbidden',{status:403});
 try{const text=await r.text();if(text.length>4096)return new Response('Too large',{status:413});const a=JSON.parse(text);return Response.json(a.action==='resume'?await resumeDedao(user,a.batch_id):a.action==='pause'?await requestDedaoPause(user,a.batch_id):await startDedao(user,a),{headers});}
 catch(e){return Response.json({error:dedaoPublicError(e)},{status:409,headers});}
}
