import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {discoverCdp} from './configuration.mjs';
export const conversationURL='https://www.biji.com/writing/6aa3c781dd3446e897981a7c';
let browser,context,page;
const hash=b=>createHash('sha256').update(b).digest('hex');
async function connect(){
 if(!browser?.isConnected()&&process.env.DEDAO_CHROME_PROFILE){const endpoint=await discoverCdp(process.env.DEDAO_CHROME_PROFILE);if(!endpoint)throw Error('The existing Chrome debugging connection is unavailable');process.env.DEDAO_CDP_URL=endpoint;}
 if(!process.env.DEDAO_CDP_URL)throw Error('DEDAO_CDP_URL is missing');
 if(!browser?.isConnected()){browser=await chromium.connectOverCDP(process.env.DEDAO_CDP_URL);context=browser.contexts()[0];if(!context)throw Error('Existing browser context unavailable');}
 if(!page||page.isClosed()){
  page=context.pages().find(p=>p.url().split('?')[0]===conversationURL);
  if(!page){page=await context.newPage();await page.goto(conversationURL,{waitUntil:'domcontentloaded'});}
 }
 return page;
}
// connectOverCDP.close disconnects this Playwright transport; it does not send
// Browser.close to the user's Chrome (pinned Playwright 1.60 implementation).
export async function disconnectBrowser(){if(browser)await browser.close();browser=undefined;context=undefined;page=undefined;}
export async function browserContext(){await connect();return context;}
export async function browserProbe(downloadDir){
 let connected=false,logged=false;
 try{const p=await connect();connected=true;const inputs=p.locator('textarea,[contenteditable="true"],[role="textbox"]');
  for(let i=0;i<await inputs.count();i++)if(await inputs.nth(i).isVisible())logged=true;
  if(p.url().split('?')[0]!==conversationURL||await p.getByRole('button',{name:/^(登录|立即登录|扫码登录|Sign in)$/i}).isVisible().catch(()=>false))logged=false;
 }catch{/* No fabricated login capability. The UI reports disconnected. */}
 let readable=false;
 try{await fs.mkdir(downloadDir,{recursive:true});const probe=path.join(downloadDir,`.dedao-probe-${process.pid}`);await fs.writeFile(probe,'probe',{flag:'wx',mode:0o600});readable=await fs.readFile(probe,'utf8')==='probe';await fs.unlink(probe);}catch{}
 return {conversation_url:conversationURL,checked_at:new Date().toISOString(),browser_connected:connected,logged_in:logged,download_readable:readable};
}
export async function browserAction(command,args,{workDir,downloadDir,batchId,ordinal,beforeMutation=()=>{}}){
 const p=await connect();
 if(command==='inspect'){
  const screenshot=path.join(workDir,`dedao-${batchId}-${ordinal}.png`);await p.screenshot({path:screenshot,fullPage:true});
  const dom=await p.locator('body').evaluate(body=>{
   const visible=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden';};
   const selector=e=>{const chain=[];for(let n=e;n&&n!==document.documentElement;n=n.parentElement){if(n.id&&document.querySelectorAll('#'+CSS.escape(n.id)).length===1){chain.unshift('#'+CSS.escape(n.id));break;}chain.unshift(n.tagName.toLowerCase()+':nth-child('+(Array.from(n.parentElement?.children||[]).indexOf(n)+1)+')');}return chain.join(' > ');};
   return {text:body.innerText.slice(-100000),controls:Array.from(body.querySelectorAll('button,a,input,textarea,[contenteditable="true"],[role="button"],[role="textbox"]')).filter(visible).map(e=>({tag:e.tagName,selector:selector(e),role:e.getAttribute('role'),text:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').slice(0,300),disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true'}))};
  });return {url:p.url(),title:await p.title(),screenshot,...dom,observed_at:new Date().toISOString()};
 }
 if(p.url().split('?')[0]!==conversationURL)throw Error('The browser left the authorized conversation; restore the same login/conversation before any action');
 if(typeof args.selector!=='string'||!args.selector||args.selector.length>1000)throw Error('Use a selector from the actual inspected page');
 const locator=p.locator(args.selector).nth(Number.isSafeInteger(args.index)?args.index:0);
 if(command==='read')return {text:await locator.innerText(),observed_at:new Date().toISOString()};
 if(command==='send_message'){
  if(typeof args.text!=='string'||typeof args.send_selector!=='string')throw Error('Exact message and observed send selector required');
  const editable=await locator.evaluate(e=>e.matches('textarea,[contenteditable="true"],[role="textbox"]'));
  if(!editable)throw Error('The inspected selector is not a composer');
  const send=p.locator(args.send_selector).nth(Number.isSafeInteger(args.send_index)?args.send_index:0);
  if(!await locator.isVisible()||!await locator.isEditable())return {waiting:true,reason:'composer_unavailable',action_not_consumed:true};
  const existing=await locator.evaluate(e=>e.value||e.innerText||'');if(existing.trim()&&existing!==args.text)throw Error('Composer contains different unsent text; inspect it before replacing');
  await locator.fill(args.text);
  if(!await send.isEnabled())return {waiting:true,reason:'send_unavailable',action_not_consumed:true};
  if(p.url().split('?')[0]!==conversationURL)throw Error('Conversation changed before send');
  beforeMutation();
  await send.click({timeout:10000});return {sent:true,observed_at:new Date().toISOString()};
 }
 if(command==='click'){
  const label=(await locator.getAttribute('aria-label')||await locator.innerText()).trim();
  if(!/^(查看|打开|展开|收起|关闭|返回|正文|文稿|历史|最新|版本)/.test(label)||/(发送|确认|开始|生成|重写|重新|删除|保存|下载|导出|定稿|下一篇|选题|发布)/.test(label))throw Error('Only inspected document/history navigation is allowed; message/download actions need their own permit');
  const pending=p.locator('textarea,[contenteditable="true"],[role="textbox"]');for(let n=0;n<await pending.count();n++){const field=pending.nth(n);if(await field.isVisible()){const text=await field.evaluate(e=>e.value||e.innerText||'');if(text.trim())throw Error('Composer has text: use the reserved send_message action; navigation is blocked');}}
  await locator.click({timeout:10000});return {clicked:true,observed_at:new Date().toISOString()};
 }
 if(command==='prepare_download'){
  if(await locator.getAttribute('aria-haspopup')!=='menu')throw Error('Only a verified export menu can be prepared without consuming the download');
  await locator.click({timeout:10000});return {menu_opened:true};
 }
 if(command==='download'){
  const folder=path.join(downloadDir,batchId,String(ordinal));await fs.mkdir(folder,{recursive:true});
  if(!await locator.isEnabled())return {waiting:true,reason:'download_unavailable',action_not_consumed:true};
  beforeMutation();
  const [download]=await Promise.all([p.waitForEvent('download',{timeout:90000}),locator.click({timeout:10000})]);
  const filename=download.suggestedFilename();if(!filename.toLowerCase().endsWith('.docx')||filename!==path.basename(filename)||/[\u0000-\u001f<>:"/\\|?*]/.test(filename))throw Error('Unexpected Word filename; retain original download for manual review');
  const target=path.join(folder,filename);
  try{await fs.access(target);throw Error('Named Word already exists; inspect its bytes first, do not overwrite or download again');}catch(e){if(e.code!=='ENOENT')throw e;}
  await download.saveAs(target);if(await download.failure())throw Error('Word download failed');
  const bytes=await fs.readFile(target);return {filename,path:target,size:bytes.length,sha256:hash(bytes),observed_at:new Date().toISOString()};
 }
 throw Error('Unknown browser command');
}
