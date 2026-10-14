// Real Chromium controls/download against intercepted synthetic HTML only.
// No request reaches 得到 and no signed-in user browser is accessed.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'dedao-browser-synthetic-'));let browser,child;
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename="synthetic-word.docx"'});res.end('SYNTHETIC WORD BYTES');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const fileURL=`http://127.0.0.1:${server.address().port}/synthetic-word.docx`;
try{
 child=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+folder],{stdio:'ignore'});
 let endpoint;for(let n=0;n<60;n++){try{const port=(await fs.readFile(path.join(folder,'DevToolsActivePort'),'utf8')).split('\n')[0];endpoint='http://127.0.0.1:'+port;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(endpoint);process.env.DEDAO_CDP_URL=endpoint;browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
 const context=browser.contexts()[0],p=await context.newPage();
 const fixture=`<!doctype html><html><body><h1>Synthetic 得到 controls</h1><button style="display:none">Hidden button</button><textarea id="composer"></textarea><button id="send" disabled onclick="document.body.dataset.sent=String(Number(document.body.dataset.sent||0)+1);document.getElementById('composer').value=''">发送</button><button>打开正文</button><button>重新生成</button><button id="download" onclick="const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['SYNTHETIC WORD BYTES']));a.download='synthetic-word.docx';a.click()">下载 Word</button><button aria-haspopup="menu">导出</button><div contenteditable="true">Synthetic contenteditable</div></body></html>`;
 await context.route('**/*',route=>route.request().url().startsWith(fileURL)?route.continue():route.fulfill({contentType:'text/html',body:fixture.replace("URL.createObjectURL(new Blob(['SYNTHETIC WORD BYTES']))","'"+fileURL+"'")}));
 const {browserAction,browserProbe,conversationURL,disconnectBrowser}=await import('../scripts/dedao/browser.mjs');await p.goto(conversationURL);
 const scope={workDir:folder,downloadDir:path.join(folder,'downloads'),batchId:'synthetic-batch',ordinal:1};
 const probe=await browserProbe(scope.downloadDir);assert.equal(probe.browser_connected,true);assert.equal(probe.logged_in,true);assert.equal(probe.download_readable,true);
 const inspected=await browserAction('inspect',{},scope);for(const control of inspected.controls)assert.equal(await p.locator(control.selector).count(),1);
 let consumed=0,permit=true;scope.beforeMutation=()=>{if(!permit)throw Error('No single-use permit');permit=false;consumed++;};
 const send={selector:'#composer',send_selector:'#send',text:'Synthetic frozen message'};
 const waiting=await browserAction('send_message',send,scope);assert.equal(waiting.waiting,true);assert.equal(consumed,0);assert.equal(await p.locator('#composer').inputValue(),send.text);
 await p.locator('#send').evaluate(e=>{e.disabled=false;});await browserAction('send_message',send,scope);assert.equal(consumed,1);assert.equal(await p.locator('body').getAttribute('data-sent'),'1');
 await assert.rejects(()=>browserAction('send_message',send,scope),/single-use/);assert.equal(await p.locator('body').getAttribute('data-sent'),'1');await p.locator('#composer').fill('');
 await assert.rejects(()=>browserAction('click',{selector:'#download'},scope),/own permit/);await assert.rejects(()=>browserAction('click',{selector:'button',index:3},scope));
 await p.goto('https://www.biji.com/writing/ANOTHER_CONVERSATION');await assert.rejects(()=>browserAction('send_message',send,scope),/authorized conversation/);assert.equal(consumed,1);
 await p.goto(conversationURL);permit=true;await browserAction('prepare_download',{selector:'button[aria-haspopup="menu"]'},scope);assert.equal(consumed,1);
 const downloaded=await browserAction('download',{selector:'#download'},scope),bytes=await fs.readFile(downloaded.path);assert.equal(downloaded.filename,'synthetic-word.docx');assert.equal(downloaded.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(bytes.toString(),'SYNTHETIC WORD BYTES');assert.equal(consumed,2);
 await disconnectBrowser();assert.equal(browser.isConnected(),true,'broker disconnect must preserve the original browser');assert.equal((await browserProbe(scope.downloadDir)).logged_in,true,'broker can reconnect to the same logged-in context');await disconnectBrowser();
 console.log('PASS real Chromium on synthetic intercepted HTML: unique grounded selectors, actual composer/login probe, disabled→enabled keeps one permit, one send and replay fence, wrong-conversation rejection, generic mutation/download blocked, export menu preparation, real download file/hash and disconnect/reconnect preserving original browser. No real 得到 login/content/execution.');
}finally{if(browser)await browser.close();if(child)child.kill();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,200));await fs.rm(folder,{recursive:true,force:true});}
