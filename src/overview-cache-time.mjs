import { articleFacts } from './analytics.mjs';
import { pendingReviewEvents } from './overview.mjs';
const DAY=86400000,OFFSET=28800000;

// A piecewise-constant overview may change only at these exact recorded events.
// This does not extend validity on clock rollback or across a Beijing day edge.
export function nextOverviewChange({accounts,articles,observations,now}) {
  const ids=new Set(accounts.map(row=>row.id));
  const rows=articles.filter(row=>ids.has(row.account_id)).map(articleFacts).filter(row=>row.date_status==='recorded');
  let next=(Math.floor((Number(now)+OFFSET)/DAY)+1)*DAY-OFFSET;
  for(const event of pendingReviewEvents(rows,observations)) if(event.dueAt>now) next=Math.min(next,event.dueAt);
  for(const article of rows) {
    const published=Date.parse(article.published_at);
    const number=Number(/^【保险200篇·第(\d+)篇】/.exec(article.title)?.[1]);
    if(article.platform==='wechat'&&article.topic==='insurance'&&number>=1&&number<=200&&published>now) next=Math.min(next,published);
  }
  return next;
}
