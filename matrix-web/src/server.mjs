import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase } from './db.mjs';
import { clientIpResolver } from './client-ip.mjs';
import { createRecords } from './records.mjs';
import { authenticate, verifyPassword, hashPassword, createSession, csrfFor, digest, audit, fail, checkOrigin, checkCsrf } from './auth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const prefix = '/api/v1';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8' };
const dummyHash = 'scrypt$32768$8$1$00112233445566778899aabbccddeeff$' + '00'.repeat(64);
const writeMethods = new Set(['POST', 'PUT', 'DELETE']);
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function json(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ data }));
}
function cookie(res, token, secure, clear = false) {
  res.setHeader('Set-Cookie', 'matrix_session=' + (clear ? '' : token) +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (clear ? '0' : '604800') + (secure ? '; Secure' : ''));
}
async function body(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json'))
    throw fail(415, 'CONTENT_TYPE', '请使用 application/json');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) throw fail(413, 'BODY_TOO_LARGE', '提交内容超过 256KB');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'INVALID_JSON', 'JSON 格式无效'); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw fail(400, 'INVALID_JSON', '请求内容应为 JSON 对象');
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function admin(actor) {
  if (actor.kind !== 'session') throw fail(403, 'FORBIDDEN', '此操作仅限网站管理员');
}
function csv(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function createApplication({ db, origin = 'http://localhost:3000', secureCookies = origin.startsWith('https:'), trustedProxies = '' } = {}) {
  if (!db) throw new Error('Database required');
  const originUrl = new URL(origin);
  if (!['http:','https:'].includes(originUrl.protocol) || originUrl.origin !== origin)
    throw new Error('SITE_ORIGIN must be an exact HTTP(S) origin without a path');
  const records = createRecords(db);
  const clientIp = clientIpResolver(trustedProxies);
  const server = createServer(async (req, res) => {
    headers(res);
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const method = req.method;
      if (method === 'GET' && path === '/health') return json(res, { status:'ok', application:'haoduoyu-matrix' });
      if (method === 'GET' && path === '/api-docs') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>好多鱼图文 · AI 接入文档</title><link rel="stylesheet" href="/style.css"><body><main class="docs-page"><h1>好多鱼图文 · AI 接入</h1><p>经营数据需要账号密码或独立授权凭证。此页面不包含任何经营数据。</p><p>基础路径：<code>/api/v1</code>。机器人使用 <code>Authorization: Bearer &lt;token&gt;</code>；写入时提供 <code>Idempotency-Key</code>，保存后按返回编号读回确认。</p><p>网站管理员在「AI 接入」中创建凭证，限定账号和读写权限。每次复盘保留数据时间与来源；累计快照与每日发生量分别提交。</p><p><a href="/openapi.json">完整 OpenAPI 规范</a> · <a href="/">返回登录</a></p><h2>接口</h2><ul><li>GET /accounts：列出授权账号</li><li>GET /articles：检索已发布文章</li><li>POST /articles：登记成功发布文章</li><li>POST /observations：追加累计复盘快照</li><li>POST /daily-metrics：回填按日发生量</li><li>GET /dashboard：读取账号汇总</li></ul><p>相同幂等键不同内容返回 409；更新文章时附带当前 version。没有取得的数据请留空，不要填零。最近三天按北京时间今天及前两天计算，今天尚未完结。</p></main></body></html>');
      }
      if (path.startsWith(prefix + '/')) {
        const route = path.slice(prefix.length);
        if (route === '/auth/login' && method === 'POST') {
          checkOrigin(req, origin);
          const input = await body(req);
          if (typeof input.username !== 'string' || input.username.length > 80 ||
              typeof input.password !== 'string' || input.password.length > 256)
            throw fail(401, 'INVALID_CREDENTIALS', '账号或密码错误');
          const ip = clientIp(req);
          const bucket = digest(ip + ':' + input.username);
          const now = Date.now(), windowStart = now - 900000;
          db.prepare('DELETE FROM login_attempts WHERE window_start<?').run(windowStart);
          const peerBucket = 'ip:' + digest(ip);
          const peerAttempt = db.prepare('SELECT attempts FROM login_attempts WHERE bucket=?').get(peerBucket);
          if (peerAttempt?.attempts >= 100) { res.setHeader('Retry-After','900'); throw fail(429,'RATE_LIMITED','尝试次数过多，请稍后再试'); }
          db.prepare('INSERT INTO login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').run(peerBucket, now);
          const attempt = db.prepare('SELECT attempts FROM login_attempts WHERE bucket=?').get(bucket);
          if (attempt?.attempts >= 10) { res.setHeader('Retry-After','900'); throw fail(429,'RATE_LIMITED','尝试次数过多，请稍后再试'); }
          db.prepare('INSERT INTO login_attempts(bucket,attempts,window_start) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').run(bucket, now);
          const user = db.prepare('SELECT * FROM users WHERE username=?').get(input.username);
          const valid = await verifyPassword(input.password, user?.password_hash || dummyHash);
          if (!user || !valid) throw fail(401, 'INVALID_CREDENTIALS', '账号或密码错误');
          let token;
          db.exec('BEGIN IMMEDIATE');
          try {
            // scrypt yields; a password change may have invalidated this proof meanwhile.
            const current = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
            if (current?.password_hash !== user.password_hash) throw fail(401, 'INVALID_CREDENTIALS', '账号或密码错误');
            db.prepare('DELETE FROM login_attempts WHERE bucket=?').run(bucket);
            token = createSession(db, user.id);
            audit(db, 'user:' + user.id, 'auth.login');
            db.exec('COMMIT');
          } catch (e) { db.exec('ROLLBACK'); throw e; }
          cookie(res, token, secureCookies);
          return json(res, { username:user.username, csrfToken:csrfFor(token) });
        }
        const actor = authenticate(db, req);
        const writing = writeMethods.has(method);
        if (!actor.permissions.includes(writing ? 'write' : 'read'))
          throw fail(403, 'FORBIDDEN', '此凭证没有所需的读写权限');
        if (writing) checkCsrf(req, actor, origin);
        if (route === '/auth/me' && method === 'GET') {
          admin(actor);
          return json(res, { username:actor.username, csrfToken:csrfFor(actor.token) });
        }
        if (route === '/auth/logout' && method === 'POST') {
          admin(actor); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(actor.token));
          cookie(res, '', secureCookies, true); return json(res, { logged_out:true });
        }
        if (route === '/auth/password' && method === 'PUT') {
          admin(actor); const input = await body(req);
          const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(actor.id);
          if (!await verifyPassword(input.currentPassword, user.password_hash)) throw fail(403,'INVALID_CREDENTIALS','当前密码错误');
          const passwordHash = await hashPassword(input.newPassword);
          db.exec('BEGIN IMMEDIATE');
          try {
            const changed = db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(passwordHash, actor.id, user.password_hash);
            if (!changed.changes) throw fail(409,'CONFLICT','密码已修改，请重新登录');
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(actor.id);
            audit(db, actor.actor, 'auth.password_changed'); db.exec('COMMIT');
          } catch (e) { db.exec('ROLLBACK'); throw e; }
          cookie(res, '', secureCookies, true); return json(res, { changed:true, login_required:true });
        }
        if (route === '/api-keys') {
          admin(actor);
          if (method === 'GET') return json(res, db.prepare('SELECT id,name,account_ids_json,permissions_json,created_at,revoked_at,last_used_at FROM api_keys ORDER BY created_at DESC').all()
            .map(({account_ids_json,permissions_json,...r})=>({...r,account_ids:JSON.parse(account_ids_json),permissions:JSON.parse(permissions_json)})));
          if (method === 'POST') {
            const input = await body(req);
            if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 ||
                !Array.isArray(input.account_ids) || input.account_ids.length < 1 || input.account_ids.length > 100 ||
                !Array.isArray(input.permissions) || !input.permissions.length ||
                input.permissions.some(p=>!['read','write'].includes(p))) throw fail(400,'VALIDATION','请填写名称、授权账号和读写权限');
            const ids = [...new Set(input.account_ids)];
            if (ids.some(id=>typeof id!=='string' || !db.prepare('SELECT id FROM accounts WHERE id=?').get(id))) throw fail(400,'VALIDATION','授权账号不存在');
            const id = randomUUID(), token = 'hdy_' + randomBytes(32).toString('hex'), created = new Date().toISOString();
            db.exec('BEGIN IMMEDIATE');
            try {
              db.prepare('INSERT INTO api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at) VALUES(?,?,?,?,?,?)')
                .run(id,input.name.trim(),digest(token),JSON.stringify(ids),JSON.stringify([...new Set(input.permissions)]),created);
              audit(db,actor.actor,'api_key.created',id,{account_ids:ids,permissions:input.permissions}); db.exec('COMMIT');
            } catch (e) { db.exec('ROLLBACK'); throw e; }
            return json(res,{id,name:input.name.trim(),token,account_ids:ids,permissions:[...new Set(input.permissions)],created_at:created},201);
          }
        }
        const keyMatch = /^\/api-keys\/([^/]+)$/.exec(route);
        if (keyMatch && method === 'DELETE') {
          admin(actor);
          const result = db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(new Date().toISOString(),keyMatch[1]);
          if (!result.changes) throw fail(404,'NOT_FOUND','凭证不存在或已撤销');
          audit(db,actor.actor,'api_key.revoked',keyMatch[1]);
          return json(res,{revoked:true});
        }
        if (route === '/audit' && method === 'GET') {
          admin(actor);
          return json(res,db.prepare('SELECT * FROM audit ORDER BY created_at DESC,rowid DESC LIMIT 200').all().map(({detail_json,...r})=>({...r,detail:JSON.parse(detail_json)})));
        }
        if (route === '/export' && method === 'GET') {
          admin(actor);
          const rows = records.listArticles({},null);
          const cols = ['id','account_name','platform','title','url','published_at','started_at','duration_seconds','production_mode','summary','notes'];
          const content = '\uFEFF' + [cols.map(csv).join(','),...rows.map(row=>cols.map(col=>csv(row[col])).join(','))].join('\r\n');
          res.setHeader('Content-Type','text/csv; charset=utf-8');
          res.setHeader('Content-Disposition','attachment; filename="haoduoyu-articles.csv"'); return res.end(content);
        }
        const query = Object.fromEntries(url.searchParams);
        const articleMatch = /^\/articles\/([^/]+)$/.exec(route);
        const accountMatch = /^\/accounts\/([^/]+)$/.exec(route);
        if (method === 'GET') {
          if (route === '/accounts') return json(res,records.listAccounts(actor.scope));
          if (route === '/articles') return json(res,records.listArticles(query,actor.scope));
          if (articleMatch) return json(res,records.getArticle(articleMatch[1],actor.scope));
          if (route === '/observations') return json(res,records.listObservations(query,actor.scope));
          if (route === '/daily-metrics') return json(res,records.listDaily(query,actor.scope));
          if (route === '/dashboard') return json(res,records.dashboard(query.account_id || null,actor.scope));
        }
        let action;
        if (method === 'POST' && route === '/accounts') { admin(actor); action = b=>records.createAccount(b); }
        if (method === 'PUT' && accountMatch) { admin(actor); action = b=>records.updateAccount(accountMatch[1],b); }
        if (method === 'POST' && route === '/articles') action = b=>records.createArticle(b,actor.scope);
        if (method === 'PUT' && articleMatch) action = b=>records.updateArticle(articleMatch[1],b,actor.scope);
        if (method === 'POST' && route === '/observations') action = b=>records.createObservation(b,actor.scope);
        if (method === 'POST' && route === '/daily-metrics') action = b=>records.upsertDaily(b,actor.scope);
        if (action) {
          const input = await body(req), idempotencyKey = req.headers['idempotency-key'];
          if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(idempotencyKey)))
            throw fail(400,'VALIDATION','Idempotency-Key 格式无效');
          const requestHash = digest(method + ':' + path + ':' + JSON.stringify(stable(input)));
          db.exec('BEGIN IMMEDIATE');
          let result, status = method === 'POST' ? 201 : 200;
          try {
            if (idempotencyKey) {
              const saved = db.prepare('SELECT * FROM idempotency WHERE actor=? AND key=?').get(actor.actor,idempotencyKey);
              if (saved) {
                if (saved.request_hash !== requestHash) throw fail(409,'IDEMPOTENCY_CONFLICT','同一幂等键已经用于不同内容');
                db.exec('COMMIT'); return json(res,JSON.parse(saved.response_json),saved.status);
              }
            }
            result = action(input);
            audit(db,actor.actor,method + ' ' + route,result?.id || null,{fields:Object.keys(input)});
            if (idempotencyKey) db.prepare('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,?,?)')
              .run(actor.actor,idempotencyKey,requestHash,JSON.stringify(result),status,new Date().toISOString());
            db.exec('COMMIT');
          } catch (e) { db.exec('ROLLBACK'); throw e; }
          return json(res,result,status);
        }
        throw fail(404,'NOT_FOUND','接口不存在');
      }
      if (method !== 'GET' && method !== 'HEAD') throw fail(404,'NOT_FOUND','页面不存在');
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw fail(400,'VALIDATION','地址格式无效'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(p=>p.startsWith('.')))
        throw fail(404,'NOT_FOUND','文件不存在');
      const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
      // Explicit allowlist: never expose runtime state, source, dotfiles or the database.
      if (!['index.html','app.js','style.css','openapi.json','favicon.svg','robots.txt','llms.txt'].includes(relative))
        throw fail(404,'NOT_FOUND','文件不存在');
      const content = await readFile(resolve(publicRoot,relative));
      res.setHeader('Content-Type',mime[extname(relative)] || 'application/octet-stream');
      res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      let status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      let code = error.status ? error.code || 'VALIDATION' : 'INTERNAL_ERROR';
      let message = error.status ? error.message : status === 404 ? '页面不存在' : '服务暂时不可用';
      if (String(error.code || '').startsWith('ERR_SQLITE') && /UNIQUE constraint failed/.test(error.message)) {
        status = 409; code = 'DUPLICATE'; message = '记录已存在，请检索后更新原记录';
      }
      if (!res.headersSent) {
        res.statusCode = status;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.end(JSON.stringify({error:{code,message}}));
      } else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const origin = process.env.SITE_ORIGIN || 'http://localhost:' + port;
  if (process.env.NODE_ENV === 'production' && !process.env.SITE_ORIGIN?.startsWith('https://'))
    throw new Error('Production requires an HTTPS SITE_ORIGIN');
  const db = openDatabase();
  const server = createApplication({db,origin,secureCookies:process.env.NODE_ENV === 'production' || origin.startsWith('https:'),trustedProxies:process.env.TRUSTED_PROXIES || ''});
  server.listen(port,host,()=>console.log('好多鱼图文服务已启动，监听 ' + host + ':' + port));
  const stop = () => server.close(()=>{db.close();process.exit(0);});
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
}
