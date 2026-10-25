import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {snapshotDocumentSpec,snapshotDocumentDocs,articlePipelineSpec,articlePipelineDocs} from './article-pipeline-projection.mjs';

const baseline='fe8efa479c0c2865970b43053db4deb62a3380c9';
const old=file=>execFileSync('git',['show',baseline+':'+file],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
const previousSpec=JSON.parse(old('public/openapi.json')),previousDocs=old('public/api-docs.html');
const spec=JSON.parse(readFileSync(new URL('../public/openapi.json',import.meta.url),'utf8'));
const docs=readFileSync(new URL('../public/api-docs.html',import.meta.url),'utf8');
const delta=JSON.parse(readFileSync(new URL('./fixtures/snapshot-document-delta.json',import.meta.url),'utf8'));
const paths=['/api/v1/snapshot','/api/v1/snapshot/index'];
const {start,end}=delta.docs.section;

test('snapshot document delta pins exactly two paths and one section against the pre-snapshot baseline',()=>{
  assert.equal(delta.baseline,baseline);
  assert.deepEqual(delta.spec_changes.map(({path,was,now})=>({path,was,now})),
    paths.map(path=>({path:['paths',path],was:false,now:true})));
  assert.deepEqual(delta.docs.replacements,[]);
  assert.equal(start,'<!-- snapshot-contract:start -->');
  assert.equal(end,'<!-- snapshot-contract:end -->');
  for(const path of paths) {
    assert.ok(Object.hasOwn(spec.paths,path),'approved snapshot path is present');
    assert.equal(Object.hasOwn(previousSpec.paths,path),false,'snapshot path was absent at baseline');
  }
  assert.ok(docs.includes(start)&&docs.includes(end),'approved snapshot section is present');
  const unchanged=structuredClone(spec);
  assert.deepEqual(snapshotDocumentSpec(spec),previousSpec);
  assert.equal(snapshotDocumentDocs(docs),previousDocs);
  assert.deepEqual(spec,unchanged,'the input specification remains unchanged');
  assert.deepEqual(articlePipelineSpec(spec),articlePipelineSpec(previousSpec),'snapshot restoration precedes all existing article assertions');
  assert.equal(articlePipelineDocs(docs),articlePipelineDocs(previousDocs));
});

test('snapshot projection accepts unchanged historical documents without stripping legacy fields',()=>{
  assert.deepEqual(snapshotDocumentSpec(previousSpec),previousSpec);
  assert.equal(snapshotDocumentDocs(previousDocs),previousDocs);
  assert.notEqual(snapshotDocumentSpec(previousSpec),previousSpec,'historical specifications are cloned');
});

test('snapshot projection rejects changed, missing or unapproved snapshot paths',()=>{
  for(const path of paths) {
    const changed=structuredClone(spec);changed.paths[path].get.operationId='unexpectedSnapshotOperation';
    assert.throws(()=>snapshotDocumentSpec(changed),assert.AssertionError,'a changed snapshot contract cannot be hidden');
    const extraMethod=structuredClone(spec);extraMethod.paths[path].post={responses:{'200':{description:'Unexpected mutation'}}};
    assert.throws(()=>snapshotDocumentSpec(extraMethod),assert.AssertionError,'a new snapshot method cannot be hidden');
    const missing=structuredClone(spec);delete missing.paths[path];
    assert.throws(()=>snapshotDocumentSpec(missing),assert.AssertionError,'a partial snapshot contract cannot be hidden');
  }
  const extra=structuredClone(spec);extra.paths['/api/v1/snapshot/unapproved']={get:{responses:{'200':{description:'Unexpected route'}}}};
  assert.throws(()=>snapshotDocumentSpec(extra),assert.AssertionError,'an unapproved snapshot route is rejected');
});

test('snapshot projection preserves unrelated specification changes for legacy assertions to detect',()=>{
  const changed=structuredClone(spec),expected=structuredClone(previousSpec);
  for(const value of [changed,expected]) {
    value.info.title='Synthetic retained title';
    value.paths['/api/v1/accounts'].get.description='Synthetic retained legacy route change';
    value.components.schemas.SnapshotUnexpected={type:'string'};
    value.paths['/api/v1/retained-route']={get:{responses:{'200':{description:'Retained addition'}}}};
  }
  const projected=snapshotDocumentSpec(changed);
  assert.deepEqual(projected,expected);
  assert.notDeepEqual(projected,previousSpec,'legacy assertions still see every unrelated change');
  assert.deepEqual(articlePipelineSpec(changed),articlePipelineSpec(expected));
});

test('snapshot documentation projection rejects changed, duplicated, incomplete and unordered sections',()=>{
  const from=docs.indexOf(start),to=docs.indexOf(end)+end.length,section=docs.slice(from,to);
  for(const changed of [
    docs.replace(start,start+'Unexpected snapshot text'),
    docs+section,
    docs.replace(start,''),
    docs.replace(end,''),
    docs.replace(start,start+start),
    docs.replace(end,end+end),
    end+docs.replace(end,''),
  ])assert.throws(()=>snapshotDocumentDocs(changed),assert.AssertionError);
});

test('snapshot documentation projection preserves edits outside the approved section',()=>{
  const retained='<!-- unrelated documentation addition remains visible -->';
  assert.equal(snapshotDocumentDocs(docs+retained),previousDocs+retained);
  assert.equal(articlePipelineDocs(docs+retained),articlePipelineDocs(previousDocs)+retained);
  const changed=docs.replace('<title>','<title>Retained legacy title ');
  assert.notEqual(changed,docs,'the legacy title mutation is exercised');
  assert.equal(snapshotDocumentDocs(changed),previousDocs.replace('<title>','<title>Retained legacy title '));
  assert.notEqual(snapshotDocumentDocs(changed),previousDocs,'legacy assertions still see outside edits');
});
