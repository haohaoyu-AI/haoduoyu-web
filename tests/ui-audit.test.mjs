import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/init\(\);\s*$/,'');
function client(){
 const body={style:{}},nodes=new Map([['#overlay',{innerHTML:'',firstChild:null,contains(){return false}}]]);
 const document={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener(){},body,activeElement:body};
 const context=vm.createContext({document,window:{addEventListener(){}},location:{href:'http://localhost/',search:''},history:{replaceState(){}},URL,URLSearchParams,Intl,localStorage:{getItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout});
 new vm.Script(source).runInContext(context);return {run:s=>vm.runInContext(s,context),nodes,document,context};
}
test('only adjacent equal type, raw actor and Beijing date merge; no row disappears',()=>{
 const c=client();c.run(`state.me={id:'me'};rows=[
 {action:'auth.login',actor:'user:me',created_at:'2001-01-02T04:00:03Z'},
 {action:'POST /auth/login',actor:'user:me',created_at:'2001-01-02T04:00:02Z'},
 {action:'auth.logout',actor:'user:me',created_at:'2001-01-02T04:00:01Z'},
 {action:'auth.login',actor:'user:me',created_at:'2001-01-02T04:00:00Z'},
 {action:'auth.login',actor:'user:other',created_at:'2001-01-02T03:59:59Z'},
 {action:'auth.login',actor:'user:other',created_at:'2001-01-01T15:59:59Z'}]`);
 const html=c.run('renderAudit(rows)');assert.equal((html.match(/<details /g)||[]).length,5);assert.equal((html.match(/<li>/g)||[]).length,6);assert.match(html,/登录网站 ×2/);assert.match(html,/<h3>2001-01-02<\/h3>/);assert.match(html,/<h3>2001-01-01<\/h3>/);assert.doesNotMatch(html,/<details[^>]* open/);
 const first=c.run('e(time(rows[0].created_at))'),second=c.run('e(time(rows[1].created_at))');assert.ok(html.indexOf(first)>0&&html.indexOf(first)<html.indexOf(second));
});
test('midnight grouping uses Beijing dates, with today/yesterday headers',()=>{
 const c=client();const split=c.run(`renderAudit([{action:'auth.login',actor:'a',created_at:'2001-01-01T16:00:00Z'},{action:'auth.login',actor:'a',created_at:'2001-01-01T15:59:59Z'}])`);
 assert.match(split,/<h3>2001-01-02<\/h3>/);assert.match(split,/<h3>2001-01-01<\/h3>/);assert.equal((split.match(/<details /g)||[]).length,2);
 const relative=c.run(`renderAudit([{action:'x',created_at:new Date().toISOString()},{action:'x',created_at:new Date(Date.now()-86400000).toISOString()}])`);assert.match(relative,/<h3>今天<\/h3>/);assert.match(relative,/<h3>昨天<\/h3>/);
});
test('me requires exact authenticated id; key names escape, unmatched actors stay distinguishable',()=>{
 const c=client();c.run(`state.me={id:'me',username:'same'};rows=['user:me','user:me-other','key:k','key:absent','unknown:source'].map(actor=>({action:'auth.login',actor,created_at:'2001-01-01T00:00:00Z'}))`);
 const html=c.run(`renderAudit(rows,[{id:'k',name:'<凭据 & 名称>',token:'must-not-render'}])`);assert.equal((html.match(/我 ·/g)||[]).length,1);assert.match(html,/用户 2/);assert.match(html,/&lt;凭据 &amp; 名称&gt;/);assert.match(html,/未识别凭据 4/);assert.match(html,/未知来源 5/);assert.doesNotMatch(html,/user:|key:|unknown:source|must-not-render|<凭据/);
 c.run(`state.me={username:'same'}`);assert.doesNotMatch(c.run('renderAudit(rows)'),/我 ·/);
});
test('loaded article links escape titles and IDs; unknown entities omit UUID while retaining action',()=>{
 const c=client();c.run(`state.articles=[{id:'a"<',title:'<img onerror=1>'}];rows=[{action:'POST /articles',actor:'x',entity_id:'a"<',created_at:'bad'},{action:'<unknown>',actor:'y',entity_id:'00000000-1111-2222-3333-444444444444',created_at:null}]`);
 const html=c.run('renderAudit(rows)');assert.match(html,/data-action="article-detail"/);assert.match(html,/data-id="a&quot;&lt;"/);assert.match(html,/&lt;img onerror=1&gt;/);assert.match(html,/&lt;unknown&gt;/);assert.doesNotMatch(html,/<img|00000000-1111|<unknown>/);assert.match(html,/日期未知/);assert.equal((html.match(/<li>/g)||[]).length,2);
 assert.match(c.run('renderAudit([])'),/暂无操作记录/);
});
test('legacy and actual action aliases retain labels, including arbitrary article ids',()=>{
 const c=client();for(const [actions,label] of [
 [['article.create','POST /articles'],'新增文章'],[['article.update','PUT /articles/any-id'],'修改文章'],[['account.update','PUT /accounts/any-id'],'修改账号'],[['api_key.create','api_key.created','POST /api-keys'],'创建 AI 凭证'],[['api_key.revoke','api_key.revoked','DELETE /api-keys/any-id'],'撤销 AI 凭证'],[['auth.password','auth.password_changed','PUT /auth/password'],'修改密码']])for(const action of actions)assert.equal(c.run('auditLabel('+JSON.stringify(action)+')'),label);
 assert.equal(c.run('auditLabel(null)'),'未知操作');
});
test('shared segmented and full field helper preserve controls and escape new dynamic values',()=>{
 const c=client();const html=c.run(`segmented('test',[['<id>','<label>']],'<id>','<group>','tab','page-tabs')`);assert.match(html,/class="segmented page-tabs"/);assert.match(html,/data-tab="&lt;id&gt;"/);assert.match(html,/aria-pressed="true"/);assert.match(html,/aria-label="&lt;group&gt;"/);assert.doesNotMatch(html,/<label>/);
 const field=c.run(`field('title','标题','text','<value>','maxlength="500" required',true)`);assert.match(field,/class="form-field full"/);assert.match(field,/id="field-title"/);assert.match(field,/name="title"/);assert.match(field,/value="&lt;value&gt;"/);assert.match(field,/maxlength="500" required/);
});

test('invalid timestamps do not establish a common Beijing day for merging',()=>{
 const c=client();const html=c.run(`renderAudit([{action:'auth.login',actor:'user:a',created_at:'bad-a'},{action:'auth.login',actor:'user:a',created_at:'bad-b'}])`);assert.equal((html.match(/<details /g)||[]).length,2);assert.equal((html.match(/<li>/g)||[]).length,2);assert.doesNotMatch(html,/×2/);
});
