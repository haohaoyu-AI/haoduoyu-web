// This preview owns only an ephemeral local D1, never the production binding.
import { fixture } from '../tests/harness.mjs';
import assert from 'node:assert/strict';
const port=Number(process.env.PORT||8788);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local preview port');
const origin=`http://127.0.0.1:${port}`,app=await fixture(undefined,{port,origin});
try {
 const session=await app.login(),accounts=(await app.request('/api/v1/accounts',{session})).data;
 const stamp=days=>new Date(Date.now()-days*86400000-3600000).toISOString();
 const titles=Array.from({length:9},(_,index)=>`虚构预览样本 ${index+1}`);
 for(const [ai,account] of accounts.entries())for(let i=0;i<9;i++){
  const article=await app.request('/api/v1/articles',{session,method:'POST',body:{account_id:account.id,title:account.platform==='wechat'?`【保险200篇·第${120+i}篇】${titles[i]}`:titles[i],url:`https://example.invalid/local-preview/${ai}/${i}`,published_at:stamp(12+i%4),started_at:stamp(13+i%4),production_mode:i%2?'manual':'mixed',notes:i===8?'日期待核实；本地合成样本':'本地隔离合成样本',summary:'此记录仅用于未上线页面验收。'}});assert.equal(article.status,201);
  if(i===0)continue;
  const metrics={reads:i===1?0:(i+ai)*41,likes:i%4,comments:i%3};if(i===2)delete metrics.reads;if(i===3)delete metrics.likes;
  const snapshots=i===4?[['d1',10,{reads:0,likes:0,comments:0}],['d3',8,{reads:300,likes:5}],['d7',4,{reads:280,likes:3,comments:2}],['latest',1,metrics]]:[['latest',1,metrics]];
  for(const [kind,days,metrics] of snapshots)assert.equal((await app.request('/api/v1/observations',{session,method:'POST',body:{article_id:article.data.id,kind,as_of:stamp(days),collected_at:new Date(Date.parse(stamp(days))+1800000).toISOString(),metrics,source:'本地合成数据'}})).status,201);
 }
 // A few real daily records in this isolated fixture; missing days remain absent.
 for(const [ai,account] of accounts.entries())if(ai!==2)for(const day of [1,2,4]){
  const date=new Date(Date.now()+8*3600000-day*86400000).toISOString().slice(0,10);
  assert.equal((await app.request('/api/v1/daily-metrics',{session,method:'POST',body:{account_id:account.id,date,metrics:{reads:day*17+ai,likes:day,comments:0},source:'本地合成日新增'}})).status,201);
 }
 await app.request('/api/v1/auth/logout',{session,method:'POST'});
 console.log(`Isolated analytics preview ready: ${String(await app.mf.ready)}`);
 console.log('Synthetic records only. Uses the existing test-only administrator in tests/harness.mjs.');
} catch(error){await app.mf.dispose();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.mf.dispose();process.exit(0)});
