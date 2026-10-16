import {owner} from '../../../../lib/test-store';
import {readEditorialRequest,editorialRequestPublicError} from '../../../../lib/editorial-request';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){const user=owner(request);if(!user)return Response.json({error:'请使用本人 ChatGPT 账号登录'},{status:401,headers});try{const id=new URL(request.url).searchParams.get('request_id');return Response.json(await readEditorialRequest(user,id?{request_id:id}:{}),{headers});}catch(error){return Response.json({error:editorialRequestPublicError(error)},{status:400,headers});}}
// User page is strictly observational. Authorized assistant execution remains MCP-only.
export async function POST(request:Request){const user=owner(request);if(!user)return Response.json({error:'请使用本人 ChatGPT 账号登录'},{status:401,headers});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'请求未获允许'},{status:403,headers});return Response.json({error:'网页只显示自动写作进度；任务由持有真实用户授权的助手执行，无需逐篇网页启动'},{status:405,headers});}
