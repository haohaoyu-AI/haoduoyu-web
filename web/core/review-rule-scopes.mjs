const aliases = new Map([
  ['整体','global'],['global','global'],['头条','toutiao'],['toutiao','toutiao'],
  ['V字','vzi'],['vzi','vzi'],['鱼见','yujian'],['yujian','yujian'],['公众号','wechat'],['wechat','wechat'],
]);
export const scopeOf = value => aliases.get(String(value || '')) || String(value || '');
const labels = new Map([
  ['global','整体规则'],['toutiao','头条平台规则'],['vzi','V字账号规则'],['yujian','鱼见账号规则'],['wechat','公众号平台规则'],
]);
export const scopeLabel = scope => labels.get(scope) || scope;
export function applicableScopes(account) {
  const scope = scopeOf(account);
  if (['vzi','yujian'].includes(scope)) return ['global','toutiao',scope];
  if (scope === 'wechat') return ['wechat'];
  return scope === 'global' ? ['global'] : ['global',scope];
}
function newest(a,b) {
  return String(b.version ?? '').localeCompare(String(a.version ?? ''),undefined,{numeric:true}) ||
    String(b.published_on || b.updated_at || '').localeCompare(String(a.published_on || a.updated_at || '')) || String(b.id).localeCompare(String(a.id));
}
export function currentPlaybooks(books = [],account) {
  const latest = new Map(), scopes = applicableScopes(account);
  for (const book of [...books].filter(book => book.status === 'active').sort(newest)) {
    const scope = scopeOf(book.account);
    if (!latest.has(scope)) latest.set(scope,book);
  }
  const current = [...latest.values()].map(book => ({...book,
    rules:(book.rules || []).filter(rule => scopes.includes(scopeOf(rule.scope ?? book.account)))}))
    .filter(book => scopes.includes(scopeOf(book.account)) || book.rules.length);
  return resolveRuleOverrides(current,account);
}
/** Derived view only: never mutate stored rules or collapse same-layer duplicates. */
export function resolveRuleOverrides(books,account) {
  const scopes = applicableScopes(account), occurrences = new Map();
  for (const book of books) for (const rule of book.rules) {
    const scope = scopeOf(rule.scope ?? book.account);
    if (typeof rule.rule_id !== 'string' || !rule.rule_id || !scopes.includes(scope)) continue;
    if (!occurrences.has(rule.rule_id)) occurrences.set(rule.rule_id,new Set());
    occurrences.get(rule.rule_id).add(scope);
  }
  return books.map(book => ({...book,rules:book.rules.map(rule => {
    const scope = scopeOf(rule.scope ?? book.account);
    const seen = occurrences.get(rule.rule_id) || new Set();
    const winner = scopes.findLast(layer => seen.has(layer));
    const overriddenByScope = scopes.indexOf(winner) > scopes.indexOf(scope) ? winner : '';
    const overridesScopes = overriddenByScope ? [] : scopes.filter(layer => seen.has(layer) && scopes.indexOf(layer) < scopes.indexOf(scope));
    return {...rule,overriddenByScope,overridesScopes};
  })}));
}
export function ruleCountLabel(rules) {
  const overridden = rules.filter(rule => rule.overriddenByScope).length;
  return `${rules.length} 条规则 · ${rules.length-overridden} 条当前生效${overridden ? ` · ${overridden} 条被覆盖` : ''}`;
}
export function currentPrompts(prompts = [],account) {
  const scopes = applicableScopes(account), latest = new Map();
  for (const prompt of [...prompts].filter(prompt => prompt.status === 'active' && scopes.includes(prompt.scope)).sort(newest)) {
    const key = `${prompt.scope}:${prompt.prompt_key}`;
    if (!latest.has(key)) latest.set(key,prompt);
  }
  return [...latest.values()].sort((a,b) => scopes.indexOf(a.scope)-scopes.indexOf(b.scope) || String(a.prompt_key).localeCompare(String(b.prompt_key)));
}
