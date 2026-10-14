import {owner} from '../../../../../lib/test-store';
import {DiagnosticReadError,readResponseDiagnostic} from '../../../../../lib/hot-response-diagnostics';
export const dynamic='force-dynamic';
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Pragma:'no-cache','X-Content-Type-Options':'nosniff'}});
export async function GET(request:Request){
 const user=owner(request);if(!user)return response({error:'请使用本人ChatGPT账号登录'},401);
 const query=new URL(request.url).searchParams;
 if([...query.keys()].some(k=>!['scan_id','account_id'].includes(k))||query.getAll('scan_id').length!==1||query.getAll('account_id').length!==1)return response({error:'仅支持精确扫描和账号标识'},400);
 try{return response(await readResponseDiagnostic(user,query.get('scan_id')!,query.get('account_id')!));}
 catch(error){return error instanceof DiagnosticReadError?response({error:error.message},error.status):response({error:'诊断存证暂时无法读取'},503);}
}
