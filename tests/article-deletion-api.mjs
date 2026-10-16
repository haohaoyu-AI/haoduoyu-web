import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('app/api/articles/[id]/delete/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ex = {};
const calls = [];
class ArticleDeletionError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
vm.runInNewContext(js, {
  exports: ex,
  require: name => name.endsWith('/test-store')
    ? { owner: request => request.headers.get('oai-authenticated-user-id') }
    : { ArticleDeletionError, deleteArticlePermanently: async (owner, args) => { calls.push({ owner, args }); return { article_id: args.article_id, deleted: true }; } },
  Response, Request, URL, TextEncoder, JSON,
});

const id = 'bf193e00-c221-4032-807f-f6e9e3bc9b38';
const payload = JSON.stringify({ article_id: id, confirm_article_id: id, confirm_title: 'exact title', confirm_permanent: true });
const send = (body = payload, headers = {}, pathId = id) => ex.POST(new Request(`https://site.test/api/articles/${pathId}/delete`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test', 'x-xiaoyu-upload': '1', 'oai-authenticated-user-id': 'owner-a', ...headers }, body,
}), { params: Promise.resolve({ id: pathId }) });

assert.equal((await send(payload, { 'oai-authenticated-user-id': '' })).status, 401);
assert.equal((await send(payload, { origin: 'https://attacker.test' })).status, 403);
assert.equal((await send(payload, { 'x-xiaoyu-upload': '' })).status, 403);
const mismatch = JSON.stringify({ article_id: '0d84a0a2-96ae-43ee-9700-427925a4725a', confirm_article_id: id, confirm_title: 'exact title', confirm_permanent: true });
assert.equal((await send(mismatch)).status, 400);
const success = await send();
assert.equal(success.status, 200);
assert.equal((await success.json()).deleted, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].owner, 'owner-a');
assert.equal(calls[0].args.confirm_article_id, id);
console.log('Deletion API enforces signed-in owner, same-origin/custom-header checks, URL/body target equality, and forwards exact owner confirmation');
