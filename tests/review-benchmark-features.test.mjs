import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

test('benchmark names link safely and recorded features keep their own paragraphs and lists', () => {
  const data = normalizeReviewData({benchmarkAccounts:[
    {id:'a',account:'A',name:'参考账号',profile_url:'https://example.com/profile?a=1&b=2',
      topic_focus:'第一段\n第二段',title_patterns:['模板 T7\n- 结构一\n- 结构二','模板 T8'],structure_notes_md:'正文结构。开头：保留细节。结尾：保留原文。'},
    {id:'b',account:'A',name:'无效链接账号',profile_url:'javascript:alert(1)',topic_focus:'<script>不执行</script>'},
    {id:'c',account:'B',name:'OTHER_ACCOUNT',profile_url:'https://other.example/'},
  ]});
  const html = renderContentReviewContent(data,{account:'A',secondary:'benchmarks',filters:{},article:'',loading:false,error:'',now:'2026-11-02T04:00:00Z'});
  assert.match(html,/<a class="review-account-link" href="https:\/\/example\.com\/profile\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">参考账号<\/a>/);
  assert.match(html,/<h4>选题方向<\/h4>.*<p>第一段<\/p><p>第二段<\/p>/);
  assert.match(html,/<h4>标题特点<\/h4>.*模板 T7.*<li>结构一<\/li><li>结构二<\/li>.*模板 T8/);
  assert.match(html,/<h4>其他特点<\/h4>.*<p>正文结构。<\/p><p>开头：保留细节。<\/p><p>结尾：保留原文。<\/p>/);
  assert.match(html,/<h3>无效链接账号<\/h3>/);
  assert.match(html,/&lt;script&gt;不执行&lt;\/script&gt;/);
  assert.doesNotMatch(html,/href="javascript:|<script>|OTHER_ACCOUNT/);
});
