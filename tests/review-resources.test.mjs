import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor,stable} from '../src/security.mjs';
import {reviewView} from '../src/content-review-validation.mjs';
import {validateReviewAttributionMigrationSource,reviewAttributionMigrationTag} from '../scripts/migration-contract.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},publicHeaders={Origin:origin,'X-Public-Business':'1'};
  async function call(path,method='GET',data,headers=publicHeaders,settings=env) {
    const h=new Headers(headers);if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),settings,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  return {db,sql,owner,token,env,origin,call,publicHeaders,auth:{...publicHeaders,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}


test('new review resources support replay, conflicts, pagination, soft delete and restore',async t=>{
  const a=fixture(t),bid=randomUUID(),b={account:'V字',platform:'toutiao',name:'Synthetic benchmark'};
  let r=await a.call('benchmark-accounts/'+bid,'PUT',b);assert.equal(r.status,201);assert.equal(r.data.is_featured_author,null);assert.equal(r.data.title_patterns,null);
  assert.deepEqual((await a.call('benchmark-accounts/'+bid,'PUT',b)).data,r.data);
  assert.equal((await a.call('benchmark-accounts/'+bid,'PUT',{...b,name:'changed'})).status,409);
  assert.equal((await a.call('benchmark-accounts/'+randomUUID(),'PUT',b)).status,409);
  assert.equal((await a.call('benchmark-accounts/'+bid,'PATCH',{expected_hash:'0'.repeat(64),name:'changed'})).status,409);
  r=await a.call('benchmark-accounts/'+bid,'PATCH',{expected_hash:r.data.content_hash,is_featured_author:true});assert.equal(r.data.is_featured_author,true);
  const deleted=await a.call('benchmark-accounts/'+bid,'DELETE',{expected_hash:r.data.content_hash,save_id:randomUUID()});assert.equal(deleted.status,200);assert.ok(deleted.data.deleted_at);
  assert.equal((await a.call('benchmark-accounts?account=V%E5%AD%97')).data.items.length,0);
  assert.equal((await a.call('benchmark-accounts?include_deleted=1')).data.items.length,1);
  const restored=await a.call('benchmark-accounts/'+bid+'/restore','POST',{expected_hash:deleted.data.content_hash,save_id:randomUUID()});assert.equal(restored.status,200);assert.equal(restored.data.deleted_at,null);
  for(let i=0;i<101;i++)assert.equal((await a.call('notes/'+randomUUID(),'PUT',{account:'V字',note_date:'2026-10-31',kind:'insight',title:'n'+i},a.auth)).status,201);
  const page=await a.call('notes?account=V%E5%AD%97');assert.equal(page.data.items.length,100);assert.equal(page.data.has_more,true);
  assert.equal((await a.call('notes?offset=100&read_revision='+page.data.read_revision)).data.items.length,1);
  await a.call('account-health/'+randomUUID(),'PUT',{account:'V字',platform:'toutiao',observed_on:'2026-10-31',judgement:'降权',platform_notice:{text:'notice',date:'2026-10-30'}});
  assert.equal((await a.call('notes?offset=100&read_revision='+page.data.read_revision)).error.code,'READ_REVISION_CHANGED');
  assert.equal((await a.call('account-health?account=V%E5%AD%97')).data.items[0].judgement,'降权');
});

test('benchmark article relation is single source, account scoped and protected on deletion; batch is per item',async t=>{
  const a=fixture(t),parent=randomUUID(),other=randomUUID(),ref=randomUUID(),article=randomUUID();
  await a.call('benchmark-accounts/'+parent,'PUT',{account:'V字',platform:'toutiao',name:'one'});
  await a.call('benchmark-accounts/'+other,'PUT',{account:'other',platform:'toutiao',name:'two'});
  const item={id:ref,benchmark_account_id:parent,title:'reference',url:'https://example.com/a',reads:200};
  const batch=await a.call('benchmark-articles:batch','PUT',{items:[item,{...item,id:randomUUID()},{id:randomUUID(),title:'bad'}]});
  assert.deepEqual(batch.data.items.map(x=>x.status),[201,409,400]);
  let reference=(await a.call('benchmark-articles/'+ref)).data;assert.deepEqual(reference.used_by_article_ids,[]);
  assert.equal((await a.call('benchmark-articles?account=other')).data.items.length,0);
  assert.equal((await a.call('benchmark-articles?account=V%E5%AD%97')).data.items[0].account,'V字');
  assert.equal((await a.call('articles/'+randomUUID(),'PUT',{account:'other',title:'wrong account',reference_article_id:ref})).status,404);
  const made=await a.call('articles/'+article,'PUT',{account:'V字',title:'ours',reference_article_id:ref});assert.equal(made.status,201);
  reference=(await a.call('benchmark-articles/'+ref)).data;assert.deepEqual(reference.used_by_article_ids,[article]);
  assert.equal((await a.call('benchmark-articles/'+ref,'DELETE',{expected_hash:reference.content_hash,save_id:randomUUID()})).status,409);
  assert.equal((await a.call('benchmark-articles/'+ref,'PATCH',{expected_hash:reference.content_hash,used_by_article_ids:[]})).status,409);
  assert.equal((await a.call('benchmark-accounts/'+parent,'DELETE',{expected_hash:(await a.call('benchmark-accounts/'+parent)).data.content_hash,save_id:randomUUID()})).status,409);
  const cleared=await a.call('articles/'+article,'PATCH',{expected_hash:made.data.content_hash,reference_article_id:null});assert.equal(cleared.status,200);
  reference=(await a.call('benchmark-articles/'+ref)).data;assert.deepEqual(reference.used_by_article_ids,[]);
  const del=await a.call('benchmark-articles/'+ref,'DELETE',{expected_hash:reference.content_hash,save_id:randomUUID()});assert.equal(del.status,200);
  assert.equal((await a.call('benchmark-articles/'+ref+'/restore','POST',{expected_hash:del.data.content_hash,save_id:randomUUID()})).status,200);
});

test('each resource enforces public authentication and conditional lifecycle',async t=>{
  const a=fixture(t),parent=randomUUID();
  await a.call('benchmark-accounts/'+parent,'PUT',{account:'A',platform:'toutiao',name:'B'},a.auth);
  const cases=[
    ['benchmark-accounts',{account:'A',platform:'toutiao',name:'C'}],
    ['benchmark-articles',{benchmark_account_id:parent,title:'T',url:'https://example.com/b'}],
    ['notes',{account:'A',note_date:'2026-10-31',kind:'decision',title:'T'}],
    ['account-health',{account:'A',platform:'toutiao',observed_on:'2026-10-31',judgement:'封禁'}]
  ];
  for(const [kind,body] of cases){
    const id=randomUUID(),path=kind+'/'+id;
    assert.equal((await a.call(path,'PUT',body,{})).status,403,kind);
    assert.equal((await a.call(path,'PUT',body,{...a.publicHeaders,Origin:'https://evil.invalid'})).status,403,kind);
    assert.equal((await a.call(path,'PUT',body,{...a.publicHeaders,Authorization:'Bearer invalid'})).status,401,kind);
    const created=await a.call(path,'PUT',body,a.auth);assert.equal(created.status,201,kind);
    assert.deepEqual((await a.call(path,'PUT',body,a.auth)).data,created.data,kind);
    assert.equal((await a.call(path,'PUT',{...body,account:'different'},a.auth)).status,kind==='benchmark-articles'?400:409,kind);
    assert.equal((await a.call(path,'PATCH',{expected_hash:'0'.repeat(64),...body},a.auth)).status,409,kind);
    const page=await a.call(kind+'?offset=0');assert.ok(page.data.items.some(x=>x.id===id),kind);
    const save=randomUUID(),del=await a.call(path,'DELETE',{expected_hash:created.data.content_hash,save_id:save},a.auth);assert.equal(del.status,200,kind);
    assert.deepEqual((await a.call(path,'DELETE',{expected_hash:created.data.content_hash,save_id:save},a.auth)).data,del.data,kind);
    assert.ok(!(await a.call(kind)).data.items.some(x=>x.id===id),kind);
    const restoreId=randomUUID(),restoreBody={expected_hash:del.data.content_hash,save_id:restoreId},restored=await a.call(path+'/restore','POST',restoreBody,a.auth);assert.equal(restored.status,200,kind);
    assert.equal((await a.call(path,'DELETE',{expected_hash:created.data.content_hash,save_id:save},a.auth)).status,409,kind);
    assert.equal((await a.call(path,'DELETE',{expected_hash:restored.data.content_hash,save_id:randomUUID()},a.auth)).status,200,kind);
    assert.equal((await a.call(path+'/restore','POST',restoreBody,a.auth)).status,409,kind);
  }
  for(const judgement of ['normal','限流','降权','封禁'])assert.equal((await a.call('account-health/'+randomUUID(),'PUT',{account:'A',platform:'toutiao',observed_on:'2026-10-31',judgement},a.auth)).status,201);
  assert.equal((await a.call('account-health/'+randomUUID(),'PUT',{account:'A',platform:'toutiao',observed_on:'2026-10-31',judgement:'normal',ctr:101},a.auth)).status,400);
});

test('benchmark article sorting is deterministic and validates the requested field',async t=>{
  const a=fixture(t),parents=[randomUUID(),randomUUID()].sort();
  for(const [i,id] of parents.entries())await a.call('benchmark-accounts/'+id,'PUT',{account:'A',platform:'toutiao',name:'B'+i},a.auth);
  const rows=[{benchmark_account_id:parents[1],title:'one',url:'https://example.com/1',reads:10,collected_on:'2026-10-01'},{benchmark_account_id:parents[0],title:'two',url:'https://example.com/2',reads:100,collected_on:'2026-10-02'}];
  for(const row of rows)assert.equal((await a.call('benchmark-articles/'+randomUUID(),'PUT',row,a.auth)).status,201);
  for(const sort of ['benchmark_account_id','collected_on','reads'])assert.deepEqual((await a.call('benchmark-articles?sort='+sort)).data.items.map(x=>x.title),['two','one']);
  assert.equal((await a.call('benchmark-articles?sort=title')).status,400);
});

test('documented review creation examples match their schemas and execute successfully',async t=>{
  const api=JSON.parse(readFileSync(new URL('../public/openapi.json',import.meta.url),'utf8'));
  const a=fixture(t),prefix='/api/v1/review/';
  function requestExample(path,method){
    const content=api.paths[prefix+path][method].requestBody.content['application/json'];
    const schema=api.components.schemas[content.schema.$ref.split('/').at(-1)],body=content.example;
    const checkObject=(value,shape)=>{
      for(const key of shape.required||[])assert.ok(Object.hasOwn(value,key),`${path} requires ${key}`);
      if(shape.additionalProperties===false)for(const key of Object.keys(value))assert.ok(Object.hasOwn(shape.properties,key),`${path} has unknown ${key}`);
    };
    checkObject(body,schema);
    if(path.endsWith(':batch'))for(const item of body.items)checkObject(item,schema.properties.items.items);
    return body;
  }
  const parent=api.paths[prefix+'benchmark-accounts/{uuid}'].put.parameters.find(x=>x.name==='uuid').example;
  const account=requestExample('benchmark-accounts/{uuid}','put');
  assert.equal((await a.call('benchmark-accounts/'+parent,'PUT',account)).status,201);
  const cases=[
    ['benchmark-articles/{uuid}','benchmark-articles/'+randomUUID()],
    ['notes/{uuid}','notes/'+randomUUID()],
    ['account-health/{uuid}','account-health/'+randomUUID()]
  ];
  for(const [documented,route] of cases){
    const response=await a.call(route,'PUT',requestExample(documented,'put'));
    assert.equal(response.status,201,`${documented}: ${JSON.stringify(response.error)}`);
  }
  const batch=await a.call('benchmark-articles:batch','PUT',requestExample('benchmark-articles:batch','put'));
  assert.equal(batch.status,200);
  assert.deepEqual(batch.data.items.map(item=>item.status),[201]);
  const article=await a.call('articles','POST',requestExample('articles','post'));
  assert.equal(article.status,201,JSON.stringify(article.error));
});

test('single-line fields reject whitespace controls while Markdown retains them',async t=>{
  const a=fixture(t);
  const base={account:'V字',platform:'toutiao',name:'benchmark'};
  for(const value of ['bad\nname','bad\tname','bad\rname']) {
    assert.equal((await a.call('benchmark-accounts/'+randomUUID(),'PUT',{...base,name:value})).status,400);
    assert.equal((await a.call('notes/'+randomUUID(),'PUT',{account:'V字',note_date:'2026-10-31',kind:'insight',title:value})).status,400);
    assert.equal((await a.call('account-health/'+randomUUID(),'PUT',{account:'V字',platform:'toutiao',observed_on:'2026-10-31',action:value})).status,400);
  }
  const md='第一行\r\n\t第二行';
  const account=await a.call('benchmark-accounts/'+randomUUID(),'PUT',{...base,structure_notes_md:md});
  const note=await a.call('notes/'+randomUUID(),'PUT',{account:'V字',note_date:'2026-10-31',kind:'insight',title:'标题',body_md:md});
  assert.equal(account.status,201);assert.equal(account.data.structure_notes_md,'第一行\n\t第二行');
  assert.equal(note.status,201);assert.equal(note.data.body_md,'第一行\n\t第二行');
});
