import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_PIPELINE_FIELDS,ARTICLE_PIPELINE_ENUMS,ARTICLE_PIPELINE_DEFAULTS,
  LEGACY_ARTICLE_PIPELINE_DEFAULTS,validateArticlePipelineFields,
  PIPELINE_JSON_FIELDS,validatePipelineJson,
} from '../src/article-pipeline-fields.mjs';

const invalid=row=>assert.throws(()=>validateArticlePipelineFields(row),
  error=>error.code==='VALIDATION_ERROR'&&error.status===400);
const objectFields=['sample_json','draft_ref_json','timings_json','reruns_json'];
const arrayFields=['blockers_json','verify_items_json'];
const invalidJson=(value,name)=>assert.throws(()=>validatePipelineJson(value,name),
  error=>error.code==='VALIDATION_ERROR'&&error.status===400);
const jsonOfBytes=(bytes,shape='object')=>{
  const [prefix,suffix]=shape==='array'?['[{"pad":"','"}]']:['{"pad":"','"}'];
  const available=bytes-Buffer.byteLength(prefix+suffix,'utf8');
  assert.ok(available>=0);
  const value=prefix+'鱼'.repeat(Math.floor(available/3))+'a'.repeat(available%3)+suffix;
  assert.equal(Buffer.byteLength(value,'utf8'),bytes);
  return value;
};

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

test('the JSON helper accepts only SQL null or raw JSON strings of the declared container shape',()=>{
  assert.deepEqual(PIPELINE_JSON_FIELDS,{
    sample_json:'object',draft_ref_json:'object',timings_json:'object',reruns_json:'object',
    blockers_json:'array',verify_items_json:'array',
  });
  for(const [name,shape] of Object.entries(PIPELINE_JSON_FIELDS)) {
    assert.equal(validatePipelineJson(null,name),null);
    const raw=shape==='object'?' { "future": { "items":[true,null,7] } }\n':' [ {"future":{"items":[true,null,7]}} ]\n';
    assert.equal(validatePipelineJson(raw,name),raw);
    for(const value of [undefined,{},[],false,1,'null','false','7','"text"','{'])invalidJson(value,name);
    invalidJson(shape==='object'?'[]':'{}',name);
  }
});

test('each JSON value measures the inclusive 64 KiB limit in UTF-8 bytes rather than JS characters',()=>{
  for(const [name,shape] of Object.entries(PIPELINE_JSON_FIELDS)) {
    const exact=jsonOfBytes(65536,shape),over=jsonOfBytes(65537,shape);
    assert.ok(exact.length<65536,'the boundary includes multibyte text');
    assert.equal(validatePipelineJson(exact,name),exact);
    invalidJson(over,name);
    const row={[name]:exact};
    assert.equal(validateArticlePipelineFields(row),row);
  }
});

test('the six JSON columns share one inclusive 64 KiB budget and SQL null consumes no budget',()=>{
  const entries=Object.entries(PIPELINE_JSON_FIELDS);
  const exact=Object.fromEntries(entries.map(([name,shape],index)=>[name,jsonOfBytes(index<4?10923:10922,shape)]));
  assert.equal(Object.values(exact).reduce((sum,value)=>sum+Buffer.byteLength(value,'utf8'),0),65536);
  assert.equal(validateArticlePipelineFields(exact),exact);
  const over={...exact,sample_json:jsonOfBytes(10924)};
  for(const [name,value] of Object.entries(over))assert.equal(validatePipelineJson(value,name),value);
  invalid(over);
  const withNulls={...ARTICLE_PIPELINE_DEFAULTS,sample_json:jsonOfBytes(65536)};
  assert.equal(validateArticlePipelineFields(withNulls),withNulls);
});

test('JSON container depth starts at one and primitives do not consume an extra container level',()=>{
  const nested=depth=>{
    let value='leaf';
    for(let level=depth;level>=1;level--)
      value=level===1||level%2===1?{future:value}:[value];
    return JSON.stringify(value);
  };
  for(const name of objectFields) {
    const exact=nested(12);
    assert.equal(validatePipelineJson(exact,name),exact);
    invalidJson(nested(13),name);
  }
  const arrayRoot=depth=>{
    let value=null;
    for(let level=depth;level>=2;level--)value={future:value};
    return JSON.stringify([value]);
  };
  for(const name of arrayFields) {
    const exact=arrayRoot(12);
    assert.equal(validatePipelineJson(exact,name),exact);
    invalidJson(arrayRoot(13),name);
  }
});

test('the 4096-node budget counts every container and primitive leaf, including array items',()=>{
  for(const name of objectFields) {
    const exact=JSON.stringify({future:Array(4094).fill(null)});
    assert.equal(validatePipelineJson(exact,name),exact,'one root, one array and 4094 leaves');
    invalidJson(JSON.stringify({future:Array(4095).fill(null)}),name);
  }
  for(const name of arrayFields) {
    const exact=JSON.stringify(Array.from({length:4095},()=>({})));
    assert.equal(validatePipelineJson(exact,name),exact,'one root array and 4095 object items');
    invalidJson(JSON.stringify(Array.from({length:4096},()=>({}))),name);
  }
});

test('dangerous property names are rejected at every depth after JSON escape decoding',()=>{
  const names=['__proto__','constructor','prototype','\\u005f\\u005fproto__','c\\u006fnstructor','proto\\u0074ype'];
  for(const [name,shape] of Object.entries(PIPELINE_JSON_FIELDS)) {
    for(const key of names) {
      const direct='{"'+key+'":null}',nested='{"safe":[{"nested":{"'+key+'":{"polluted":true}}}]}';
      for(const raw of [direct,nested])invalidJson(shape==='array'?'['+raw+']':raw,name);
    }
    const safe='{"safe_constructor":{"text":"__proto__","future":[{"safe_prototype":true}]}}';
    const raw=shape==='array'?'['+safe+']':safe;
    assert.equal(validatePipelineJson(raw,name),raw,'property values and distinct safe keys remain opaque');
  }
  assert.equal(Object.hasOwn(Object.prototype,'polluted'),false);
});

test('known IDs stay strings, retry counts stay safe integers, and blocker types stay nullable strings',()=>{
  for(const key of ['pgc_id','appmsgid']) {
    for(const value of [null,'','000900719925474099312345678901234567890']) {
      const raw=JSON.stringify({[key]:value,unknown:{keep:[null,true,42]}});
      assert.equal(validatePipelineJson(raw,'draft_ref_json'),raw);
    }
    for(const value of [0,9007199254740992,false,{},[]])
      invalidJson(JSON.stringify({[key]:value}),'draft_ref_json');
  }
  for(const value of [null,0,1,Number.MAX_SAFE_INTEGER]) {
    const raw=JSON.stringify({watchdog:value,future:{watchdog:'opaque'}});
    assert.equal(validatePipelineJson(raw,'reruns_json'),raw);
  }
  for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'0',false,{},[]])
    invalidJson(JSON.stringify({watchdog:value}),'reruns_json');
  for(const value of [null,'','pending']) {
    const raw=JSON.stringify([{type:value,future:{type:42}}]);
    assert.equal(validatePipelineJson(raw,'blockers_json'),raw);
  }
  for(const value of [0,false,{},[]])invalidJson(JSON.stringify([{type:value}]),'blockers_json');
});

test('finished_at accepts real zoned timestamps verbatim, including future dates and fractional seconds',()=>{
  for(const value of [null,'2024-02-29T12:34+08:00','2099-01-01T00:00Z',
    '2024-02-29T23:59:59.123456789-00:30','2026-10-25T00:00:00.1Z']) {
    const raw=' { "finished_at": '+JSON.stringify(value)+', "future": {"keep":true} } ';
    assert.equal(validatePipelineJson(raw,'timings_json'),raw);
    const row={timings_json:raw};assert.equal(validateArticlePipelineFields(row),row);
  }
  for(const value of ['',0,false,{},[],'2023-02-29T00:00Z','1900-02-29T00:00Z','2026-04-31T00:00Z',
    '2026-10-25','2026-10-25T00:00','2026-10-25T24:00Z','2026-10-25T00:60Z',
    '2026-10-25T00:00:60Z','2026-10-25T00:00+24:00','2026-10-25T00:00+00:60',
    '2026-10-25T00:00.1Z','2026-10-25T00:00:00.1234567890Z',
    '2026-10-25T00:00Z\n','2026-10-25T00:00Z\u2028',' 2026-10-25T00:00Z','2026-10-25T00:00Z '])
    invalidJson(JSON.stringify({finished_at:value}),'timings_json');
});

test('duplicate-key shadowing cannot hide unsafe raw JSON while ordinary unknown duplicates remain verbatim',()=>{
  let nested=null;
  for(let depth=0;depth<12;depth++)nested={future:nested};
  const unsafe=[
    '{"a":{"__proto__":{}},"a":{}}',
    '{"a":{"\\u005f\\u005fproto__":{}},"a":{}}',
    '{"a":{"c\\u006fnstructor":{}},"a":{}}',
    '{"a":{"proto\\u0074ype":{}},"a":{}}',
    '{"a":'+JSON.stringify(nested)+',"a":{}}', // Root plus twelve nested containers exceeds depth 12.
    '{"a":'+JSON.stringify(Array(4094).fill(null))+',"a":{}}', // Root + array + 4094 leaves + final object = 4097 nodes.
  ];
  const ordinary=' { "a": {"opaque":1}, "a": {"future":[true,null,2]} } ';
  for(const [name,shape] of Object.entries(PIPELINE_JSON_FIELDS)) {
    for(const raw of unsafe)invalidJson(shape==='array'?'['+raw+']':raw,name);
    const valid=shape==='array'?'['+ordinary+']':ordinary;
    assert.equal(validatePipelineJson(valid,name),valid);
    const row={[name]:valid};assert.equal(validateArticlePipelineFields(row),row);
  }
});
