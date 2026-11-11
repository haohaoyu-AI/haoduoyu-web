import {bodyFor,digest,fail} from './security.mjs';
import {storeFor} from './storage.mjs';
import {reviewUuid} from './content-review-validation.mjs';
import {openaiReviewSettings} from './openai-review.mjs';
import {beijingDay} from './lib/time.mjs';
import {ARTICLE_DIAGNOSIS_KEY,articleDiagnosisFacts,diagnosisPromptText,selectDiagnosisPrompt} from '../shared/article-diagnosis.mjs';

const routePattern = /^\/review\/articles\/([^/]+)\/diagnosis$/;
const json = (data,status = 200) => Response.json({data},{status,headers:{'Cache-Control':'no-store'}});
const table = 'matrix_review_article_diagnoses';
export const isArticleDiagnosisRoute = route => routePattern.test(route || '');
function articleId(route) {
  const id = routePattern.exec(route)?.[1] || '';
  if (!reviewUuid.test(id)) throw fail(404,'NOT_FOUND','文章诊断接口不存在');
  return id;
}
function missingTable(error) {
  return /no such table/i.test(String(error?.message || error));
}
async function row(db, sql, ...args) {
  try { return await db.prepare(sql).bind(...args).first(); }
  catch (error) { if (missingTable(error)) throw fail(503,'DIAGNOSIS_UNAVAILABLE','诊断结果表尚未建立，未调用 API'); throw error; }
}
async function rows(db, sql, ...args) {
  try { return (await db.prepare(sql).bind(...args).all()).results; }
  catch (error) { if (missingTable(error)) throw fail(503,'DIAGNOSIS_UNAVAILABLE','诊断结果表尚未建立，未调用 API'); throw error; }
}
function view(article, saved) {
  return {article_id:article, result_text:saved?.result_text || null, created_at:saved?.created_at || null};
}
async function articleFor(db, owner, id) {
  const article = await row(db, 'SELECT id,account,title,published_at FROM matrix_review_articles WHERE user_id=? AND id=?', owner, id);
  if (!article) throw fail(404,'NOT_FOUND','文章不存在');
  return article;
}
async function savedDiagnosis(db, owner, id) {
  return row(db, `SELECT article_id,result_text,created_at FROM ${table} WHERE user_id=? AND article_id=?`, owner, id);
}
async function accountEvidence(db, owner, account) {
  const articles = await rows(db, 'SELECT id,account,title,published_at FROM matrix_review_articles WHERE user_id=? AND account=?', owner, account);
  const snapshots = await rows(db,
    `SELECT s.id,s.article_id,s.snapshot_date,s.age_hours,s.impressions,s.reads,s.ctr,s.completion_rate
     FROM matrix_review_snapshots s JOIN matrix_review_articles a ON a.user_id=s.user_id AND a.id=s.article_id
     WHERE s.user_id=? AND a.account=?`, owner, account);
  const prompts = await rows(db,
    `SELECT id,prompt_key,scope,version,status,title,content_md,updated_at FROM matrix_review_prompt_versions
     WHERE user_id=? AND prompt_key=? AND status='active'`, owner, ARTICLE_DIAGNOSIS_KEY);
  return {articles, snapshots, prompts};
}
function outputText(data) {
  const output = Array.isArray(data?.output) ? data.output.filter(item => item?.type === 'message')
    .flatMap(item => Array.isArray(item.content) ? item.content : []).filter(item => item?.type === 'output_text')
    .map(item => typeof item.text === 'string' ? item.text : '').join('').trim() : '';
  return data?.status === 'completed' ? output.slice(0,2000) : '';
}
async function askModel(env, prompt, facts) {
  const settings = openaiReviewSettings(env);
  if (!settings.key || !settings.model) throw fail(503,'OPENAI_REVIEW_NOT_CONFIGURED','服务器尚未配置有效 API 密钥和模型，未调用 API');
  const provider = typeof env.ARTICLE_DIAGNOSIS_FETCH === 'function' ? env.ARTICLE_DIAGNOSIS_FETCH : fetch;
  let headers;
  try { headers = new Headers({Authorization:'Bearer ' + settings.key,'Content-Type':'application/json'}); }
  catch { throw fail(503,'OPENAI_REVIEW_INVALID_KEY_FORMAT','服务器密钥配置格式无效，未调用 API'); }
  const body = JSON.stringify({model:settings.model,store:false,max_output_tokens:500,
    input:[{role:'system',content:prompt},{role:'user',content:facts.text}]});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await provider('https://api.openai.com/v1/responses', {method:'POST',headers,body,redirect:'manual',signal:controller.signal});
    if (!response.ok) { await response.body?.cancel?.().catch(() => {}); throw fail(502,'DIAGNOSIS_FAILED','诊断没有完成，未保存结果'); }
    const payload = await response.json();
    const text = outputText(payload);
    if (!text || text.includes(settings.key)) throw fail(502,'DIAGNOSIS_FAILED','诊断没有完成，未保存结果');
    return text;
  } catch (error) {
    if (error?.status) throw error;
    throw fail(502,'DIAGNOSIS_FAILED','诊断没有完成，未保存结果');
  } finally { clearTimeout(timer); }
}
async function storeResult(db, owner, article, promptRow, prompt, facts, text) {
  const created = new Date().toISOString();
  const version = Number(promptRow?.version);
  const values = [owner, article.id, article.account, ARTICLE_DIAGNOSIS_KEY, Number.isSafeInteger(version) && version > 0 ? version : 0, digest(prompt), text,
    JSON.stringify(facts), created, beijingDay(Date.now())];
  const columns = 'user_id,article_id,account,prompt_key,prompt_version,prompt_hash,result_text,input_json,created_at,beijing_date';
  try {
    await db.prepare(`INSERT INTO ${table}(${columns}) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
  } catch (error) {
    const saved = await savedDiagnosis(db, owner, article.id);
    if (saved?.result_text) return saved;
    if (missingTable(error)) throw fail(503,'DIAGNOSIS_UNAVAILABLE','诊断结果表尚未建立，未调用 API');
    throw error;
  }
  return {result_text:text, created_at:created};
}
async function createDiagnosis(db, env, owner, article) {
  const saved = await savedDiagnosis(db, owner, article.id);
  if (saved?.result_text) return saved;
  const day = beijingDay(Date.now());
  const used = await row(db, `SELECT count(*) AS n FROM ${table} WHERE user_id=? AND beijing_date=? AND result_text<>''`, owner, day);
  if (Number(used?.n) >= 20) throw fail(429,'DIAGNOSIS_LIMIT','今天的新诊断次数已用完，已保存的结果仍可直接查看');
  const evidence = await accountEvidence(db, owner, article.account);
  const promptRow = selectDiagnosisPrompt(evidence.prompts, article.account);
  const prompt = diagnosisPromptText(evidence.prompts, article.account);
  const facts = articleDiagnosisFacts(evidence, article);
  const again = await savedDiagnosis(db, owner, article.id);
  if (again?.result_text) return again;
  const text = await askModel(env, prompt, facts);
  const winner = await savedDiagnosis(db, owner, article.id);
  if (winner?.result_text) return winner;
  return storeResult(db, owner, article, promptRow, prompt, facts, text);
}
export async function handleArticleDiagnosis({db,request,route,env,origin,owner,actorFor,writeLimit}) {
  const id = articleId(route), method = request.method, store = storeFor(db);
  if (new URL(request.url).search || !['GET','POST'].includes(method)) throw fail(404,'NOT_FOUND','文章诊断接口不存在');
  const actor = await actorFor(store, request, owner, env, origin, method === 'POST');
  if (method === 'POST') { await bodyFor(request); writeLimit(actor, owner); }
  const article = await articleFor(db, owner, id);
  const saved = method === 'GET' ? await savedDiagnosis(db, owner, id) : await createDiagnosis(db, env, owner, article);
  return json(view(article.id, saved));
}
