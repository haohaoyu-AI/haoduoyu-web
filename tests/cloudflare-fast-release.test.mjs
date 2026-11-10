import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
const blocks=yaml.split(/^      - name: /m).slice(1);
const step=name=>{
  const found=blocks.find(block=>block.startsWith(name+'\n'));
  assert.ok(found,name);
  return found;
};

test('fast release skips optional test commands by default without continue-on-error',()=>{
  const input=yaml.split('      run_regression_tests:\n')[1]?.split('      expected_current_version:')[0];
  assert.ok(input);
  assert.match(input,/type: boolean/);
  assert.match(input,/default: false/);
  const tests=blocks.filter(block=>block.includes('node --test '));
  assert.equal(tests.length,10);
  for(const block of tests) assert.match(block,/\n        if: inputs\.run_regression_tests(?:\n| && \()/);
  assert.doesNotMatch(yaml,/continue-on-error/);
});

test('fast mode cannot skip the actual source, artifact or production operation guards',()=>{
  for(const name of ['Scan all fetched history before using production credentials',
    'Verify exact release eligibility','Checkout accepted source','Install locked build dependencies',
    'Verify committed data trends frontend before regeneration','Build accepted Worker without migrations or deployment',
    'Verify restored source artifacts','Verify accepted Worker bytes','Publish existing Worker with inherited bindings'])
    assert.doesNotMatch(step(name),/inputs\.run_regression_tests/);
  assert.match(yaml,/group: haoduoyu-cloudflare-production\n  cancel-in-progress: false/);
  assert.match(yaml,/environment: cloudflare-production/);
  assert.match(yaml,/permissions:\n  contents: read\n  actions: read/);
  assert.equal((yaml.match(/CLOUDFLARE_API_TOKEN:/g)||[]).length,1);
  assert.ok(yaml.indexOf('Verify accepted Worker bytes')<yaml.indexOf('CLOUDFLARE_API_TOKEN:'));
});
