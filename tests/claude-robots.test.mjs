import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const robots=await readFile(new URL('../public/robots.txt',import.meta.url),'utf8');
const agents=['Claude-User','Claude-SearchBot'];

test('robots permits Claude public-page reads and only the exact privacy policy for other crawlers',()=>{
  const policy=robots.split('\n').map(line=>line.split('#')[0].trim()).filter(Boolean).join('\n');
  assert.equal(policy,[
    'User-agent: Claude-User','User-agent: Claude-SearchBot','Disallow: /api/','Allow: /',
    'User-agent: *','Disallow: /','Allow: /privacy$'
  ].join('\n'));
});

test('the built Worker serves the exact privacy document without authenticating or touching D1',async()=>{
  const source=await readFile(new URL('../public/privacy.html',import.meta.url));
  const env={get DB(){assert.fail('static privacy page must not access D1');}};
  const origin='https://example.invalid';
  const response=await worker.fetch(new Request(origin+'/privacy',{redirect:'manual'}),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Content-Type'),'text/html; charset=utf-8');
  for(const header of ['Location','Set-Cookie','X-Robots-Tag']) assert.equal(response.headers.get(header),null);
  const html=source.toString('utf8');
  assert.match(html,/<title>隐私政策 · 好多鱼工作台<\/title>/);
  assert.doesNotMatch(html,/<meta\b[^>]*name=["'](?:robots|googlebot)["'][^>]*>/i);
  const style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const styleHash=createHash('sha256').update(style).digest('base64');
  assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
  assert.ok(response.headers.get('Content-Security-Policy').includes("style-src 'sha256-"+styleHash+"'"));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);
  const head=await worker.fetch(new Request(origin+'/privacy',{method:'HEAD'}),env);
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  for(const [path,method] of [['/privacy.html','GET'],['/privacy/','GET'],['/%70rivacy','GET'],['/privacy','POST']]) {
    assert.equal((await worker.fetch(new Request(origin+path,{method}),env)).status,404,path);
  }
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
