// Original independent review reproductions, inverted to prove safe refusal.
// Reuse only synthetic browser fixture definitions; production traversal executes.
import fs from 'node:fs/promises';
const root=new URL('..',import.meta.url);
const source=(await fs.readFile(new URL('tests/cua-draft-runner.mjs',root),'utf8')).split('let tests=0;')[0].replaceAll("'../scripts/",`'${new URL('scripts/',root).href}`);
const checks=String.raw`
let negativeCases=0;
const proof=(name,data)=>{negativeCases++;console.log('PASS',name,JSON.stringify(data));};
const noBodyInput=x=>!x.editor.log.some(r=>r[0]==='type'||r[0]==='press'&&['Backspace','Return'].includes(r[2]));
// Review 1: real semantic caption, input value, unknown bare text are not omitted.
for(const kind of ['figcaption','textarea','baretext']) {
 const x=setup();await importOnce(x);
 const text='用户追加的冻结正文外文字';
 const extra=kind==='baretext'?{nodeType:3,textContent:text}:{nodeType:1,tagName:kind.toUpperCase(),textContent:text,...(kind==='textarea'?{value:text}:{}),childNodes:[{nodeType:3,textContent:text}],children:[],matches:()=>false};
 const patch=tab=>{const orig=tab.locator;tab.locator=key=>{const l=orig(key);if(key==='body')l.evaluate=async(fn,arg)=>fn({nodeType:1,tagName:'DIV',matches:()=>false,children:[...tab.content.rows.map(domElement),extra],childNodes:[...tab.content.rows.map(domElement),extra],querySelectorAll:()=>kind==='baretext'?[]:[extra]},arg);return l;};return tab;};
 patch(x.editor);
 const r=await x.runtime.acceptObserved(x.s,{recorded:true});assert.equal(r.kind,'readback_mismatch');
 const verified=await x.runtime.verify(x.s,{inspectedBindings:inspected});assert.notEqual(verified.args?.state,'verified');assert.equal(x.editor.fileCount,1);assert(noBodyInput(x));
 proof('additional '+kind+' blocks complete readback',{kind:r.kind,verified:false,bodyWrites:0});
}
// Review 2: prefix text-node end is not the whole paragraph end; never Return.
{
 const x=setup();await importOnce(x);x.s.ui.imageFile=binding('imageFile');x.editor.content.rows=x.editor.content.rows.filter(r=>r.kind!=='image');
 const whole=baseline.paragraphs[0],first=whole.slice(0,2),rest=whole.slice(2),block={textContent:whole};
 const firstText={nodeType:3,textContent:first,parentElement:{closest:()=>block},nextSibling:{nodeType:3,textContent:rest}};
 globalThis.window={getSelection:()=>({anchorNode:firstText,anchorOffset:first.length,isCollapsed:true,toString:()=>''})};x.editor.playwright.evaluate=async fn=>fn();
 const r=await x.runtime.repairMissingImage(x.s,{index:0,anchorBinding:binding('anchor'),fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/image.png'},inspectedBindings:[]});
 assert.equal(r.kind,'format_missing_images');assert.equal(x.editor.fileCount,1);assert(noBodyInput(x));delete globalThis.window;
 proof('mid-text-node caret cannot trigger image insertion',{kind:r.kind,setFiles:1,returnIssued:false});
}
// Review 3: same tab, different actual draft ID is never edited.
{
 const x=setup();await importOnce(x);x.editor.content.url=url('toutiao').replace('12345','777777');x.editor.content.rows.unshift({kind:'paragraph',text:baseline.title,tag:'P'});
 const r=await x.runtime.repairParagraph(x.s,{kind:'duplicate_title',binding:binding('duplicate')});assert.equal(r.status,'blocked');assert(noBodyInput(x));assert.equal(x.editor.fileCount,1);
 proof('different draft ID blocks structural write',{status:r.status,backspace:false});
}
// Review 4: crash clears write eligibility permanently, even after reload.
{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});
 const snapshot=x.editor.playwright.domSnapshot;x.editor.playwright.domSnapshot=async()=>{throw Error('CDP timeout');};
 assert.equal((await x.runtime.observe(x.s)).kind,'browser_crash');x.editor.playwright.domSnapshot=snapshot;await x.runtime.recoverBrowser(x.s);await x.runtime.acceptObserved(x.s,{recorded:true});
 assert.equal(x.s.readonly_fenced,true);assert.equal(x.s.document_imported_this_session,false);
 const r=await x.runtime.repairParagraph(x.s);assert.equal(r.status,'blocked');assert(noBodyInput(x));
 const cover=await x.runtime.setZhihuCover(x.s,{fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12}});assert.equal(cover.status,'blocked');assert.equal(x.editor.fileCount,1);
 proof('crash reload stays readonly',{repair:r.status,cover:cover.status,offlineNativeOpen:1});
}
// Review 5: all direct chooser clicks inspect live text/accessible labels/identity.
for(const labelType of ['text','aria']) {
 const x=setup();await reachConsumed(x);const orig=x.editor.locator,priorClicks=x.editor.log.filter(v=>v[0]==='click'&&v[1]==='file').length;
 x.editor.locator=key=>{const l=orig(key);if(key==='file'){if(labelType==='text')l.innerText=async()=>'发布';else l.getAttribute=async name=>name==='aria-label'?'发布':null;}return l;};
 const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'permission_approval');assert.equal(x.editor.log.filter(v=>v[0]==='click'&&v[1]==='file').length,priorClicks);assert.equal(x.editor.fileCount,0);
 proof('publish '+labelType+' chooser trigger is never clicked',{kind:r.kind,triggerClicked:false,setFiles:0});
}
// Review 6: a user-edited body refuses a cover upload before chooser.
{
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.editor.content.rows[0].text='用户编辑后的新正文';
 const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12}});assert.equal(r.kind,'readback_mismatch');assert.equal(x.editor.fileCount,1);assert(!x.editor.log.some(v=>v[0]==='click'&&v[1]==='coverFile'));
 proof('user-edited body blocks Zhihu cover',{kind:r.kind,offlineNativeOpen:1});
}
// Pending/unknown phase is not inspect, even if old DOM still matches baseline.
for(const phase of ['import_pending','result_unknown','done']) {
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});x.s.phase=phase;
 const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12}});assert.equal(r.status,'blocked');assert.equal(x.editor.fileCount,1);
 proof('phase '+phase+' forbids cover write',{status:r.status,offlineNativeOpen:1});
}
// Check the live snapshot, not just a manually changed cached phase.
for (const [visible, kind] of [['文档导入中…','import_pending'],['导入失败','platform_import_failure']]) {
 const x=setup('zhihu');await importOnce(x);await x.runtime.acceptObserved(x.s,{recorded:true});assert.equal(x.s.phase,'inspect');x.editor.content.blocker=visible;
 const r=await x.runtime.setZhihuCover(x.s,{fileEvidence:{sha256:ihash,checked_at:TIME,visible_in_browser:true,browser_session:'mock-session',absolute_path:'/mock/cover.png',size:12}});
 assert.equal(r.kind,kind);assert.equal(x.editor.fileCount,1);assert(!x.editor.log.some(v=>v[0]==='click'&&v[1]==='coverFile'));
 proof('live '+kind+' blocks cached-inspect cover write',{kind:r.kind,offlineNativeOpen:1});
}
// Download provenance is a constrained execution route, never path-visibility proof.
for(const [name,patch] of [
 ['shell stat alone',f=>{delete f.handoff;}],
 ['different download browser',f=>{f.handoff.download_browser_session='other-browser';}],
 ['different source bytes',f=>{f.handoff.source_sha256='c'.repeat(64);}],
 ['unverified CUA bytes',f=>{f.handoff.verified_in_cua=false;}],
 ['visibility promoted to true',f=>{f.visible_in_browser=true;}],
]){
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);patch(x.file);
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.status,'blocked');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);assert.equal(x.editor.log.length,0);
 proof(name+' cannot bypass the download handoff',{status:r.status,chooserClicked:false,setFiles:0});
}
{
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);x.file.handoff.chooser_prepared=true;x.file.handoff.chooser_prepared_at=TIME;
 x.editor.playwright.waitForEvent=async()=>{throw Error('genuine chooser unavailable');};
 const r=await x.runtime.preflight(x.s,{editorTab:x.editor,listTab:x.list,fileEvidence:x.file,history:{prior_submission:'never_attempted',evidence_reference:'synthetic'}});
 assert.equal(r.kind,'picker_failure');assert.equal(x.s.pending,undefined);assert.equal(x.editor.fileCount,0);assert.equal(x.s.readonly_fenced,true);
 proof('caller chooser claim cannot emit a reserve request',{kind:r.kind,reserve:false,setFiles:0});
}
{
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);await reachConsumed(x);x.editor.content.throwUpload='browser cannot resolve the named path';
 const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'submission_unknown');assert.equal(x.s.file.visible_in_browser,false);assert.equal(x.s.file.visibility_unproven,true);assert.equal(x.s.grant,false);assert.equal(x.s.readonly_fenced,true);assert.equal(x.editor.fileCount,1);
 await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(x.editor.fileCount,1);
 const restored=setup('toutiao',{...x.input,checkpoint:r.checkpoint});assert.equal(restored.s.chooser,undefined);assert.equal(restored.s.grant,undefined);assert.equal((await restored.runtime.submitAfterSaving(restored.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(restored.editor.fileCount,0);
 proof('failed first SDK path access cannot replay after checkpoint',{kind:r.kind,visibilityProven:false,setFiles:1,restoredSetFiles:0});
}
for(const unproven of [false,true]){
 const x=setup('toutiao',{executor_id:'cua-executor'});if(unproven)x.file=sameBrowserDownload(x);await reachConsumed(x);const approvedFile=x.s.file;
 x.s.file={...structuredClone(approvedFile),absolute_path:'/unchecked-replacement/synthetic.docx'};
 const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'readback_mismatch');assert.equal(x.editor.fileCount,0);assert.deepEqual(x.editor.log.filter(row=>row[0]==='setFiles'),[]);assert.equal(x.s.grant,false);assert.equal(x.s.readonly_fenced,true);
 x.s.file=approvedFile;assert.equal((await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'})).status,'blocked');assert.equal(x.editor.fileCount,0);
 proof((unproven?'download':'visible')+' file binding cannot be replaced or replayed',{kind:r.kind,submittedPaths:[],grantRestored:false});
}
{
 const x=setup('toutiao',{executor_id:'cua-executor'});x.file=sameBrowserDownload(x);await reachConsumed(x);const snapshot=x.editor.playwright.domSnapshot;
 x.editor.playwright.domSnapshot=async()=>{const result=await snapshot();x.s.file={...structuredClone(x.s.file),absolute_path:'/async-unchecked/synthetic.docx'};return result;};
 const r=await x.runtime.submitAfterSaving(x.s,{state:'toutiao_saving'});assert.equal(r.kind,'readback_mismatch');assert.equal(x.editor.fileCount,0);assert.deepEqual(x.editor.log.filter(row=>row[0]==='setFiles'),[]);
 proof('awaited live snapshot cannot swap the privately approved path',{kind:r.kind,submittedPaths:[]});
}
console.log(JSON.stringify({negative_cases:negativeCases,independent_review_blocker_categories:6,real_platform_calls:0,model_calls:0,production_db_writes:0}));
`;
await import('data:text/javascript;base64,'+Buffer.from(source+checks).toString('base64'));
