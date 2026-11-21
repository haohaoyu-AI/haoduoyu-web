import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const account = 'V字';
const vm = secondary => ({account, secondary, now:'2026-11-21T12:00:00Z', filters:{}, article:'', loading:false, error:''});

function fixture() {
  return normalizeReviewData({
    benchmarkAccounts:[
      {id:'ba1',account,name:'浅黑科技',fans:179000,posting_cadence:'每天10-25篇',profile_url:'https://example.com/qhkj',
        topic_focus:'硬核科技与商业博弈',title_patterns:['数字对比型\n- 悬念反差'],structure_notes_md:'先抛冲突。再拆细节。'},
      {id:'ba2',account,name:'首席商业洞察',fans:439000,posting_cadence:'【已封号，停用】',
        topic_focus:'商业案例拆解'}
    ],
    benchmarkArticles:[
      {id:'sample-1',account,benchmark_account_id:'ba1',title:'参考爆款样本一',url:'https://example.com/s1',
        published_at:'2026-11-18T01:00:00Z',reads:250000},
      {id:'sample-2',account,benchmark_account_id:'ba2',title:'参考爆款样本二',url:'https://example.com/s2',
        published_at:'2026-11-19T02:00:00Z',reads:120000},
      {id:'sample-unused',account,benchmark_account_id:'ba1',title:'UNUSED_SAMPLE',
        published_at:'2026-11-20T00:00:00Z',reads:99999}
    ],
    articles:[
      {id:'a1',account,title:'我方爆款仿写',published_at:'2026-11-19T04:00:00Z',reference_article_id:'sample-1',url:'https://example.com/a1'},
      {id:'a2',account,title:'我方待发布草稿',publish_status:'pending',draft_saved_at:'2026-11-20T03:00:00Z',reference_article_id:'sample-2'}
    ],
    snapshots:[
      {id:'snap-1',article_id:'a1',snapshot_date:'2026-11-20',age_hours:24,reads:5200,impressions:32000,ctr:16.2,likes:45}
    ],
    playbooks:[{
      id:'pb6',account,status:'active',version:6,published_on:'2026-11-10',
      content_md:'# 写作规则 v6\n核心原则总纲。\n\n### 写文提示词\n\n请写出冲突感。',
      rules:[
        {rule_id:'T1',section:'keep_topic',text:'聚焦硬核技术突破'},
        {rule_id:'D1',section:'drop_topic',text:'不写医疗养生选题'},
        {rule_id:'H1',section:'title',text:'数字对比优先',evidence_note:'高点击率核心来源'},
        {rule_id:'B1',section:'body',text:'一句一段适配手机阅读'}
      ]
    }],
    prompts:[
      {id:'p1',scope:'vzi',prompt_key:'longform_write',status:'active',version:3,title:'长文主提示词',
        updated_at:'2026-11-15T04:00:00Z',content_md:'第一行\n'.repeat(14) + '结尾行'}
    ]
  });
}

test('benchmarks tab renders KPI strip, grid cards, fan/imitation pills and cadence without leaking article rows', () => {
  const html = renderContentReviewContent(fixture(), vm('benchmarks'));
  assert.match(html,/class="review-benchmarks-panel"/);
  assert.match(html,/class="review-sub-kpis review-benchmarks-kpis"/);
  assert.match(html,/class="review-benchmark-cards"/);
  assert.match(html,/17\.9 万 粉/);
  assert.match(html,/已仿写 1 篇/);
  assert.match(html,/review-account-cadence is-stopped/);
  assert.match(html,/review-account-feature is-topic/);
  assert.match(html,/review-account-feature is-title/);
  assert.doesNotMatch(html,/参考爆款样本一|review-benchmark-sample|style="/);
});

test('rules tab renders cockpit cards, section chips and marks empty sections cleanly with zero svg or inline styles', () => {
  const html = renderContentReviewContent(fixture(), vm('rules'));
  assert.match(html,/class="review-rule-hierarchy"/);
  assert.match(html,/class="review-rule-section-chips"/);
  assert.match(html,/data-rule-section="keep_topic"/);
  assert.match(html,/data-rule-section="drop_topic"/);
  assert.match(html,/class="review-v13-rule-group is-empty" data-rule-section="audience"/);
  const chipSection = html.split('class="review-rule-section-chips"')[1].split('</div>')[0];
  assert.doesNotMatch(chipSection,/读者|自检清单/);
  assert.doesNotMatch(html,/<svg|style="/);
});

test('prompts tab renders summary strip, type badges, char counts, copy actions and fold toggle', () => {
  const html = renderContentReviewContent(fixture(), vm('prompts'));
  assert.match(html,/class="review-prompt-summary"/);
  assert.match(html,/class="review-prompt-card"/);
  assert.match(html,/class="review-prompt-head"/);
  assert.match(html,/class="review-prompt-badge is-hit">写文<\/span>/);
  assert.match(html,/class="review-prompt-chars">约 \d+ 字<\/span>/);
  assert.match(html,/data-review-action="copy-prompt"/);
  assert.match(html,/data-review-action="toggle-prompt"/);
  assert.doesNotMatch(html,/style="/);
});

test('library tab renders 4 KPI cards, verdict/pending chips and preserves exact table contracts', () => {
  const html = renderContentReviewContent(fixture(), vm('library'));
  assert.match(html,/class="review-sub-kpis review-library-kpis"/);
  assert.match(html,/已仿写篇数/);
  assert.match(html,/仿写表现/);
  assert.match(html,/样本阅读中位/);
  assert.match(html,/仿写阅读中位/);
  assert.match(html,/class="review-lib-chip hit">爆<\/span>/);
  assert.match(html,/class="review-lib-chip is-pending">待发布<\/span>/);
  assert.match(html,/data-label="样本发布时间"/);
  assert.match(html,/data-label="仿写发布时间"/);
  assert.doesNotMatch(html,/UNUSED_SAMPLE|配图数|>发布时间<|收录日期|仿写账号|style="/);
});
