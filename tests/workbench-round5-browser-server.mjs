// Loopback only: exactly eighty synthetic articles, no production data or bindings.
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from './harness.mjs';
import {beijingDay} from '../src/lib/time.mjs';
import worker from '../dist/server/index.js';

let app,environment;
const ids={articles:[],templates:[],entries:[]},stamp='2026-10-25T06:00:00.000Z';
const accounts=['toutiao-haoduoyu','zhihu-haoduoyu','wechat-xiaoyuer'];
const statuses=['drafting','illustrated','draft_saved','published','failed'];
async function facts() {
  const rows=(await app.db.prepare('SELECT * FROM matrix_articles ORDER BY id').all()).results;
  const observations=(await app.db.prepare('SELECT * FROM matrix_observations ORDER BY id').all()).results;
  return {count:rows.length,hash:createHash('sha256').update(JSON.stringify({rows,observations})).digest('hex')};
}
const server=createServer(async(request,response)=>{
  if(request.url==='/__fixture') {
    response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({synthetic:true,ids,accounts,today:beijingDay(Date.now()),...await facts()}));return;
  }
  try {
    const chunks=[];let length=0;
    for await(const chunk of request){length+=chunk.length;if(length>262144)throw Error('Synthetic request limit');chunks.push(chunk);}
    const body=Buffer.concat(chunks),incoming=new Request(environment.SITE_ORIGIN+request.url,{method:request.method,headers:request.headers,
      ...(!['GET','HEAD'].includes(request.method)&&body.length?{body}:{}),});
    const result=await worker.fetch(incoming,environment);
    response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
  }catch{response.writeHead(500,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'SYNTHETIC_FIXTURE_ERROR',message:'Synthetic fixture request failed'}}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
try {
  app=await fixture(null,{persist:false,origin});
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id,today=beijingDay(Date.now());
  environment={DB:app.db,SITE_ORIGIN:origin,DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(accounts)};
  const statements=[];
  for(let index=0;index<80;index++) {
    const id=randomUUID(),status=index<75?statuses[Math.floor(index/15)]:null;
    ids.articles.push({id,status,account_id:accounts[index%3]});
    statements.push(app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,url,published_at,production_mode,summary,notes,version,created_at,updated_at,status,run_dir,run_date,writer) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)')
      .bind(id,accounts[index%3],'合成文章'+String(index+1).padStart(2,'0'),status==='published'?'https://example.invalid/article/'+index:null,
        status==='published'?stamp:null,'unknown','','合成备注，所有字段保留',stamp,stamp,status,'synthetic/round5/'+index,'2026-10-25','human'));
    if(status==='published'&&index%2===1||index===75) {
      statements.push(app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(randomUUID(),id,stamp,stamp,'latest',JSON.stringify({reads:index===45||index===75?0:100+index,likes:0,comments:1}),
          '合成真实来源','合成数据记录',stamp));
    }
  }
  for(let offset=0;offset<statements.length;offset+=20)await app.db.batch(statements.slice(offset,offset+20));
  for(const text of ['整理今天的工作','核对已完成事项','明日提前计划']) {
    const id=randomUUID();ids.templates.push({id,text});
    await app.db.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at,deleted_at) VALUES(?,?,?,1,?,?,NULL)')
      .bind(owner,id,text,stamp,stamp).run();
  }
  for(const [category,text]of [['life','合成生活记录：完整展示'],['life','另一条合成生活记录'],['work','合成工作记录']]) {
    const id=randomUUID();ids.entries.push({id,category,text});
    await app.db.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,1,?,?,NULL)')
      .bind(owner,id,category,today,text,stamp,stamp).run();
  }
  console.log(origin);
}catch{await app?.mf.dispose();server.close();process.exit(1);}
async function close(){server.close();await app.mf.dispose();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
