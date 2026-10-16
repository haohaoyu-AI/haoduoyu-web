import {owner} from '../../../../lib/test-store';
import {readLocalWordJob,localWordPublicError} from '../../../../lib/local-word-jobs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const user=owner(request);if(!user)return new Response('Unauthorized',{status:401});try{return Response.json(await readLocalWordJob(user,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return Response.json({error:localWordPublicError(error)},{status:404,headers:{'Cache-Control':'private, no-store'}});}}
