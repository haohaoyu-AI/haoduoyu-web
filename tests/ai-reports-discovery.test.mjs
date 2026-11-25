import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicBusinessDocs } from '../src/public-business-docs.mjs';

test('AI report public API discovery documents the implemented contract', () => {
  const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
  const api = JSON.parse(read('openapi.json'));
  const get = api.paths['/api/v1/ai-reports'].get;
  const put = api.paths['/api/v1/ai-reports/{uuid}'].put;
  assert.deepEqual(get.security, []);
  assert.deepEqual(put.security, []);
  assert.equal(get.parameters.find(p => p.name === 'offset').schema.default, 0);
  assert.equal(put.parameters.find(p => p.name === 'X-Public-Business').schema.const, '1');
  assert.deepEqual(api.components.schemas.AiReportCreate.required, ['author', 'content']);
  for (const status of ['200', '201', '400', '401', '403', '404', '409', '413', '415', '429', '500', '503']) assert.ok(put.responses[status], status);
  for (const docs of [read('llms.txt'), read('api-docs.html'), publicBusinessDocs(read('api-docs.html'))]) {
    for (const term of ['/api/v1/ai-reports?offset=0', '/api/v1/ai-reports/{uuid}', 'YYYY-MM-DD', 'X-Public-Business', 'IDEMPOTENCY_CONFLICT', 'AI_REPORTS_RATE_LIMIT']) assert.ok(docs.includes(term), term);
  }
});
