import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url),temporary=mkdtempSync(join(tmpdir(),'haoduoyu-bridge-contract-'));
after(()=>rmSync(temporary,{recursive:true,force:true}));
const javaDirectory=new URL('../app/src/main/java/xyz/haoduoyu/personal/',import.meta.url);
const harness=join(temporary,'BridgeContractMain.java');
writeFileSync(harness,`package xyz.haoduoyu.personal;
public final class BridgeContractMain {public static void main(String[] args){System.out.print(args.length==0?
NativeBridgeScripts.online():NativeBridgeScripts.legacy(Integer.parseInt(args[0]),Integer.parseInt(args[1]),Boolean.parseBoolean(args[2])));}}`);
const inputs=['-d',temporary,new URL('UrlPolicy.java',javaDirectory).pathname,new URL('NativeBridgeScripts.java',javaDirectory).pathname,harness];
const compiler=spawnSync('javac',inputs,{encoding:'utf8'});
if(compiler.error?.code==='ENOENT')execFileSync('java',['com.sun.tools.javac.Main',...inputs],{encoding:'utf8'});
else assert.equal(compiler.status,0,compiler.stderr);
const script=(...args)=>execFileSync('java',['-cp',temporary,'xyz.haoduoyu.personal.BridgeContractMain',...args],{encoding:'utf8'});
function execute(source,{origin='https://haoduoyu.xyz',frame=false}={}){
  const events=[],window={location:{origin},dispatchEvent:event=>events.push(event)};window.top=frame?{}:window;
  runInNewContext(source,{window,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  return events.map(event=>JSON.parse(JSON.stringify(event)));
}

test('compiled native network bridge emits only the fixed versioned wake-up event',()=>{
  assert.deepEqual(execute(script()),[{type:'haoduoyu:native-online',detail:{protocol:1,reason:'network-restored'}}]);
});
test('compiled native bridge rejects foreign origins and subframes at JavaScript execution time',()=>{
  for(const origin of ['http://haoduoyu.xyz','https://haoduoyu.xyz.evil.invalid','file://','null'])assert.deepEqual(execute(script(),{origin}),[]);
  assert.deepEqual(execute(script(),{frame:true}),[]);
});
test('legacy bridge contains only bounded counts and no local record or upload capability',()=>{
  const source=script('3','1','true');
  assert.deepEqual(execute(source),[{type:'haoduoyu:legacy-status',detail:{protocol:1,pending:3,conflicts:1,needsConsent:true}}]);
  assert.deepEqual(execute(source,{origin:'https://other.invalid'}),[]);
  for(const args of [['-1','0','false'],['0','100001','true']]){
    const result=spawnSync('java',['-cp',temporary,'xyz.haoduoyu.personal.BridgeContractMain',...args],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(result.stdout,'');
  }
});
test('thin-shell and recovery source expose no unrestricted JavaScript interface or native API cache',()=>{
  const main=readFileSync(new URL('MainActivity.java',javaDirectory),'utf8');
  const recovery=readFileSync(new URL('LegacyRecoveryActivity.java',javaDirectory),'utf8');
  assert.doesNotMatch(main+recovery,/addJavascriptInterface\s*\(/);
  assert.doesNotMatch(main,/setServiceWorkerClient\s*\(/);
  assert.match(main,/setDomStorageEnabled\(true\)/);
  assert.match(main,/NativeBridgeScripts\.allowedDocument\(web\.getUrl\(\)\)/);
});
