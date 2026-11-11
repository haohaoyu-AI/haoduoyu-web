import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOpenAiReviewPanel,renderOpenAiReviewStatus,renderOpenAiConnectivity} from '../web/pages/openai-review.mjs';
import {openAiProgressEvents,openAiProgressLabel} from '../web/core/openai-review-progress.mjs';
import {openAiReviewTimeout} from '../web/openai-review-controller.mjs';

test('diagnosis shows observed steps, rounds, data counts and time without fabricated percentage',()=>{
  const run={id:'current',status:'running',provider_calls:2,progress:[
    {stage:'source_ready',elapsed_ms:0,article_count:31,record_count:97},
    {stage:'provider_started',round:1,elapsed_ms:120},
    {stage:'provider_responded',round:1,elapsed_ms:5400},
    {stage:'evidence_lookup',round:1,elapsed_ms:5500},
    {stage:'provider_started',round:2,elapsed_ms:5600},
    {stage:'<script>untrusted</script>',elapsed_ms:6000},
  ]};
  const html=renderOpenAiReviewStatus({run,pendingId:'current',startedAt:1});
  assert.match(html,/31 篇文章，97 条记录/);assert.match(html,/第 2 轮/);
  assert.match(html,/已收到 API 响应/);assert.match(html,/核对历史证据/);
  assert.match(html,/\+5秒/);assert.match(html,/aria-label="诊断执行进度"/);
  assert.doesNotMatch(html,/untrusted|\d+%|<progress[^>]*value=/);
  assert.equal(openAiProgressEvents(run).length,5);assert.equal(openAiProgressLabel({stage:'unknown'}),'');
  const next=renderOpenAiReviewStatus({run,pendingId:'new-request',operation:'start',startedAt:1});
  assert.doesNotMatch(next,/31 篇文章|第 2 轮/,'old steps cannot be attributed to a new run');
});

test('minimal test result is distinct from a saved diagnosis and disables competing starts',()=>{
  const connection={result:{id:'test',status:'succeeded',model:'<unsafe>',elapsed_ms:1200,response:'OK'}};
  const html=renderOpenAiConnectivity(connection);
  assert.match(html,/连接测试通过/);assert.match(html,/已回复 OK/);assert.match(html,/&lt;unsafe&gt;/);
  assert.doesNotMatch(html,/<unsafe>|报告已保存/);
  const pending=renderOpenAiReviewPanel({owner:true,config:{configured:true,supported_models:[]},
    connection:{pendingId:'test',busy:true,startedAt:1}});
  assert.match(pending,/data-openai-action="start"\s+disabled/);
  assert.match(pending,/data-openai-action="check-connection"/);
  assert.equal(openAiReviewTimeout('/openai-review/connectivity',{method:'POST'}),150000);
  assert.equal(openAiReviewTimeout('/openai-review/connectivity/test',{method:'GET'}),75000);
});
