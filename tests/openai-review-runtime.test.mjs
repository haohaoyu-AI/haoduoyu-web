import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

// The real workerd fetch/Headers/AbortController/ReadableStream path, with all
// outbound traffic intercepted locally. No credentials or production calls.
test('Workers runtime default fetch accepts the fixed endpoint, headers, stream parsing and abort signal',async t=>{
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const bundle=await build({stdin:{contents:`
    import {runReviewProvider} from './src/openai-review-provider.mjs';
    export default {async fetch(request) {
      if(new URL(request.url).pathname==='/legacy-redirect') {
        try {await fetch('https://api.openai.com/v1/responses',{method:'POST',
          headers:{Authorization:'Bearer synthetic-runtime-key','Content-Type':'application/json'},body:'{}',redirect:'error'});
          return Response.json({localTypeError:false});}
        catch(error) {return Response.json({localTypeError:error instanceof TypeError});}
      }
      let marks=0;
      try {return Response.json({output:await runReviewProvider({key:'synthetic-runtime-key',model:'gpt-6.1-terra',
        instructions:'synthetic',input:{sample:true},...(new URL(request.url).pathname==='/injected'?{request:fetch}:{}),lookup:async()=>({items:[]}),beforeCall:async()=>{marks++;},
        timeoutMs:new URL(request.url).pathname==='/timeout'?10:1000}),marks});}
      catch(error) {return Response.json({code:error.reviewCode,uncertain:error.uncertain,diagnostics:error.provider_diagnostics,marks});}
    }};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',external:['node:*']});
  let calls=0,mode='success';
  const mf=new Miniflare({modules:true,cf:false,script:bundle.outputFiles[0].text,
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
    host:'127.0.0.1',port:0,inspectorPort:0,
    outboundService:async request=>{
      calls++;
      assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.method,'POST');
      assert.equal(request.headers.get('content-type'),'application/json');
      assert.equal(request.headers.get('authorization'),'Bearer synthetic-runtime-key');
      const body=await request.json();assert.equal(body.model,'gpt-6.1-terra');assert.equal(body.store,false);
      assert.equal(body.max_output_tokens,6000);assert.equal(body.parallel_tool_calls,false);
      if(mode==='timeout')await new Promise(resolve=>setTimeout(resolve,60));
      if(Number.isInteger(mode))return new Response(null,{status:mode,headers:{Location:'https://redirect.invalid/never-follow'}});
      if(mode==='rejected')return Response.json({error:{message:'not logged'}},{status:400,headers:{'x-request-id':'req_runtime_rejected'}});
      return Response.json({id:'resp_runtime',status:'completed',usage:{input_tokens:1,output_tokens:2,total_tokens:3},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({report_markdown:'synthetic report',cumulative_summary:'synthetic summary',pending_verification:[]})}]}]},
        {headers:{'x-request-id':'req_runtime'}});
    }});
  t.after(()=>mf.dispose());
  const legacy=await (await mf.dispatchFetch('http://localhost/legacy-redirect')).json();
  assert.equal(legacy.localTypeError,true);assert.equal(calls,0,'unsupported redirect fails before any outbound request');
  const success=await (await mf.dispatchFetch('http://localhost/')).json();
  assert.ok(success.output,JSON.stringify({success,calls}));assert.equal(success.output.report_markdown,'synthetic report');assert.equal(success.marks,1);
  assert.equal(success.output.provider_diagnostics[0].http_status,200);
  const injected=await (await mf.dispatchFetch('http://localhost/injected')).json();
  assert.equal(injected.output.report_markdown,'synthetic report');assert.equal(injected.marks,1);
  mode='rejected';
  const rejected=await (await mf.dispatchFetch('http://localhost/')).json();
  assert.equal(rejected.code,'OPENAI_REVIEW_PROVIDER_REJECTED');assert.equal(rejected.uncertain,false);
  assert.equal(rejected.diagnostics[0].http_status,400);assert.equal(rejected.marks,1);
  for(const status of [301,302,303,307,308]) {
    mode=status;const redirected=await (await mf.dispatchFetch('http://localhost/')).json();
    assert.equal(redirected.code,'OPENAI_REVIEW_PROVIDER_REJECTED');assert.equal(redirected.uncertain,false);
    assert.equal(redirected.diagnostics[0].http_status,status);assert.equal(redirected.marks,1);
  }
  mode='timeout';
  const timeout=await (await mf.dispatchFetch('http://localhost/timeout')).json();
  assert.equal(timeout.code,'OPENAI_REVIEW_PROVIDER_TIMEOUT');assert.equal(timeout.uncertain,true);
  assert.equal(timeout.diagnostics[0].phase,'fetch');assert.equal(timeout.diagnostics[0].timeout,true);
  assert.equal(timeout.marks,1);assert.equal(calls,9);
});

test('Workers runtime count profile completes one small schema-only call without tools or complex instructions',async t=>{
  const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
  const bundle=await build({stdin:{contents:`
    import {runReviewProvider} from './src/openai-review-provider.mjs';
    export default {async fetch() {
      let marks=0;
      const result=await runReviewProvider({key:'synthetic-count-runtime-key',model:'gpt-6.1-sol',
        instructions:'COMPLEX_INSTRUCTIONS_MUST_NOT_BE_SENT',
        input:{task:'article_count_v1',article_count:3,scope:'Synthetic owner article-review library only'},
        beforeCall:async()=>{marks++;},lookup:async()=>{throw Error('No lookup is permitted');}});
      return Response.json({result,marks});
    }};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',external:['node:*']});
  let calls=0;
  const mf=new Miniflare({modules:true,cf:false,script:bundle.outputFiles[0].text,
    compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,host:'127.0.0.1',port:0,inspectorPort:0,
    outboundService:async request=>{
      calls++;assert.equal(request.url,'https://api.openai.com/v1/responses');
      const body=await request.json();assert.equal(body.max_output_tokens,1024);assert.equal(body.store,false);
      assert.equal(body.tools,undefined);assert.equal(body.include,undefined);assert.equal(body.input.length,1);
      assert.equal(body.text.format.name,'article_count');assert.doesNotMatch(JSON.stringify(body),/COMPLEX_INSTRUCTIONS/);
      return Response.json({id:'resp_count_runtime',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"article_count":3}'}]}]});
    }});
  t.after(()=>mf.dispose());
  const result=await(await mf.dispatchFetch('http://localhost/')).json();
  assert.equal(result.marks,1);assert.equal(calls,1);assert.equal(result.result.article_count,3);
  assert.match(result.result.report_markdown,/共有 3 篇/);
});
