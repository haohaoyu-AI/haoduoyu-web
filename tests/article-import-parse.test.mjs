import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImportEntry,IMPORT_PARSE_CONTRACT} from '../scripts/article-import/parse.mjs';
import {articleWarnings} from '../src/article-pipeline-query.mjs';

const title='黄婷婷九年没提的名字，被一句“更容易做朋友”说死了';
const config={account_id:'synthetic-toutiao',platform:'toutiao',run_dir:'Synthetic/tt1_1024',slot:'tt1',
  source_timezone:'Asia/Shanghai',writer:'dedao',illustrator:'codex'};
function files(changes={}) {return {
  title:title+'\n',article:'SYNTHETIC MANUSCRIPT BODY THAT MUST NOT BE EXPORTED',
  check:'# 合成检查\n- 字数: 2236\n- 小标题: 5\n- 图数: 25\n- watchdog 重跑次数: 1',
  timelog:[
    '2026-10-24 00:30:00 流水线 开始：合成',
    '2026-10-24 00:31:00 写作 开始：合成',
    '2026-10-24 00:41:00 写作 结束：合成',
    '2026-10-24 00:42:00 配图 开始：合成',
    '2026-10-24 00:47:00 配图 结束：图数=25',
    '2026-10-24 00:48:00 导入 开始：合成',
    '2026-10-24 00:50:00 导入 结束：草稿已存 pgc_id=7699934907375567402',
    '2026-10-24 00:51:00 流水线 结束：合成',
  ].join('\n'),...changes,
};}
const parse=(entry={},changes={})=>parseImportEntry({entry:{...config,...entry},files:files(changes)});
const errors=result=>result.issues.filter(issue=>issue.severity==='error');

test('synthetic tt1_1024 parses explicit evidence to nullable complete record and a provenance-only proposal',()=>{
  const result=parse();
  assert.deepEqual(errors(result),[]);
  assert.equal(result.record.run_date,'2026-10-24');
  assert.equal(new Date(result.record.run_date+'T00:00:00Z').getUTCDay(),6);
  assert.equal(result.record.started_at,'2026-10-23T16:30:00.000Z');
  assert.equal(result.record.timings.finished_at,'2026-10-23T16:51:00.000Z');
  assert.equal(result.record.timings.writing.seconds,600);
  assert.equal(result.record.char_count,2236);assert.equal(result.record.subheading_count,5);assert.equal(result.record.image_count,25);
  assert.equal(result.record.status,'draft_saved');assert.equal(result.record.writer,'dedao');assert.equal(result.record.illustrator,'codex');
  assert.equal(result.record.reruns.watchdog,1);
  assert.equal(result.record.draft_ref.pgc_id,'7699934907375567402');
  assert.equal(result.record.draft_ref.appmsgid,null);assert.equal(Object.hasOwn(result.proposal.draft_ref,'appmsgid'),false);
  assert.equal(result.record.url,null);assert.equal(result.record.published_at,null);assert.equal(result.record.series_no,null);
  assert.equal(Object.hasOwn(result.proposal,'url'),false);assert.equal(Object.hasOwn(result.proposal,'published_at'),false);
  assert.equal(Object.hasOwn(result.proposal,'platform'),false);
  assert.deepEqual(articleWarnings(result.record),[]);
  assert.deepEqual(result.provenance['draft_ref.pgc_id'],[{source:'timelog',line:7}]);
  assert.deepEqual(result.provenance.char_count,[{source:'check',line:2}]);
  assert.equal(result.source_summary.article.present,true);assert.match(result.source_summary.article.sha256,/^[a-f0-9]{64}$/);
  const encoded=JSON.stringify(result);assert.ok(!encoded.includes('SYNTHETIC MANUSCRIPT BODY'));
  assert.ok(!encoded.includes('2026-10-24 00:50:00 导入'));assert.ok(!encoded.includes('/workspace/'));
});

test('business dates use explicit source timezone before projection to Beijing day',()=>{
  const utc=parse({source_timezone:'UTC',run_date:'2026-10-24'},{timelog:[
    '2026-10-23 23:30:00 流水线 开始：合成',
    '2026-10-23 23:40:00 流水线 结束：合成',
  ].join('\n')});
  assert.deepEqual(errors(utc),[]);assert.equal(utc.record.run_date,'2026-10-24');
  assert.equal(utc.record.started_at,'2026-10-23T23:30:00.000Z');
  const shanghai=parse();assert.equal(shanghai.record.run_date,'2026-10-24');
  assert.equal(shanghai.record.started_at,'2026-10-23T16:30:00.000Z');
});

test('no clock, title or MMDD filename supplies a missing year, platform, account or timezone',()=>{
  const result=parseImportEntry({entry:{run_dir:'tt1_1024'},files:{title:'【保险200篇·第109篇】标题\n'}});
  assert.equal(result.record.run_date,null);assert.equal(result.record.series_no,null);assert.equal(result.record.platform,null);
  assert.ok(errors(result).some(issue=>issue.code==='CONFIG_FIELD_REQUIRED'&&issue.field==='account_id'));
  assert.ok(errors(result).some(issue=>issue.code==='PLATFORM_REQUIRED'));
  assert.ok(errors(result).some(issue=>issue.code==='RUN_DATE_UNKNOWN'));
  const timezone=parse({source_timezone:undefined});
  assert.equal(timezone.record.started_at,null);assert.equal(timezone.record.run_date,null);
  assert.ok(errors(timezone).some(issue=>issue.code==='SOURCE_TIMEZONE_REQUIRED'));
});

test('cross-day evidence needs an explicit business date and contradictory config remains fatal',()=>{
  const timelog='2026-10-24 23:59:00 流水线 开始：合成\n2026-10-25 00:01:00 流水线 结束：合成';
  const ambiguous=parse({}, {timelog});
  assert.equal(ambiguous.record.run_date,null);assert.ok(errors(ambiguous).some(issue=>issue.code==='RUN_DATE_AMBIGUOUS'));
  const explicit=parse({run_date:'2026-10-24'},{timelog});assert.deepEqual(errors(explicit),[]);
  assert.equal(explicit.record.timings.pipeline.seconds,120);
  const contradictory=parse({run_date:'2026-10-26'},{timelog});
  assert.ok(errors(contradictory).some(issue=>issue.code==='RUN_DATE_CONFLICT'));
});

test('unknown counts stay null and are absent from PATCH; title counts never become subheading counts',()=>{
  const result=parse({}, {check:'- 标题数: 12\n- 字数: unknown\n- 图数: -1',
    timelog:'2026-10-24 01:00:00 导入 结束：草稿已存 pgc_id=7699934907375567402'});
  for(const field of ['char_count','subheading_count','image_count']) {
    assert.equal(result.record[field],null);assert.equal(Object.hasOwn(result.proposal,field),false);
  }
  assert.ok(result.issues.some(issue=>issue.code==='CHECK_LINE_UNRECOGNIZED'));
  assert.ok(errors(result).some(issue=>issue.code==='COUNT_INVALID'));
  assert.ok(result.issues.some(issue=>issue.code==='FIELD_UNKNOWN'&&issue.field==='subheading_count'));
});

test('equal duplicates preserve exact evidence; conflicting values clear the proposal instead of choosing a source',()=>{
  const result=parse({}, {check:'- 字数: 2236\n- 字数: 2236\n- 小标题: 5\n- 图数: 24'});
  assert.equal(result.record.char_count,2236);assert.equal(result.provenance.char_count.length,2);
  assert.ok(result.issues.some(issue=>issue.code==='DUPLICATE_VALUE'&&issue.field==='char_count'));
  assert.equal(result.record.image_count,null);assert.equal(Object.hasOwn(result.proposal,'image_count'),false);
  assert.ok(errors(result).some(issue=>issue.code==='CONFLICTING_VALUE'&&issue.field==='image_count'));
});

test('ID precision stays textual and only explicit saved completion evidence proves draft_saved',()=>{
  const precision=parse({}, {timelog:'2026-10-24 01:00:00 导入 结束：草稿已存 pgc_id=0009007199254740993123456789'});
  assert.equal(precision.record.draft_ref.pgc_id,'0009007199254740993123456789');assert.equal(precision.record.status,'draft_saved');
  const merelyID=parse({}, {timelog:'2026-10-24 01:00:00 导入 结束：pgc_id=7699934907375567402'});
  assert.equal(merelyID.record.status,null);assert.equal(Object.hasOwn(merelyID.proposal,'status'),false);
  const noID=parse({}, {timelog:'2026-10-24 01:00:00 导入 结束：草稿已存'});
  assert.equal(noID.record.status,null);assert.ok(errors(noID).some(issue=>issue.code==='SAVED_WITHOUT_PLATFORM_REFERENCE'));
  const previousID=parse({}, {timelog:'2026-10-24 01:00:00 导入 开始：pgc_id=7699934907375567402\n2026-10-24 01:01:00 导入 结束：草稿已存'});
  assert.equal(previousID.record.status,null,'a reference seen before the completion line is not proof of that successful save');
  assert.ok(errors(previousID).some(issue=>issue.code==='SAVED_WITHOUT_PLATFORM_REFERENCE'));
  const explicit=parse({status:'drafting'},{timelog:'2026-10-24 01:00:00 写作 开始：合成'});
  assert.equal(explicit.record.status,'drafting');
});

test('only known platform credential is sufficient for saved status; URLs are syntax-only and never fetched',()=>{
  const zhihu=parse({platform:'zhihu',slot:'zh1'}, {timelog:'2026-10-24 01:00:00 导入 结束：草稿已存 editor_url=https://zhuanlan.zhihu.com/p/123/edit'});
  assert.equal(zhihu.record.status,'draft_saved');assert.deepEqual(errors(zhihu),[]);
  const wx=parse({platform:'wechat',slot:'gzh'}, {timelog:'2026-10-24 01:00:00 导入 结束：草稿已存 appmsgid=0012345678901234567890'});
  assert.equal(wx.record.draft_ref.appmsgid,'0012345678901234567890');assert.equal(wx.record.status,'draft_saved');
  for(const editor_url of ['javascript:alert(1)','data:text/plain,a','https://user:password@example.invalid/edit']) {
    const bad=parse({platform:'zhihu',slot:'zh1'},{timelog:'2026-10-24 01:00:00 导入 结束：草稿已存 editor_url='+editor_url});
    assert.equal(bad.record.draft_ref,null);assert.equal(bad.record.status,null);
    assert.ok(errors(bad).some(issue=>issue.code==='EDITOR_URL_INVALID'));
  }
});

test('used ledgers bind only exact business date plus title or explicitly configured series',()=>{
  const ledger='2026-10-24 | 合成作者 | '+title+' | used for 第109篇';
  const result=parse({}, {used_topics:ledger});
  assert.equal(result.record.series_no,109);assert.equal(result.record.sample.used_topics.author,'合成作者');
  assert.equal(result.record.writer,'dedao','writer remains explicitly configured, not derived from the author name');
  assert.deepEqual(result.provenance.series_no,[{source:'used_topics',line:1}]);
  const mismatch=parse({}, {used_samples:'2026-10-23 | 某作者 | '+title+' | used for 第109篇'});
  assert.equal(mismatch.record.sample,null);assert.equal(mismatch.record.series_no,null);
  const configured=parse({series_no:109}, {used_samples:'2026-10-24 | 合成样本作者 | 完全不同的样本标题 | used for 第109篇'});
  assert.equal(configured.record.sample.used_samples.title,'完全不同的样本标题');assert.equal(configured.record.series_no,109);
});

test('ambiguous and bad used ledgers report issues without silently matching the first line',()=>{
  const result=parse({}, {used_topics:[
    '2026-10-24 | 作者一 | '+title+' | used for 第109篇',
    '2026-10-24 | 作者二 | '+title+' | used for 第110篇',
    'bad date | 作者三 | 标题 | used for 第111篇',
  ].join('\n')});
  assert.equal(result.record.sample,null);assert.equal(result.record.series_no,null);
  assert.ok(errors(result).some(issue=>issue.code==='LEDGER_MATCH_AMBIGUOUS'));
  assert.ok(errors(result).some(issue=>issue.code==='LEDGER_LINE_INVALID'));
  assert.ok(!JSON.stringify(result.issues).includes('作者一'));
});

test('invalid clocks, reordered logs and conflicting boundaries are recorded without guessed durations',()=>{
  const result=parse({}, {timelog:[
    '2026-02-30 01:00:00 写作 开始：合成',
    '2026-10-24 02:00:00 写作 开始：合成',
    '2026-10-24 01:00:00 写作 结束：合成',
    '2026-10-24 03:00:00 写作 开始：合成',
    'not a timestamp',
  ].join('\n')});
  assert.equal(result.record.started_at,null);assert.equal(result.record.timings.writing.started_at,null);
  assert.equal(result.record.timings.writing.seconds,null);assert.equal(Object.hasOwn(result.proposal.timings.writing,'started_at'),false);
  for(const code of ['TIMELOG_TIMESTAMP_INVALID','TIMELOG_OUT_OF_ORDER','CONFLICTING_VALUE','TIMELOG_LINE_INVALID'])
    assert.ok(errors(result).some(issue=>issue.code===code),code);
});

test('parser is deterministic, bounds input, reports neutral issues, and never mutates supplied objects',()=>{
  const entry={...config},input=files(),before=structuredClone({entry,files:input});
  const first=parseImportEntry({entry,files:input}),second=parseImportEntry({entry,files:input});
  assert.deepEqual(first,second);assert.deepEqual({entry,files:input},before);
  assert.equal(IMPORT_PARSE_CONTRACT.version,'haoduoyu-article-import-parse-v1');
  const huge=parse({}, {article:'x'.repeat(2097153)});
  assert.ok(errors(huge).some(issue=>issue.code==='SOURCE_TOO_LARGE'));
  assert.equal(huge.source_summary.article.sha256,null);
  const many=parse({}, {check:'\n'.repeat(5001)});
  assert.ok(errors(many).some(issue=>issue.code==='SOURCE_LINE_LIMIT'));
});
