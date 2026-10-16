import {owner} from '../../../../lib/test-store';
import {legacyGenerationNotice} from '../../../../lib/legacy-generation';
export async function POST(request:Request){
 if(!owner(request))return new Response('Unauthorized',{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-xiaoyu-rewrite')!=='1')return new Response('Forbidden',{status:403});
 return Response.json(legacyGenerationNotice,{status:410,headers:{'Cache-Control':'private, no-store'}});
}
