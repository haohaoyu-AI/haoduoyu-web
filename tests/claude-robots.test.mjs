import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const robots=await readFile(new URL('../public/robots.txt',import.meta.url),'utf8');
const agents=['Claude-User','Claude-SearchBot'];

test('robots permits Claude public-page reads while retaining API and general crawler exclusions',()=>{
  const policy=robots.split('\n').map(line=>line.split('#')[0].trim()).filter(Boolean).join('\n');
  assert.equal(policy,[
    'User-agent: Claude-User','User-agent: Claude-SearchBot','Disallow: /api/','Allow: /',
    'User-agent: *','Disallow: /'
  ].join('\n'));
});

test('built Worker serves the same robots and public pages to Claude without a robots header restriction',async()=>{
  for(const agent of [...agents,'ClaudeBot','Mozilla/5.0']) {
    const headers={'User-Agent':agent};
    const response=await worker.fetch(new Request('https://example.invalid/robots.txt',{headers}),{});
    assert.equal(response.status,200);assert.equal(await response.text(),robots);
    assert.match(response.headers.get('Content-Type'),/^text\/plain/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'),null);
    for(const path of ['/','/index.html','/api-docs','/llms.txt','/openapi.json']) {
      const page=await worker.fetch(new Request('https://example.invalid'+path,{headers}),{});
      assert.equal(page.status,200,path);assert.equal(page.headers.get('X-Robots-Tag'),null,path);
      const body=await page.text();assert.ok(body.length>0);
      assert.doesNotMatch(body,/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*(?:noindex|none)/i);
    }
  }
});

test('a Claude user-agent never substitutes for API authentication',async t=>{
  const app=await fixture(t);
  for(const agent of agents) {
    const response=await worker.fetch(new Request(app.origin+'/api/v1/accounts',{
      headers:{'User-Agent':agent}
    }),{DB:app.db,SITE_ORIGIN:app.origin});
    assert.equal(response.status,401);assert.equal(response.headers.get('Set-Cookie'),null);
  }
});
