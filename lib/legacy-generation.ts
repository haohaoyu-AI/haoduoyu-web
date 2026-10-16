export const retiredGenerationNames = new Set([
 'generate_claude_article', 'generate_claude_test_article',
 'retry_claude_test_article_once', 'retry_claude_test_article_14000',
 'generate_claude_rewrite_v2', 'retry_claude_rewrite_v2',
]);
export const legacyGenerationNotice = {
 state: 'retired', code: 'short_connection_generation_disabled',
 message: '旧短连接写文入口已停用，不会发起模型请求。请读取历史结果；新写作使用服务器长连接表单。',
 read_only: true, model_request_sent: false, automatic_retry: false,
 history_path: '/writing/rewrite-v2',
 supported_generation_paths: ['/writing/daily-run', '/writing/stepwise-text-run'],
} as const;
