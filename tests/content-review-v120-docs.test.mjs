import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('review v1.2 documentation describes all resources and their write contracts',()=>{
  const api=JSON.parse(read('openapi.json'));
  assert.equal(api.info.version,'1.2.0');
  for(const slug of ['benchmark-accounts','benchmark-articles','notes','account-health']) {
    const base='/api/v1/review/'+slug;
    assert.ok(api.paths[base].get);
    assert.deepEqual(Object.keys(api.paths[base+'/{uuid}']).sort(),['delete','get','patch','put']);
    assert.ok(api.paths[base+'/{uuid}/restore'].post);
    for(const method of ['delete'])assert.equal(api.paths[base+'/{uuid}'][method].requestBody.content['application/json'].schema.$ref,'#/components/schemas/ReviewSimpleDelete');
    assert.equal(api.paths[base+'/{uuid}/restore'].post.requestBody.content['application/json'].schema.$ref,'#/components/schemas/ReviewSimpleDelete');
    assert.ok(api.paths[base].get.parameters.some(x=>x.name==='read_revision'));
    assert.ok(api.paths[base].get.parameters.some(x=>x.name==='include_deleted'));
  }
  assert.ok(api.paths['/api/v1/review/benchmark-articles:batch'].put);
  assert.ok(api.components.schemas.ReviewArticlePatch.properties.reference_article_id);
  assert.ok(api.components.schemas.ReviewPlaybookPatch.properties.status);
  assert.ok(api.components.schemas.ReviewRulePatch.properties.evidence_note);
  for(const name of ['api-docs.html','llms.txt']) {
    const doc=read(name);
    for(const term of ['benchmark-accounts','benchmark-articles','account-health','read_revision','expected_hash','evidence_note'])assert.ok(doc.includes(term),`${name}: ${term}`);
  }
});
