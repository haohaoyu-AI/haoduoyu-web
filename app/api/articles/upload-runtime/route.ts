import {owner} from '../../../../lib/test-store';
import {currentUploadRuntimeSource,uploadRuntimeModule,uploadRuntimeModuleVersion} from '../../../../lib/article-upload-runtime-source';

export async function GET(request:Request){
 if(!owner(request))return new Response('Unauthorized',{status:401,headers:{'Cache-Control':'private, no-store'}});
 const runtimeModule=new URL(request.url).searchParams.get('module');
 if(!uploadRuntimeModule(runtimeModule))return new Response('Unknown upload runtime module',{status:400,headers:{'Cache-Control':'private, no-store'}});
 const {source,sha256}=await currentUploadRuntimeSource(runtimeModule);
 const version=uploadRuntimeModuleVersion(runtimeModule);
 return new Response(source,{headers:{
  'Content-Type':'application/javascript; charset=utf-8',
  'Content-Disposition':`attachment; filename="haoduoyu-upload-${runtimeModule}-${version}.js"`,
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'X-Haoduoyu-Upload-Runtime-Version':version,
  'X-Haoduoyu-Upload-Source-SHA256':sha256,
  ...(runtimeModule==='native_coordinate'||runtimeModule==='native_parent'?{'X-Haoduoyu-Complete-Call-Budget-Verified':'false','X-Haoduoyu-Host-Acceptance-Required':'true','X-Haoduoyu-Source-Environment':runtimeModule==='native_parent'?'parent-memory-only':'documented-host-review-required'}:{}),
 }});
}
