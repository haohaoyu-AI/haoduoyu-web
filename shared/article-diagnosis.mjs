import {finiteNumber, recentArticles} from './review-analytics.mjs';

export const ARTICLE_DIAGNOSIS_KEY = 'article_diagnosis';
export const ARTICLE_DIAGNOSIS_PROMPT = [
  '你是头条图文数据复盘助手。只根据我给你的这一篇数据，和同账号最近30篇的平均值做对比，写且只写三句话，不要标题、不要列表、不要开头客套。',
  '第一句：这篇好在哪，必须点出明显高于均值的指标，并带上这篇的数字和均值。',
  '第二句：这篇差在哪，必须点出明显低于均值的指标，并带上这篇的数字和均值。如果没有明显短板，就写最接近均值、提升空间最大的一项。',
  '第三句：下一篇同类稿的标题或开头怎么改，只给一个具体改法，不要空话。',
  '只谈标题、展现、阅读、点击率、完读率，不要编造未提供的数据，不要评价正文内容。',
].join('\n');

const aliases = new Map([
  ['整体','global'],['global','global'],['头条','toutiao'],['toutiao','toutiao'],
  ['V字','vzi'],['vzi','vzi'],['鱼见','yujian'],['yujian','yujian'],['公众号','wechat'],['wechat','wechat'],
]);
const scopeOf = value => aliases.get(String(value || '')) || String(value || '');
export function diagnosisScopes(account) {
  const scope = scopeOf(account);
  if (scope === 'vzi' || scope === 'yujian') return ['global','toutiao',scope];
  if (scope === 'wechat') return ['wechat'];
  return scope === 'global' ? ['global'] : ['global',scope];
}
function versionOf(row) {
  const value = Number(row?.version);
  return Number.isSafeInteger(value) ? value : 0;
}
export function selectDiagnosisPrompt(prompts, account) {
  const scopes = diagnosisScopes(account);
  const rows = (Array.isArray(prompts) ? prompts : []).filter(row => row && row.prompt_key === ARTICLE_DIAGNOSIS_KEY &&
    row.status === 'active' && scopes.includes(row.scope) && String(row.content_md || '').trim());
  rows.sort((a,b) => scopes.indexOf(b.scope) - scopes.indexOf(a.scope) || versionOf(b) - versionOf(a) ||
    String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rows[0] || null;
}
export function diagnosisPromptText(prompts, account) {
  return selectDiagnosisPrompt(prompts, account)?.content_md?.trim() || ARTICLE_DIAGNOSIS_PROMPT;
}
export function latestDiagnosisSnapshot(snapshots, articleId) {
  const rows = (snapshots || []).filter(row => row && String(row.article_id) === String(articleId));
  rows.sort((a,b) => String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || '')) ||
    (Number(b.age_hours) || 0) - (Number(a.age_hours) || 0) || String(b.id || '').localeCompare(String(a.id || '')));
  return rows[0] || null;
}
function metricValue(snapshot, key) {
  if (!snapshot) return null;
  const value = finiteNumber(snapshot[key]);
  return value === null || value < 0 ? null : value;
}
function formatFact(value) {
  return value === null ? '未提供' : String(Math.round(value * 100) / 100);
}
const FIELDS = [['展现','impressions'],['阅读','reads'],['点击率','ctr'],['完读率','completion_rate']];
export function articleDiagnosisFacts(data, article) {
  const peers = (data.articles || []).filter(row => row && row.account === article.account && String(row.id) !== String(article.id))
    .sort(recentArticles).slice(0,30);
  const current = latestDiagnosisSnapshot(data.snapshots, article.id);
  const metrics = {};
  const lines = ['标题：' + (String(article.title || '').trim() || '（无标题）')];
  for (const [label,key] of FIELDS) {
    const samples = peers.map(row => metricValue(latestDiagnosisSnapshot(data.snapshots, row.id), key)).filter(value => value !== null);
    const average = samples.length ? samples.reduce((sum,value) => sum + value, 0) / samples.length : null;
    const value = metricValue(current, key);
    metrics[key] = {value, average, samples:samples.length};
    lines.push(`${label}：${formatFact(value)}；同账号最近30篇平均：${formatFact(average)}（有效样本 ${samples.length}）`);
  }
  return {title:article.title || '', metrics, text:lines.join('\n')};
}
