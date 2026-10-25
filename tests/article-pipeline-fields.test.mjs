import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_PIPELINE_FIELDS,ARTICLE_PIPELINE_ENUMS,ARTICLE_PIPELINE_DEFAULTS,
  LEGACY_ARTICLE_PIPELINE_DEFAULTS,validateArticlePipelineFields,
} from '../src/article-pipeline-fields.mjs';

const invalid=row=>assert.throws(()=>validateArticlePipelineFields(row),
  error=>error.code==='VALIDATION_ERROR'&&error.status===400);
const objectFields=['sample_json','draft_ref_json','timings_json','reruns_json'];
const arrayFields=['blockers_json','verify_items_json'];

test('all 17 optional fields stay SQL null; only explicit legacy defaults imply published',()=>{
  assert.deepEqual(ARTICLE_PIPELINE_FIELDS,[
    'status','slot','run_dir','run_date','series_no','writer','illustrator','sample_json',
    'char_count','subheading_count','image_count','cover_desc','draft_ref_json','timings_json',
    'reruns_json','blockers_json','verify_items_json',
  ]);
  assert.deepEqual(ARTICLE_PIPELINE_DEFAULTS,Object.fromEntries(ARTICLE_PIPELINE_FIELDS.map(name=>[name,null])));
  assert.deepEqual(LEGACY_ARTICLE_PIPELINE_DEFAULTS,{...ARTICLE_PIPELINE_DEFAULTS,status:'published'});
  const absent={},nulls={...ARTICLE_PIPELINE_DEFAULTS};
  assert.equal(validateArticlePipelineFields(absent),absent);
  assert.deepEqual(absent,{});
  assert.equal(validateArticlePipelineFields(nulls),nulls);
  assert.equal(nulls.status,null,'validation must not promote an unknown status to published');
  assert.deepEqual(nulls,ARTICLE_PIPELINE_DEFAULTS);
});

test('a complete record returns by identity with raw JSON, case, whitespace and unknown nested fields untouched',()=>{
  const objectJson=' { "future": {"extra":[true,null,"文字"]}, "z": 1 }\n';
  const arrayJson=' [ { "future": {"items":[1,2]}, "note":"原样" } ] ';
  const row=Object.freeze({
    status:'draft_saved',slot:'gzh',run_dir:'Runs_2026/GZH-Alpha',run_date:'2024-02-29',
    series_no:201,writer:'human',illustrator:'pil',sample_json:objectJson,
    char_count:0,subheading_count:5,image_count:0,cover_desc:'  封面说明\n原样保留  ',
    draft_ref_json:objectJson,timings_json:objectJson,reruns_json:objectJson,
    blockers_json:arrayJson,verify_items_json:arrayJson,
    url:null,published_at:null,future_article_field:Object.freeze({opaque:['untouched']}),
  });
  const before=structuredClone(row);
  assert.equal(validateArticlePipelineFields(row),row);
  assert.deepEqual(row,before);
  for(const name of objectFields)assert.equal(row[name],objectJson);
  for(const name of arrayFields)assert.equal(row[name],arrayJson);
  assert.equal(row.run_dir,'Runs_2026/GZH-Alpha');
});

test('each enum accepts exactly its declared values without coercion or trimming',()=>{
  assert.deepEqual(ARTICLE_PIPELINE_ENUMS,{
    status:['drafting','illustrated','draft_saved','published','failed'],
    slot:['zh1','zh2','tt1','tt2','zh3','tt3','gzh'],
    writer:['dedao','gemini_web','human','other'],illustrator:['codex','pil','human'],
  });
  for(const [name,values] of Object.entries(ARTICLE_PIPELINE_ENUMS)) {
    for(const value of values)assert.equal(validateArticlePipelineFields({[name]:value})[name],value);
    for(const value of ['',values[0].toUpperCase(),' '+values[0],values[0]+' ',0,false,{},[]])
      invalid({[name]:value});
  }
});

test('series numbers are positive safe integers without a 200 cap; counts are nonnegative safe integers',()=>{
  for(const value of [1,201,Number.MAX_SAFE_INTEGER])
    assert.equal(validateArticlePipelineFields({series_no:value}).series_no,value);
  for(const value of [0,-1,1.5,'1',false,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])invalid({series_no:value});
  for(const name of ['char_count','subheading_count','image_count']) {
    for(const value of [0,1,Number.MAX_SAFE_INTEGER])
      assert.equal(validateArticlePipelineFields({[name]:value})[name],value);
    for(const value of [-1,0.5,'0',false,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])invalid({[name]:value});
  }
});

test('run_date requires an exact real calendar date including century leap-year rules',()=>{
  for(const value of ['2000-02-29','2024-02-29','2026-10-25','2026-12-31'])
    assert.equal(validateArticlePipelineFields({run_date:value}).run_date,value);
  for(const value of ['1900-02-29','2023-02-29','2026-04-31','2026-00-01','2026-13-01',
    '2026-01-00','2026-01-32','2026-1-01','2026-01-1',' 2026-01-01','2026-01-01 ',
    '2026-01-01T00:00:00Z','',20261025])invalid({run_date:value});
});

test('run_dir preserves legal slash-separated segments and rejects traversal or normalization inputs',()=>{
  for(const value of ['A','_','-','Runs_2026/GZH-Alpha/Writer_1','a/b/C'])
    assert.equal(validateArticlePipelineFields({run_dir:value}).run_dir,value);
  for(const value of ['', '/a','a/','a//b','.','..','a/../b','a/./b','a.b','a\\b',
    'a b',' a','a ','a\nb','a\n','a\r\n','a\u2028','a\u2029','a?b','https://a','中文',0,[]])invalid({run_dir:value});
});

test('JSON fields enforce their top-level shapes while retaining unknown nested data and serialization',()=>{
  for(const name of objectFields) {
    for(const value of ['{}',' {"future":[null,{"custom":true}],"opaque":{"x":1}} '])
      assert.equal(validateArticlePipelineFields({[name]:value})[name],value);
    for(const value of ['[]','null','1','true','"text"','{',{},[]])invalid({[name]:value});
  }
  for(const name of arrayFields) {
    for(const value of ['[]',' [ {"future":[null,{"custom":true}]}, {} ] '])
      assert.equal(validateArticlePipelineFields({[name]:value})[name],value);
    for(const value of ['{}','null','1','[null]','[[]]','["text"]','[true]','[1]','[{},null]','[',[],{}])
      invalid({[name]:value});
  }
});

test('validation touches only present known fields and rejects invalid records or explicit undefined',()=>{
  for(const row of [null,undefined,[],true,1,'record'])invalid(row);
  const unknown={id:42,future:undefined,unrecognized_json:'{malformed',url:{untouched:true}};
  assert.equal(validateArticlePipelineFields(unknown),unknown);
  for(const name of ARTICLE_PIPELINE_FIELDS)invalid({[name]:undefined});
  for(const value of ['', '  原样\n文字  '])
    assert.equal(validateArticlePipelineFields({cover_desc:value}).cover_desc,value);
  for(const value of [0,false,{},[]])invalid({cover_desc:value});
});
