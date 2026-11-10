// Isolated visual fixture: synthetic content only, no database or write endpoints.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const accounts=['整体','头条','V字','鱼见','公众号'];
const books=accounts.map((account,index)=>({id:`fixture-${index}`,account,status:'active',version:2,
  published_on:'2026-11-10',content_md:`# ${account}合成验收数据\n这些是测试内容，不是真实规则。`,
  rules:[{rule_id:'SHARED-001',section:index%2?'title':'body',
    text:`**${account}同 ID 规则**\n- [red]固定红色底线[/red]\n- [amber]检查提醒[/amber]`},
  {rule_id:`OWN-${index}`,section:'body',text:`**${account}独有规则**\n[blue]说明文字[/blue] [green]通过标记[/green]\n<svg onload=alert(1)>应当显示为文字</svg>`}]}));
const prompts=['global','toutiao','vzi','yujian','wechat'].map(scope=>({id:`prompt-${scope}`,scope,
  prompt_key:'longform_write',status:'active',version:2,title:`${scope} 合成提示词`,
  updated_at:'2026-11-10T04:00:00Z',content_md:`# 合成提示词 ${scope}\n**完整原文**\n> 测试引用\n\n\`\`\`\n${'long_code_'.repeat(90)}\n\`\`\`\n`}));
const css=['tokens.css','style.css','review.css'].map(name=>`<link rel="stylesheet" href="/public/${name}">`).join('');
function page(account) {
  const body=renderContentReviewContent(normalizeReviewData({playbooks:books,prompts}),{account,filters:{},secondary:'review'});
  const links=accounts.map(name=>`<a href="/?account=${encodeURIComponent(name)}">${name}</a>`).join(' · ');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>规则与提示词 · 合成验收</title>${css}<style>body{padding:16px}main{max-width:1100px;margin:auto}nav{margin-bottom:16px}</style>
  <main><h1>规则与提示词 · 合成验收</h1><p>只读合成内容，无数据库连接、无生产数据。</p><nav>${links}</nav>
  <section id="content-review" class="content-review">${body}</section></main>
  <script type="module">
  import {copyReviewPrompt} from '/web/review-controller.mjs';
  const prompts=${JSON.stringify(prompts)},account=${JSON.stringify(account)};
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-review-action="copy-prompt"]');if(!button)return;
    const status=button.closest('.review-current-prompt').querySelector('[data-prompt-copy-status]');
    try{await copyReviewPrompt(prompts,account,button.dataset.promptId);status.textContent='已复制完整提示词。';}
    catch(error){status.textContent=error.message;}
  });</script></html>`;
}
const port=Number(process.env.PORT||8796);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be between 1024 and 65535');
http.createServer(async(request,response)=>{
  try {
    if(request.method!=='GET') {response.writeHead(405);response.end();return;}
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/') {
      const account=url.searchParams.get('account')||'V字';
      if(!accounts.includes(account)) {response.writeHead(400);response.end('Unknown synthetic account');return;}
      response.setHeader('Content-Type','text/html; charset=utf-8');response.end(page(account));return;
    }
    const name=decodeURIComponent(url.pathname),file=resolve(root,'.'+name);
    const allowed=name.startsWith('/public/')&&name.endsWith('.css')||
      ['/web/','/shared/'].some(prefix=>name.startsWith(prefix))&&name.endsWith('.mjs');
    if(!allowed||!file.startsWith(root.endsWith(sep)?root:root+sep))throw new Error('Not found');
    response.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');
    response.end(await readFile(file));
  } catch {response.writeHead(404);response.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic review rules preview: http://127.0.0.1:${port}/`));
