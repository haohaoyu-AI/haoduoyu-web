// Temporary smoke-test profile. It shares the existing run identity, quota and
// unresolved lock; it is not another execution endpoint or recovery path.
export const ARTICLE_COUNT_TASK='article_count_v1';
export const ARTICLE_COUNT_SCOPE='本站当前所有者的文章复盘库全部文章记录，包含所有账号和平台；每个唯一记录计一篇，不按标题去重，不计指标快照、竞品文章或旧图文生产库。';
export const ARTICLE_COUNT_INSTRUCTIONS='只做文章数量链路测试。输入 article_count 是网站数据库已统计的文章记录数。仅原样返回 JSON：{"article_count":该非负整数}。不要分析文章、查询历史、调用工具或添加建议。';
export const ARTICLE_COUNT_SCHEMA={type:'object',properties:{article_count:{type:'integer',minimum:0}},required:['article_count'],additionalProperties:false};
export const articleCountProfile=()=>({id:ARTICLE_COUNT_TASK,instructions:ARTICLE_COUNT_INSTRUCTIONS,scope:ARTICLE_COUNT_SCOPE,provider_call_limit:1,max_output_tokens:1024});
export async function captureArticleCount(store,owner) {
  const row=await store.get('SELECT count(*) AS n FROM matrix_review_articles WHERE user_id=?',owner);
  if(!Number.isSafeInteger(row?.n)||row.n<0)throw new Error('Invalid article count');
  return {task:ARTICLE_COUNT_TASK,article_count:row.n,scope:ARTICLE_COUNT_SCOPE};
}
export function articleCountTask(row) {
  try {return JSON.parse(row.input_json)?.task===ARTICLE_COUNT_TASK;}
  catch {return false;}
}
export function validateArticleCount(output,input) {
  if(!output||Object.keys(output).join(',')!=='article_count'||!Number.isSafeInteger(output.article_count)||
    output.article_count<0||output.article_count!==input.article_count)return null;
  return {article_count:output.article_count,
    report_markdown:`本站文章复盘库共有 ${output.article_count} 篇文章。\n\n统计口径：${ARTICLE_COUNT_SCOPE}\n\n数据库负责计数，API 已返回同一数量并通过校验。本次只测试按钮、API 与结果展示链路，未分析文章内容。`,
    cumulative_summary:null,pending_verification:[]};
}
