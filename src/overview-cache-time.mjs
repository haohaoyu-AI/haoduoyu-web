import { articleFacts } from './analytics.mjs';
const DAY=86400000,OFFSET=28800000;

// A piecewise-constant overview may change only at these exact recorded events.
// This does not extend validity on clock rollback or across a Beijing day edge.
export function nextOverviewChange({accounts,articles,observations,now}) {
  const ids=new Set(accounts.map(row=>row.id));
  const rows=articles.filter(row=>ids.has(row.account_id)).map(articleFacts).filter(row=>row.date_status==='recorded');
  const selected=new Set(rows.map(row=>row.id)),reviews=new Map();
  for(const row of observations) if(selected.has(row.article_id)) {
    if(!reviews.has(row.article_id)) reviews.set(row.article_id,[]);
    reviews.get(row.article_id).push(row);
  }
  let next=(Math.floor((Number(now)+OFFSET)/DAY)+1)*DAY-OFFSET;
  for(const article of rows) {
    const published=Date.parse(article.published_at);
    for(const [kind,days] of [['d1',1],['d3',3],['d7',7]]) {
      const due=published+days*DAY;
      if(due>now&&!(reviews.get(article.id)??[]).some(row=>row.kind===kind&&Date.parse(row.as_of)>=due)) next=Math.min(next,due);
    }
    const number=Number(/^【保险200篇·第(\d+)篇】/.exec(article.title)?.[1]);
    if(article.platform==='wechat'&&article.topic==='insurance'&&number>=1&&number<=200&&published>now) next=Math.min(next,published);
  }
  return next;
}
