import {effectiveWritingPrompt,effectiveWritingStyleVersion} from '../../../lib/writing-supplement';
import {owner} from '../../../lib/test-store';
import {writingStudioList} from '../../../lib/writing-studio-list';
import {writingOutlineTemplate,writingOutlineHelp} from '../../../lib/writing-outline-template';
export async function GET(r:Request){const u=owner(r);if(!u)return new Response('Unauthorized',{status:401});try{const offset=new URL(r.url).searchParams.get('work_offset')||'0';if(!/^\d{1,5}$/.test(offset))return Response.json({error:'列表位置无效'},{status:400});return Response.json({...await writingStudioList(u,Number(offset)),prompt:effectiveWritingPrompt,prompt_version:effectiveWritingStyleVersion,outline_template:writingOutlineTemplate,outline_help:writingOutlineHelp},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'暂时无法读取文章'},{status:503});}}
