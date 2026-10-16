import {owner} from '../../../../lib/test-store';
import {testClaudeConnection} from '../../../../lib/claude';
export async function POST(r:Request){const u=owner(r);if(!u)return new Response('Unauthorized',{status:401});if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('x-xiaoyu-config')!=='1')return new Response('Forbidden',{status:403});try{const a:any=await r.json();return Response.json(await testClaudeConnection(u,a.confirm),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'测试结果待核验，请先读取状态，不要重复发起'},{status:400});}}
