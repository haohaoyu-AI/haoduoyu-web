import assert from 'node:assert/strict';
import {round3DocumentSpec,round3DocumentDocs} from './workbench-round3-projection.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const documentDelta=JSON.parse(readFileSync(new URL('./fixtures/article-pipeline-document-delta.json',import.meta.url),'utf8'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');
const upsertDocumentDelta=()=>JSON.parse(readFileSync(new URL('./fixtures/article-upsert-document-delta.json',import.meta.url),'utf8'));
const snapshotDocumentDelta=()=>JSON.parse(readFileSync(new URL('./fixtures/snapshot-document-delta.json',import.meta.url),'utf8'));
function restoreSpecContract(spec,delta) {
  const result=structuredClone(spec);
  for(const {path,was,before,now,after_sha256}of delta.spec_changes) {
    let parent=result;
    for(const name of path.slice(0,-1)) {
      assert.ok(parent&&Object.hasOwn(parent,name),'article contract parent exists: '+path.join('/'));
      parent=parent[name];
    }
    const name=path.at(-1);
    assert.equal(Object.hasOwn(parent,name),now,'exact article contract path: '+path.join('/'));
    if(now)assert.equal(digest(parent[name]),after_sha256,'exact approved article contract value: '+path.join('/'));
    if(was)parent[name]=structuredClone(before);else delete parent[name];
  }
  return result;
}
export function snapshotDocumentSpec(spec) {
  const paths=Object.keys(spec.paths??{}).filter(path=>path==='/api/v1/snapshot'||path.startsWith('/api/v1/snapshot/'));
  if(!paths.length)return structuredClone(spec);
  assert.deepEqual(paths.sort(),['/api/v1/snapshot','/api/v1/snapshot/index'],'exact approved snapshot path inventory');
  return restoreSpecContract(spec,snapshotDocumentDelta());
}
export function reconciliationDocumentSpec(spec) {
  spec=round3DocumentSpec(spec);
  const input=structuredClone(spec),path='/api/v1/article-reconciliation';
  if(input.paths?.[path]) {
    const approved=JSON.parse(readFileSync(new URL('./fixtures/reconciliation-document-delta.json',import.meta.url),'utf8'));
    assert.equal(digest(input.paths[path]),approved.sha256,'exact approved reconciliation API contract');delete input.paths[path];
  }
  return input;
}
export function articlePipelineSpec(spec) {
  const snapshot=snapshotDocumentSpec(reconciliationDocumentSpec(spec));
  const previous=snapshot.paths?.['/api/v1/articles']?.patch?restoreSpecContract(snapshot,upsertDocumentDelta()):snapshot;
  if(!Object.hasOwn(previous.components.schemas.ArticleCreate.properties,'status'))return previous;
  return restoreSpecContract(previous,documentDelta);
}
function restoreDocsContract(html,delta) {
  const {replacements,section}=delta.docs;
  if(!html.includes(section.start))return html;
  assert.equal(html.split(section.start).length,2,'single lifecycle documentation start');
  assert.equal(html.split(section.end).length,2,'single lifecycle documentation end');
  const from=html.indexOf(section.start),to=html.indexOf(section.end)+section.end.length;
  assert.ok(to>from,'ordered lifecycle documentation markers');
  assert.equal(digest(html.slice(from,to)),section.sha256,'exact approved lifecycle documentation section');
  let result=html.slice(0,from)+html.slice(to);
  for(const {before,after}of replacements) {
    assert.equal(result.split(after).length,2,'single approved lifecycle documentation replacement');
    result=result.replace(after,before);
  }
  return result;
}
export function snapshotDocumentDocs(html) {
  html=round3DocumentDocs(html);
  const delta=snapshotDocumentDelta(),{start,end}=delta.docs.section;
  assert.equal(html.includes(start),html.includes(end),'complete approved snapshot documentation markers');
  return restoreDocsContract(html,delta);
}
export function articlePipelineDocs(html) {
  const snapshot=snapshotDocumentDocs(html);
  const previous=snapshot.includes('<!-- article-upsert-contract:start -->')?restoreDocsContract(snapshot,upsertDocumentDelta()):snapshot;
  return restoreDocsContract(previous,documentDelta);
}

// Characterization tests exercise only legacy published rows. The historical
// Worker also sees the new raw columns via SELECT a.* on the upgraded fixture.
// Validate the entire approved default extension before projecting either raw
// storage names or the new logical JSON names. Do not hide non-default data.
const scalars=['status','slot','run_dir','run_date','series_no','writer','illustrator',
  'char_count','subheading_count','image_count','cover_desc'];
const json=['sample','draft_ref','timings','reruns','blockers','verify_items'];
export function projectLegacyArticleComputedFields(row) {
  const result={...row};
  // Legacy fixtures have unknown pipeline counts, so only their already-known
  // platform/title can produce a warning. Never treat unknown counts as zero.
  if(Object.hasOwn(row,'warnings')) {
    const expected=row.platform==='toutiao'&&typeof row.title==='string'&&Array.from(row.title).length>30?
      ['TOUTIAO_TITLE_TOO_LONG']:[];
    assert.deepEqual(row.warnings,expected,'approved default or known legacy title warnings');
    delete result.warnings;
  }
  if(Object.hasOwn(row,'has_pending_verify')||Object.hasOwn(row,'verify_state')) {
    assert.ok(Object.hasOwn(row,'has_pending_verify')&&Object.hasOwn(row,'verify_state'),'complete approved default verification state');
    assert.equal(row.has_pending_verify,null,'approved default pending verification remains unknown');
    assert.equal(row.verify_state,'unknown','approved default verification state remains unknown');
    delete result.has_pending_verify;delete result.verify_state;
  }
  return result;
}
export function legacyPublishedArticles(value) {
  const result=structuredClone(value);
  function visit(item) {
    if(!item||typeof item!=='object')return;
    if(Array.isArray(item)){for(const row of item)visit(row);return;}
    if(typeof item.id==='string'&&typeof item.account_id==='string'&&typeof item.title==='string'&&
      Object.hasOwn(item,'status')) {
      projectLegacyArticleComputedFields(item);
      delete item.warnings;delete item.has_pending_verify;delete item.verify_state;
      for(const key of scalars) {
        assert.ok(Object.hasOwn(item,key),'complete legacy article scalar extension: '+key);
        assert.equal(item[key],key==='status'?'published':null,'legacy projection cannot hide article metadata: '+key);
        delete item[key];
      }
      for(const key of json) {
        const raw=key+'_json',hasLogical=Object.hasOwn(item,key),hasRaw=Object.hasOwn(item,raw);
        assert.notEqual(hasLogical,hasRaw,'exactly one article JSON representation: '+key);
        const name=hasLogical?key:raw;
        assert.equal(item[name],null,'legacy projection cannot hide article JSON: '+name);
        delete item[name];
      }
    }
    for(const child of Object.values(item))visit(child);
  }
  visit(result);return result;
}
