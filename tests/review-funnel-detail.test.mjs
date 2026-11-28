import test from 'node:test';
import assert from 'node:assert/strict';
import {funnelDiagnosis} from '../web/pages/review-article-list.mjs';
import {audienceFacts, completionCurvePoints, renderTrafficCard, trafficSourceList} from '../web/pages/review-traffic-card.mjs';

const stats = {ctr: 4, completion_rate: 20, impressions: 10000};
const observation = snapshot => ({kind: 'ready', snapshot});

test('漏斗诊断按点击、完读、展现列出偏低环节', () => {
  assert.deepEqual(funnelDiagnosis(observation({ctr: 1.7, completion_rate: 32, impressions: 196000}), stats).weak.map(s => s.label), ['点击低']);
  assert.deepEqual(funnelDiagnosis(observation({ctr: 2, completion_rate: 10, impressions: 3000}), stats).weak.map(s => s.label),
    ['点击低', '完读低', '展现少']);
  assert.deepEqual(funnelDiagnosis(observation({ctr: 4, completion_rate: 20, impressions: 10000}), stats).weak, []);
  assert.equal(funnelDiagnosis({kind: 'immature', snapshot: {ctr: 1}}, stats), null);
  assert.equal(funnelDiagnosis(observation({}), stats), null);
});

test('流量来源整组判断百分数还是小数', () => {
  assert.deepEqual(trafficSourceList({推荐频道: 58.68, 搜索: 39.88, 个人主页: 0.48}).map(([n, r]) => [n, r]),
    [['推荐频道', 58.68], ['搜索', 39.88], ['个人主页', 0.48]]);
  assert.deepEqual(trafficSourceList([{name: '推荐频道', rate: 0.6}, {name: '搜索', rate: 0.4}]), [['推荐频道', 60], ['搜索', 40]]);
  assert.deepEqual(trafficSourceList(null), []);
});

test('流失曲线接受头条原样字段', () => {
  assert.deepEqual(completionCurvePoints([{read_rate: 0.02, jump_rate: 1}, {read_rate: 1, jump_rate: 0.335}]), [[2, 100], [100, 33.5]]);
  assert.deepEqual(completionCurvePoints([[2, 100]]), []);
});

test('读者画像三句话', () => {
  assert.deepEqual(audienceFacts({age: {'>50': 3, '31-40': 1}, gender: {男: 3, 女: 1}, province: {广东: 5, 浙江: 4, 江苏: 3, 山东: 1}}),
    ['男性 75%', '50 岁以上最多（75%）', '广东、浙江、江苏读者最多']);
});

test('没有新数据时详情卡保持原样', () => {
  const html = renderTrafficCard([{id: 's', article_id: 'a', snapshot_date: '2026-11-27', reads: 10, ctr: 2}], 'a');
  assert.ok(!html.includes('review-traffic-extra'));
  assert.ok(!html.includes('收益'));
  const full = renderTrafficCard([{id: 's', article_id: 'a', snapshot_date: '2026-11-27', revenue: 24.81,
    traffic_sources: {推荐频道: 60, 搜索: 40}}], 'a');
  assert.ok(full.includes('¥24.81') && full.includes('展现从哪来'));
});
