import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptArchivePage,archiveGroups,archiveQuery,canAccessReviewArchive,isReviewArchiveRoute
} from '../web/core/review-archive-state.mjs';
import {updateRoute} from '../web/core/router.mjs';
import {state} from '../web/core/state.mjs';
import {loadReviewArchive} from '../web/review-archive-controller.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {
  renderArchiveCompleteness,renderArchiveDetail,renderArchiveItems,renderArchiveLegacyPage,renderReviewArchiveShell
} from '../web/pages/review-archive.mjs';
import {readArchiveItemEditor,renderArchiveDetailEditor,renderArchiveItemEditor} from '../web/pages/review-archive-editor.mjs';
import {readArchiveImportFile,renderArchiveImports} from '../web/pages/review-archive-import.mjs';
import {renderArchiveReports} from '../web/pages/review-archive-reports.mjs';

const owner={id:'synthetic-owner',csrfToken:'test',reviewArchive:true};
const record={id:'test-archive',version:1,kind:'article',publication_status:'published',association_status:'pending'};

test('private archive is only requested for the V account with an active owner capability',async t=>{
  assert.equal(canAccessReviewArchive(owner,'V字'),true);
  assert.equal(canAccessReviewArchive(owner,'Z极客'),false);
  assert.equal(canAccessReviewArchive({...owner,publicBusiness:true},'V字'),false);
  assert.equal(canAccessReviewArchive({...owner,offlineIdentity:true},'V字'),false);
  assert.equal(canAccessReviewArchive({...owner,reviewArchive:false},'V字'),false);
  assert.equal(canAccessReviewArchive({...owner,csrfToken:null},'V字'),false);
  assert.equal(isReviewArchiveRoute('?page=review&account=V%E5%AD%97&review_section=archive'),true);
  const old={me:state.me,account:state.account},document=globalThis.document;
  t.after(()=>{Object.assign(state,old);globalThis.document=document;});
  globalThis.document={getElementById(){assert.fail('private loader touched DOM for an unauthorized identity');}};
  Object.assign(state,{me:{...owner,publicBusiness:true},account:'V字'});
  await loadReviewArchive();
  const locked=renderReviewArchiveShell(false);
  assert.match(locked,/此档案仅对站点所有者开放/u);
  assert.doesNotMatch(locked,/data-archive-action/u);
});

test('normal review shows the owner entry and its navigation can exit the archive without changing other review sections',t=>{
  // The owner entry moved into the page-header pill (账号 ｜ 档案 ›); the review body no longer carries its own button.
  assert.doesNotMatch(renderContentReviewContent({},{account:'V字',archiveAllowed:true,loading:true}),/review_section=archive/u);
  assert.doesNotMatch(renderContentReviewContent({},{account:'V字',archiveAllowed:false,loading:true}),/review_section=archive/u);
  assert.doesNotMatch(renderContentReviewContent({},{account:'Z极客',archiveAllowed:true,loading:true}),/review_section=archive/u);
  const old={location:globalThis.location,history:globalThis.history,page:state.page,account:state.account};
  t.after(()=>{
    Object.assign(globalThis,{location:old.location,history:old.history});
    Object.assign(state,{page:old.page,account:old.account});
  });
  let routed;
  globalThis.history={replaceState(_entry,_title,url){routed=url;},pushState(_entry,_title,url){routed=url;}};
  Object.assign(state,{page:'review',account:'V字'});
  globalThis.location={href:'https://site.invalid/?page=review&review_section=archive'};
  updateRoute();
  assert.equal(routed.searchParams.get('review_section'),'archive');
  updateRoute(true,{exitReviewArchive:true});
  assert.equal(routed.searchParams.has('review_section'),false);
  globalThis.location={href:'https://site.invalid/?page=review&review_section=articles'};
  updateRoute(true,{exitReviewArchive:true});
  assert.equal(routed.searchParams.get('review_section'),'articles');
});

test('archive defaults retain no-date drafts and lists sort on the relevant timestamp in Beijing',()=>{
  const rows=[
    {id:'no-date',kind:'micro',original_title:'无日期微头条',draft_saved_at:null,created_at:'2026-11-21T10:00:00Z',sort_at:null,
      production_status:'unfinished',publication_status:'pending',association_status:'ambiguous'},
    {id:'published',kind:'article',original_title:'先写的长文',published_title:'正式长文',sort_at:'2026-11-18T16:10:00Z',
      publication_status:'published',association_status:'pending'},
    {id:'scheduled',kind:'article',original_title:'排期在前',sort_at:'2026-11-20T03:00:00Z',publication_status:'scheduled'},
    {id:'deleted',kind:'micro',published_title:'已删除微头条',sort_at:'2026-11-19T05:07:00Z',publication_status:'deleted'}
  ];
  const groups=archiveGroups(rows);
  assert.deepEqual(groups.map(({date,rows})=>[date,...rows.map(x=>x.id)]),[
    ['2026-11-20','scheduled'],['2026-11-19','deleted','published'],['','no-date']
  ]);
  const html=renderArchiveItems({items:rows});
  assert.ok(html.indexOf('排期在前')<html.indexOf('正式长文'));
  assert.match(html,/无日期微头条.*制作未完成.*待发布.*多个候选待核/u);
  assert.match(html,/正式长文.*已发布.*待核关联/u);
  assert.doesNotMatch(html,/2026-11-21/u);
  assert.equal(archiveQuery({}), 'offset=0');
  assert.equal(archiveQuery({kind:'micro',publication_status:'deleted'},100,5),
    'offset=100&kind=micro&publication_status=deleted&read_revision=5');
});

test('new pages must keep the pinned read revision and never duplicate an existing archive ID',()=>{
  const first=acceptArchivePage({items:[{id:'a'}],has_more:true,next_offset:100,read_revision:2},{items:[],revision:null,offset:0});
  assert.throws(()=>acceptArchivePage({items:[{id:'a'}],has_more:false,read_revision:2},first),/重复记录/u);
  assert.throws(()=>acceptArchivePage({items:[{id:'b'}],has_more:false,read_revision:3},first),/档案已更新/u);
  assert.throws(()=>acceptArchivePage({items:[{id:'b'}],has_more:true,next_offset:100,read_revision:2},first),/游标无效/u);
});

test('only explicit detail displays bodies and image links, without remote image or unsafe HTML',()=>{
  const item={...record,original_title:'原始草稿标题',published_title:'正式标题',original_body:'<b onmouseover=steal()>私有正文</b>',
    sources:[{title:'第一来源',url:'https://example.test/a'},{title:'第二来源',url:'https://example.test/b'}],
    cover:{url:'https://example.test/private.png',alt:'私有封面'},images:{total:0,real:0,ai:null},
    field_states:{'images.ai':'unverified',published_body:'none'},alternate_titles:null,sample_url:'javascript:bad()',
    refs:[{kind:'draft',role:'primary',platform_id:'synthetic-main'},{kind:'draft',role:'duplicate',platform_id:'synthetic-copy'}],
    snapshots:[{source:'synthetic-history',observed_at:'2026-11-18T16:10:00Z',metrics:{reads:0,ctr:0,impressions:null,custom_metric:3}}]};
  const summary=renderArchiveItems({items:[item]});
  assert.doesNotMatch(summary,/私有正文|private\.png|第一来源|synthetic-main/u);
  const html=renderArchiveDetail(item);
  assert.match(html,/原始草稿标题/u);
  assert.match(html,/正式标题/u);
  assert.match(html,/synthetic-main.*主要版本/u);
  assert.match(html,/synthetic-copy.*重复草稿/u);
  assert.ok(html.indexOf('第一来源')<html.indexOf('第二来源'));
  assert.match(html,/&lt;b onmouseover=steal\(\)&gt;私有正文&lt;\/b&gt;/u);
  assert.doesNotMatch(html,/<b onmouseover|<img|href="javascript:/u);
  assert.match(html,/总图数<\/dt><dd>0/u);
  assert.match(html,/AI 图数<\/dt><dd>无法核实/u);
  assert.match(html,/发布正文<\/summary><pre[^>]*>没有/u);
  assert.match(html,/2026-11-19 00:10.*<td>0<\/td><td>未填<\/td><td>0%/u);
  assert.match(html,/custom_metric/u);
});

test('completeness separates missing values, unavailable evidence and unsupported functions',()=>{
  const html=renderArchiveCompleteness({total:2,fields:[{field:'cover',missing:1,states:{unverified:1,none:1},
    items:[{id:'synthetic-missing',title:'无法核实的稿件',state:'unverified'}]}],unsupported:[{label:'尚未支持的资源格式'}]});
  assert.match(html,/AI 封面 · 缺 1 篇/u);
  assert.match(html,/无法核实 1、没有 1/u);
  assert.match(html,/无法核实的稿件/u);
  assert.match(html,/功能未支持.*尚未支持的资源格式/u);
});

test('creation can omit alternate titles and business times while edits preserve intentional emptiness',()=>{
  const fields={kind:'micro',production_status:'unfinished',publication_status:'pending',original_title:'短内容'};
  const created=readArchiveItemEditor(fields);
  assert.equal(created.kind,'micro');
  assert.equal(created.original_title,'短内容');
  assert.equal(Object.hasOwn(created,'alternate_titles'),false);
  assert.equal(Object.hasOwn(created,'published_at'),false);
  const edit=readArchiveItemEditor(fields,{...created,id:'saved',alternate_titles:[]});
  assert.equal(Object.hasOwn(edit,'alternate_titles'),false);
  const html=renderArchiveItemEditor();
  assert.match(html,/备选标题（可选，每行一条）/u);
  assert.doesNotMatch(html,/name="alternate_titles"[^>]*required/u);
});

test('legacy summaries display their source ID and existing platform references are correctable',()=>{
  const summary=renderArchiveLegacyPage({items:[{legacy_id:'record',platform_article_id:'123456',title:'已有档案'}]});
  assert.match(summary,/已有档案 · 归档.*123456/u);
  const html=renderArchiveDetailEditor('reference',record,{kind:'publication',platform_id:'123456',role:'primary'});
  assert.match(html,/name="platform_id" type="text" value="123456" required/u);
  assert.match(html,/更换编号或类型时必填/u);
});

test('import UI shows persisted checkpoints, distinct outcomes and constrained reconciliation',async()=>{
  const payload={kind:'directory',page:2,source:'synthetic',rows:[{key:'one'}]};
  const file={size:100,text:async()=>JSON.stringify(payload)};
  assert.equal((await readArchiveImportFile(file,'test-resume')).run_id,'test-resume');
  await assert.rejects(readArchiveImportFile({...file,text:async()=>JSON.stringify({...payload,run_id:'different'})},'test-resume'),/批次不符/u);
  const vm={checkpoint:{id:'test-resume',next_page:2,scope:{account:'V字',kind:'article'},coverage:{complete:false},
    pages:[{page:1,rows:[{key:'one',action:'new',status:'success'},{key:'two',action:'conflict',status:'failure'},
      {key:'three',action:'unrecognized',status:'omission'}]}]},reconcile:{site_only_assessed:false,status_conflict:[{key:'two'}]}};
  const html=renderArchiveImports(vm);
  assert.match(html,/继续 test-resume · 下一页 2/u);
  assert.match(html,/新建 · 成功/u);
  assert.match(html,/冲突 · 失败/u);
  assert.match(html,/未识别 · 遗漏/u);
  assert.match(html,/采集范围尚未核实/u);
  assert.match(html,/状态冲突 · 1/u);
});

test('report corrections retain the original ID and require explicit V account confirmation for unbound reports',()=>{
  const html=renderArchiveReports({reportType:'ai',reports:[],reportDetail:{id:'original-ai-report',author:'Owner',content:'新汇报',
    content_hash:'etag',requires_v_account_confirmation:true,history:[{version:1,saved_at:'2026-11-18T14:10:00Z',report:{content:'旧汇报'}}]}});
  assert.match(html,/原记录 original-ai-report/u);
  assert.match(html,/name="confirm_v_account" required/u);
  assert.match(html,/确认这份汇报属于 V字/u);
  assert.match(html,/版本 1.*旧汇报/u);
});
