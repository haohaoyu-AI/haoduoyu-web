import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const view = content_md => renderContentReviewContent(normalizeReviewData({playbooks:[{id:'p',account:'A',status:'active',version:3,published_on:'2026-10-30',content_md,rules:[{rule_id:'R1',section:'body',text:'保留正文'}]}]}),{account:'A',now:'2026-11-02T04:00:00Z',filters:{},secondary:'review',article:'',loading:false,error:''});

test('title follows the existing level-one heading without changing the introduction or rules', () => {
  const html = view('# 新手册 <script>\n原总纲\n## 正文\n原章节');
  assert.match(html,/<h2>新手册 &lt;script&gt;<\/h2>/);
  assert.match(html,/原总纲/);
  assert.match(html,/保留正文/);
  assert.match(html,/生效于 2026-10-30/);
  assert.doesNotMatch(html,/<script>/);
});
test('a missing or late heading uses the version fallback', () => {
  assert.match(view('原总纲\n## 规则\n# 后面的标题'),/<h2>规则手册 3<\/h2>/);
  assert.match(view('原总纲'),/<h2>规则手册 3<\/h2>/);
});
