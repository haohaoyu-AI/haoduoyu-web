import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyReviews,weeklyPreview,renderWeeklyReview} from '../web/pages/review-weekly.mjs';

// Synthetic reports only.
const report=(start,end,summary,extra={})=>({id:start,account:'V字',period_type:'weekly',period_start:start,period_end:end,summary_md:summary,created_at:end+'T01:00:00Z',...extra});
const reports=[report('2026-10-23','2026-10-30','# 合成周复盘一\n\n合成：第一周发了 3 篇。'),
  report('2026-11-09','2026-11-15','# 合成周复盘三\n\n合成：本周发了 5 篇。\n\n## 最好的\n- 合成甲 <b>x</b>'),
  report('2026-11-02','2026-11-08','合成：第二周 **两篇** 爆款。'),
  report('2026-11-14','2026-11-14','合成日报',{period_type:'daily'}),
  report('2026-11-09','2026-11-15','合成：别的账号',{account:'鱼见'})];

test('the newest weekly review is one folded row at the top; earlier weeks follow inside, newest first',()=>{
  assert.deepEqual(weeklyReviews(reports,'V字').map(item=>item.period_end),['2026-11-15','2026-11-08','2026-10-30']);
  const html=renderWeeklyReview({reports},{account:'V字'});
  assert.match(html,/<details class="review-weekly-latest"><summary><span class="review-weekly-title">周复盘<\/span><span class="review-weekly-date">11月9日 至 11月15日<\/span><span class="review-weekly-preview">合成：本周发了 5 篇。<\/span>/);
  assert.doesNotMatch(html,/<details[^>]* open/,'everything starts folded');
  assert.match(html,/合成：本周发了 5 篇/);assert.doesNotMatch(html,/合成日报|别的账号/);
  assert.match(html,/&lt;b&gt;x&lt;\/b&gt;/,'report text is escaped');
  const older=html.split('往期')[1];
  assert.ok(older.indexOf('11月2日 至 11月8日')<older.indexOf('10月23日 至 10月30日'));
  assert.equal((older.match(/<details class="review-weekly-week">/g)||[]).length,2,'earlier weeks start folded');
  assert.match(older,/<span class="review-weekly-preview">合成：第二周 两篇 爆款。<\/span>/);
});

test('no weekly review means no block, and the preview skips headings',()=>{
  assert.equal(renderWeeklyReview({reports:reports.filter(item=>item.period_type!=='weekly')},{account:'V字'}),'');
  assert.equal(renderWeeklyReview({reports},{account:'公众号'}),'');
  assert.equal(weeklyPreview('# 标题\n\n- 合成：第一句。\n第二句'),'合成：第一句。');
  assert.equal(weeklyPreview(''),'');
});
