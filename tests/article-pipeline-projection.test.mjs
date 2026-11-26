import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyPublishedArticles,articlePipelineSpec,articlePipelineDocs} from './article-pipeline-projection.mjs';
import {historicalTree} from './historical-tree.mjs';

const baseline=historicalTree('fc38d66704c86de8f255751795125bfa71fc7bc7');
const phase4=historicalTree('a0393d03c2d342406984fa57e663a5d2d2239385');

const defaults={status:'published',slot:null,run_dir:null,run_date:null,series_no:null,
  writer:null,illustrator:null,char_count:null,subheading_count:null,image_count:null,cover_desc:null};
const names=['sample','draft_ref','timings','reruns','blockers','verify_items'];
const article={id:'synthetic-contract-row',account_id:'synthetic-account',title:'Synthetic contract',
  url:'https://example.invalid/synthetic',published_at:'2001-01-01T00:00:00.000Z',version:7,summary:'unchanged'};
const extended=(raw=false)=>({...article,...defaults,...Object.fromEntries(names.map(name=>[name+(raw?'_json':''),null]))});
test('legacy article projection verifies the full raw or logical default extension and preserves old values',()=>{
  for(const raw of [false,true]) {
    const value={data:[extended(raw)],meta:{total:1,unfiltered_total:1}};
    assert.deepEqual(legacyPublishedArticles(value),{data:[article],meta:{total:1,unfiltered_total:1}});
    assert.equal(Object.keys(value.data[0]).length,Object.keys(article).length+17,'input is never mutated');
  }
  assert.deepEqual(legacyPublishedArticles({data:article}),{data:article},'unchanged historical rows remain untouched');
  const index={id:article.id,account_id:article.account_id,title:article.title,platform:'other',published_at:article.published_at};
  assert.deepEqual(legacyPublishedArticles({data:[index]}),{data:[index]},'five-field index is never expanded or stripped');
});
test('legacy article projection rejects non-default, missing and mixed metadata instead of hiding drift',()=>{
  for(const [key,value] of [['status','draft_saved'],['series_no',3],['run_dir','Synthetic/run'],['sample',{new_key:true}]])
    assert.throws(()=>legacyPublishedArticles({data:{...extended(),[key]:value}}),assert.AssertionError);
  const missing=extended();delete missing.writer;
  assert.throws(()=>legacyPublishedArticles({data:missing}),assert.AssertionError);
  assert.throws(()=>legacyPublishedArticles({data:{...extended(),sample_json:null}}),assert.AssertionError);
});
test('legacy warning projection checks exact known title warnings while retaining all previous fields',()=>{
  const plain={...extended(),warnings:[]};
  assert.deepEqual(legacyPublishedArticles(plain),article);
  const title='😀'.repeat(31),long={...extended(),platform:'toutiao',title,warnings:['TOUTIAO_TITLE_TOO_LONG']};
  assert.deepEqual(legacyPublishedArticles(long),{...article,platform:'toutiao',title});
  const exact={...long,title:'😀'.repeat(30),warnings:[]};
  assert.equal(legacyPublishedArticles(exact).title,exact.title,'title limits count Unicode code points');
  for(const warnings of [[],['ENTERTAINMENT_IMAGES_TOO_FEW'],['TOUTIAO_TITLE_TOO_LONG','CHAR_COUNT_OUT_OF_RANGE']])
    assert.throws(()=>legacyPublishedArticles({...long,warnings}),assert.AssertionError);
  assert.throws(()=>legacyPublishedArticles({...plain,warnings:['CHAR_COUNT_OUT_OF_RANGE']}),assert.AssertionError);
});
test('legacy article verification projection permits only the exact unknown pair for null legacy items',()=>{
  const legacy={...extended(),warnings:[],has_pending_verify:null,verify_state:'unknown'};
  assert.deepEqual(legacyPublishedArticles({data:legacy}),{data:article});
  for(const [has_pending_verify,verify_state]of [[false,'complete'],[true,'pending'],[null,'complete'],[null,null],[0,'unknown']])
    assert.throws(()=>legacyPublishedArticles({...legacy,has_pending_verify,verify_state}),assert.AssertionError);
  for(const key of ['has_pending_verify','verify_state']) {
    const missing={...legacy};delete missing[key];
    assert.throws(()=>legacyPublishedArticles(missing),assert.AssertionError);
  }
});
test('article document projection restores only the pinned lifecycle delta and rejects drift inside additions',()=>{
  const spec=JSON.parse(phase4.read('public/openapi.json'));
  const docs=phase4.read('public/api-docs.html');
  assert.deepEqual(articlePipelineSpec(spec),JSON.parse(baseline.read('public/openapi.json')));
  assert.equal(articlePipelineDocs(docs),baseline.read('public/api-docs.html'));
  const changed=structuredClone(spec);changed.components.schemas.ArticleCreate.properties.status.description+='unexpected';
  assert.throws(()=>articlePipelineSpec(changed),assert.AssertionError);
  if(spec.paths['/api/v1/articles'].patch) {
    const patch=structuredClone(spec);patch.paths['/api/v1/articles'].patch.operationId='unexpectedUpsert';
    assert.throws(()=>articlePipelineSpec(patch),assert.AssertionError,'Phase4 PATCH contract drift cannot be projected away');
    const computed=structuredClone(spec);computed.components.schemas.Article.properties.verify_state.enum.push('unexpected');
    assert.throws(()=>articlePipelineSpec(computed),assert.AssertionError,'Phase4 derived state drift cannot be projected away');
    assert.throws(()=>articlePipelineDocs(docs.replace('流水线合并与筛选','unexpected phase4 section')),assert.AssertionError);
  }
  const unrelated=structuredClone(spec);unrelated.info.title='Synthetic retained change';
  assert.equal(articlePipelineSpec(unrelated).info.title,'Synthetic retained change','unrelated fields are never projected away');
  assert.throws(()=>articlePipelineDocs(docs.replace('64KiB','32KiB')),assert.AssertionError);
  assert.equal(articlePipelineDocs(docs+'<!-- retained -->'),baseline.read('public/api-docs.html')+'<!-- retained -->');
});
