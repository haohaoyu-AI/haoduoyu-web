import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyPublishedArticles,articlePipelineSpec,articlePipelineDocs} from './article-pipeline-projection.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

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
test('article document projection restores only the pinned lifecycle delta and rejects drift inside additions',()=>{
  const baseline='fc38d66704c86de8f255751795125bfa71fc7bc7';
  const old=file=>execFileSync('git',['show',baseline+':'+file],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  const spec=JSON.parse(readFileSync(new URL('../public/openapi.json',import.meta.url),'utf8'));
  const docs=readFileSync(new URL('../public/api-docs.html',import.meta.url),'utf8');
  assert.deepEqual(articlePipelineSpec(spec),JSON.parse(old('public/openapi.json')));
  assert.equal(articlePipelineDocs(docs),old('public/api-docs.html'));
  const changed=structuredClone(spec);changed.components.schemas.ArticleCreate.properties.status.description+='unexpected';
  assert.throws(()=>articlePipelineSpec(changed),assert.AssertionError);
  const unrelated=structuredClone(spec);unrelated.info.title='Synthetic retained change';
  assert.equal(articlePipelineSpec(unrelated).info.title,'Synthetic retained change','unrelated fields are never projected away');
  assert.throws(()=>articlePipelineDocs(docs.replace('64KiB','32KiB')),assert.AssertionError);
  assert.equal(articlePipelineDocs(docs+'<!-- retained -->'),old('public/api-docs.html')+'<!-- retained -->');
});
