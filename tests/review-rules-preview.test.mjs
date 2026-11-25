import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
test('synthetic browser fixture isolates accounts and exposes no writes or repository data',async()=>{
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const {port}=socket.address();await new Promise(resolve=>socket.close(resolve));
  const child=spawn(process.execPath,['scripts/preview-review-rules.mjs'],{
    cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe'],
  });
  let output='',exited=false;child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  child.once('exit',()=>exited=true);
  try {
    const deadline=Date.now()+10000;
    while(!output.includes('Synthetic review rules preview:')) {
      if(exited||Date.now()>deadline)throw new Error(output||'Fixture failed to start');await delay(25);
    }
    const origin=`http://127.0.0.1:${port}`;
    for(const [account,scope] of [['V字','vzi'],['鱼见','yujian'],['公众号','wechat']]) {
      const response=await fetch(origin+'/?account='+encodeURIComponent(account));assert.equal(response.status,200);
      const html=await response.text();assert.match(html,new RegExp(`data-rule-scope="${scope}" open`));
      const body=html.slice(html.indexOf('<section id="content-review"'),html.indexOf('</main>'));
      assert.equal((body.match(/data-rule-state="overridden"/g)||[]).length,scope==='wechat'?0:2);
      assert.equal((body.match(/class="review-rule-layer"/g)||[]).length,scope==='wechat'?1:3);
      assert.match(body,/&lt;svg onload=alert\(1\)&gt;/);assert.doesNotMatch(body,/<svg onload/);
      for(const foreign of ['vzi','yujian','wechat'].filter(item=>item!==scope))assert.doesNotMatch(body,new RegExp(`data-rule-scope="${foreign}"`));
    }
    assert.equal((await fetch(origin+'/public/review.css')).status,200);
    assert.equal((await fetch(origin+'/web/review-controller.mjs')).status,200);
    for(const path of ['/api/v1/review/prompts','/.git/config','/public/%2e%2e%2fsrc/review-prompts.mjs','/?account=invalid'])assert.ok((await fetch(origin+path)).status>=400);
    assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  } finally {if(!exited){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}}
});
