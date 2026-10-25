import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_PIPELINE_QUERY_KEYS,ARTICLE_WARNING_CODES,articlePipelineQuery,
  validateArticlePipelineQueryMultiplicity,articlePipelineSqlFilters,articleWarnings,
  verificationState,matchesArticlePipelineDerivedFilters,
} from '../src/article-pipeline-query.mjs';

const rejected=query=>assert.throws(()=>articlePipelineQuery(query),error=>error.status===400&&error.code==='VALIDATION_ERROR');
const query=value=>new URLSearchParams(value);

test('no pipeline filters preserve the legacy published cohort without derived processing',()=>{
  const expected={status:'published',filters:{},hasDerived:false};
  assert.deepEqual(articlePipelineQuery(),expected);
  assert.deepEqual(articlePipelineQuery({}),expected);
  assert.deepEqual(articlePipelineQuery(query('platform=toutiao&sort=reads&page=1')),expected);
  assert.deepEqual(articlePipelineSqlFilters(expected),{clauses:[],params:[]});
});

test('only exact lifecycle, slot and writer enums are accepted without coercion',()=>{
  for(const status of ['drafting','illustrated','draft_saved','published','failed'])
    assert.equal(articlePipelineQuery(query({status})).status,status);
  for(const slot of ['zh1','zh2','tt1','tt2','zh3','tt3','gzh'])
    assert.equal(articlePipelineQuery(query({slot})).filters.slot,slot);
  for(const writer of ['dedao','gemini_web','human','other'])
    assert.equal(articlePipelineQuery(query({writer})).filters.writer,writer);
  for(const field of ['status','slot','writer'])for(const value of ['',null,0,false,'ALL','null',' '+(field==='slot'?'tt1':'human')]) {
    if(field==='status'&&value===null)assert.equal(articlePipelineQuery({status:null}).status,'published','retain the legacy internal absent-status adapter');
    else rejected({[field]:value});
  }
});

test('all pipeline parameters reject duplicate URL occurrences before object conversion',()=>{
  assert.deepEqual(ARTICLE_PIPELINE_QUERY_KEYS,['status','slot','writer','has_warnings','has_pending_verify','series_no_min','series_no_max']);
  for(const field of ARTICLE_PIPELINE_QUERY_KEYS) {
    const input=query(field+'=true&'+field+'=false');
    assert.throws(()=>validateArticlePipelineQueryMultiplicity(input),error=>error.status===400);
    rejected(input);
  }
  validateArticlePipelineQueryMultiplicity({slot:'tt1'});
  validateArticlePipelineQueryMultiplicity(query('q=x&q=y'));
});

test('boolean filters accept only literal true/false and false still requires derived filtering',()=>{
  for(const field of ['has_warnings','has_pending_verify'])for(const value of ['true','false']) {
    const result=articlePipelineQuery(query({[field]:value}));
    assert.equal(result[field],value==='true');assert.equal(result.hasDerived,true);
  }
  for(const field of ['has_warnings','has_pending_verify'])for(const value of ['',null,true,false,1,0,'1','0','TRUE','False',' true'])
    rejected({[field]:value});
});

test('series bounds are positive base-ten safe integers with inclusive consistent range',()=>{
  const input=articlePipelineQuery(query('series_no_min=0001&series_no_max=9007199254740991'));
  assert.deepEqual(input.filters,{series_no_min:1,series_no_max:Number.MAX_SAFE_INTEGER});
  assert.equal(input.hasDerived,false);
  assert.deepEqual(articlePipelineQuery(query('series_no_min=201')).filters,{series_no_min:201});
  assert.deepEqual(articlePipelineQuery(query('series_no_max=201')).filters,{series_no_max:201});
  for(const field of ['series_no_min','series_no_max'])for(const value of ['',null,0,1,'0','-1','1.5','1e2','+1',' 1','Infinity','9007199254740992'])
    rejected({[field]:value});
  rejected(query('series_no_min=2&series_no_max=1'));
  assert.deepEqual(articlePipelineQuery(query('series_no_min=2&series_no_max=2')).filters,{series_no_min:2,series_no_max:2});
});

test('scalar filters expose fixed SQL clauses and bind values rather than concatenating input',()=>{
  const input=articlePipelineQuery(query('status=draft_saved&slot=gzh&writer=human&series_no_min=100&series_no_max=201&has_warnings=false'));
  assert.deepEqual(articlePipelineSqlFilters(input),{
    clauses:['a.slot=?','a.writer=?','a.series_no>=?','a.series_no<=?'],params:['gzh','human',100,201],
  });
  assert.equal(input.status,'draft_saved');assert.equal(input.has_warnings,false);assert.equal(input.hasDerived,true);
  rejected(query({slot:"tt1' OR 1=1--"}));
});

test('tt1_1024 fixture has zero warnings at the exact image/title/character/subheading boundaries',()=>{
  const row=Object.freeze({run_dir:'tt1_1024',run_date:'2026-10-24',slot:'tt1',platform:'toutiao',
    title:'黄婷婷九年没提的名字，被一句“更容易做朋友”说死了',char_count:2236,subheading_count:5,image_count:25,
    status:'draft_saved',writer:'dedao',illustrator:'codex',reruns:Object.freeze({watchdog:1}),
    draft_ref:Object.freeze({pgc_id:'7699934907375567402'}),series_no:null});
  const before=structuredClone(row);
  assert.equal(new Date(row.run_date+'T00:00:00Z').getUTCDay(),6);
  assert.equal(Array.from(row.title).length,25);
  assert.deepEqual(articleWarnings(row),[]);assert.deepEqual(row,before);
  assert.equal(row.draft_ref.pgc_id,'7699934907375567402');
});

test('entertainment image warning is strictly below 25 and gzh/unknown slots never invent it',()=>{
  for(const slot of ['zh1','zh2','zh3','tt1','tt2','tt3']) {
    assert.deepEqual(articleWarnings({slot,image_count:24}),[ARTICLE_WARNING_CODES.images]);
    assert.deepEqual(articleWarnings({slot,image_count:25}),[]);
    assert.deepEqual(articleWarnings({slot,image_count:26}),[]);
  }
  for(const slot of ['gzh',null,undefined,'tt4'])assert.deepEqual(articleWarnings({slot,platform:'toutiao',image_count:0}),[]);
  for(const image_count of [null,undefined,'0',NaN])assert.deepEqual(articleWarnings({slot:'tt1',image_count}),[]);
});

test('known character and subheading numbers use inclusive bounds; missing values never become zero',()=>{
  for(const char_count of [2000,2300])assert.deepEqual(articleWarnings({char_count}),[]);
  for(const char_count of [0,1999,2301])assert.deepEqual(articleWarnings({char_count}),[ARTICLE_WARNING_CODES.characters]);
  for(const subheading_count of [5,6,7])assert.deepEqual(articleWarnings({subheading_count}),[]);
  for(const subheading_count of [0,4,8])assert.deepEqual(articleWarnings({subheading_count}),[ARTICLE_WARNING_CODES.subheadings]);
  for(const value of [null,undefined,'0',NaN])assert.deepEqual(articleWarnings({char_count:value,subheading_count:value}),[]);
  assert.deepEqual(articleWarnings({status:'published',title:'合成旧文章',url:'https://example.invalid/published'}),[]);
});

test('Toutiao titles use Unicode code points and only a known platform or explicit tt slot',()=>{
  assert.deepEqual(articleWarnings({platform:'toutiao',title:'😀'.repeat(30)}),[]);
  assert.deepEqual(articleWarnings({platform:'toutiao',title:'😀'.repeat(31)}),[ARTICLE_WARNING_CODES.title]);
  assert.deepEqual(articleWarnings({slot:'tt1',title:'鱼'.repeat(31)}),[ARTICLE_WARNING_CODES.title]);
  for(const platform of ['zhihu','wechat','other'])assert.deepEqual(articleWarnings({platform,title:'鱼'.repeat(31)}),[]);
  assert.deepEqual(articleWarnings({slot:'gzh',title:'鱼'.repeat(31)}),[]);
});

test('warnings have deterministic order and do not alter raw/logical metadata or nested unknown keys',()=>{
  const row={platform:'toutiao',slot:'tt1',title:'鱼'.repeat(31),char_count:1999,subheading_count:4,image_count:24,
    verify_items:[{future_key:{preserve:true}}],draft_ref_json:' { "future": {"keep":true} } '};
  const before=structuredClone(row);
  assert.deepEqual(articleWarnings(row),Object.values(ARTICLE_WARNING_CODES).slice(0,4));assert.deepEqual(row,before);
});

test('only saved drafts warn about a missing platform-specific credential; IDs remain exact strings',()=>{
  for(const status of ['drafting','illustrated','published','failed',null,undefined])
    assert.deepEqual(articleWarnings({status,platform:'toutiao'}),[]);
  const id='7699934907375567402';
  for(const [platform,key] of [['toutiao','pgc_id'],['wechat','appmsgid']]) {
    const row={status:'draft_saved',platform,draft_ref:{[key]:id,unknown:{keep:true}}},before=structuredClone(row);
    assert.deepEqual(articleWarnings(row),[]);assert.deepEqual(row,before);assert.equal(row.draft_ref[key],id);
    assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{[key]:'  '+id+'  '}}),[],'nonempty string; never rewrite stored value');
    for(const draft_ref of [null,{}, {[key]:null}, {[key]:''}, {[key]:' \n '}, {unknown:id}])
      assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref}),[ARTICLE_WARNING_CODES.credential]);
    const foreignKey=key==='pgc_id'?'appmsgid':'pgc_id';
    assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{[foreignKey]:id}}),[ARTICLE_WARNING_CODES.credential]);
  }
});

test('Zhihu and other draft credentials use the existing editor_url key and safe HTTP(S) syntax without remote assumptions',()=>{
  for(const platform of ['zhihu','other']) {
    for(const editor_url of ['https://example.invalid/editor','http://localhost:3210/drafts/1?edit=1#part','https://例子.invalid/编辑',
      'HTTP://example.invalid/opaque'])assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{editor_url}}),[]);
    for(const editor_url of ['',null,17,'https://user:password@example.invalid/edit','javascript:alert(1)','data:text/plain,x',
      ' https://example.invalid/edit','https://example.invalid/edit ','https://example.invalid/ed\nit',
      'https://example.invalid/ed\u0000it','https://example.invalid/ed\u007fit','http:example.invalid','/relative/path','https://'])
      assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{editor_url}}),[ARTICLE_WARNING_CODES.credential]);
    assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{url:'https://example.invalid/editor'}}),[ARTICLE_WARNING_CODES.credential]);
    assert.deepEqual(articleWarnings({status:'draft_saved',platform,draft_ref:{pgc_id:'valid-string-but-other-platform'}}),[ARTICLE_WARNING_CODES.credential]);
  }
});

test('raw and logical saved-draft metadata use the same credential recognition without rewriting JSON',()=>{
  const raw=' { "editor_url": "https://example.invalid/opaque", "future": {"preserve":true} } ';
  const row={status:'draft_saved',platform:'zhihu',draft_ref_json:raw};
  assert.deepEqual(articleWarnings(row),[]);assert.equal(row.draft_ref_json,raw);
  assert.deepEqual(articleWarnings({...row,draft_ref:null}),[ARTICLE_WARNING_CODES.credential],'explicit logical null is not bypassed by another representation');
  assert.throws(()=>articleWarnings({status:'draft_saved',platform:'zhihu',draft_ref_json:'{"editor_url":"https://example.invalid","future":{"__proto__":{}}}'}),error=>error.status===400);
});

test('verification exposes explicit pending, complete and unknown states without changing unrecognized values',()=>{
  const unknown={has_pending_verify:null,verify_state:'unknown'},pending={has_pending_verify:true,verify_state:'pending'},complete={has_pending_verify:false,verify_state:'complete'};
  for(const row of [{},{verify_items:null},{verify_items_json:null},{verify_items:undefined}])assert.deepEqual(verificationState(row),unknown);
  assert.deepEqual(verificationState({verify_items:[]}),complete);
  assert.deepEqual(verificationState({verify_items:[{done:true,unknown:{keep:true}},{done:true}]}),complete);
  assert.deepEqual(verificationState({verify_items:[{done:false}]}),pending);
  for(const done of [null,0,1,'true','false',[],{}]) {
    const row={verify_items:[{done,unknown:{keep:true}}]},before=structuredClone(row);
    assert.deepEqual(verificationState(row),unknown);assert.deepEqual(row,before);
    assert.deepEqual(verificationState({verify_items:[{done:false},...row.verify_items]}),pending,'an explicit false takes priority over unknown');
    assert.deepEqual(verificationState({verify_items:[{done:true},...row.verify_items]}),unknown,'unknown never becomes complete');
  }
  assert.deepEqual(verificationState({verify_items:[{}]}),unknown);
});

test('raw verification metadata is validated, preserves unknown fields and never interprets truthiness',()=>{
  const raw=' [ { "done": 1, "future": [true,null,"x"] } ] ',row={verify_items_json:raw};
  assert.deepEqual(verificationState(row),{has_pending_verify:null,verify_state:'unknown'});assert.equal(row.verify_items_json,raw);
  assert.deepEqual(verificationState({verify_items_json:'[{"done":false}]'}),{has_pending_verify:true,verify_state:'pending'});
  assert.deepEqual(verificationState({verify_items_json:'[{"done":true}]'}),{has_pending_verify:false,verify_state:'complete'});
  assert.throws(()=>verificationState({verify_items_json:'[{"done":true,"constructor":{}}]'}),error=>error.status===400);
  assert.throws(()=>verificationState({verify_items_json:'[] trailing'}),error=>error.status===400);
});

test('derived false filters match only explicitly complete verification, and combine before pagination',()=>{
  const rows=[{id:'unknown-null',verify_items:null},{id:'unknown-key',verify_items:[{done:1}]},
    {id:'pending',verify_items:[{done:false}]},{id:'empty-complete',verify_items:[]},{id:'complete',verify_items:[{done:true}]}];
  const pending=articlePipelineQuery(query('has_pending_verify=true'));
  const complete=articlePipelineQuery(query('has_pending_verify=false'));
  assert.deepEqual(rows.filter(row=>matchesArticlePipelineDerivedFilters(row,pending)).map(row=>row.id),['pending']);
  assert.deepEqual(rows.filter(row=>matchesArticlePipelineDerivedFilters(row,complete)).map(row=>row.id),['empty-complete','complete']);
  const combined=articlePipelineQuery(query('has_pending_verify=false&has_warnings=true'));
  const supplied=[{id:'first',verify_items:[{done:false}],char_count:1900},{id:'second',verify_items:[{done:true}],char_count:1900}];
  assert.deepEqual(supplied.filter(row=>matchesArticlePipelineDerivedFilters(row,combined)).map(row=>row.id),['second']);
  assert.equal(matchesArticlePipelineDerivedFilters({},articlePipelineQuery()),true);
});
