const section=`<h2>公开业务模式（由站长显式启用）</h2><p>先读取 <code>GET /api/v1/auth/me</code>：返回 <code>publicBusiness: true</code> 时，已选定的业务数据无需登录即可读写，不会返回密码、密钥或登录令牌。浏览器直接进入业务工作台，私人待办仅使用站长明确指定的所属用户，不合并其他用户。</p>
<p>公开写入必须携带与网站完全一致的 <code>Origin</code>、<code>X-Public-Business: 1</code> 及 JSON 内容类型；不开放跨来源浏览器写入。每次写入最多 16KB。既有业务路径和字段保持兼容。敏感的密码、密钥管理、审计和原始备份仍要求原认证。静态 OpenAPI 描述保留原认证模式；公开模式以本段补充说明为准。</p>
<p>公开模式另支持 <code>DELETE /articles/{id}</code>，请求体为当前 <code>{"version":1}</code>，同时删除该文章的快照和每日数据；<code>DELETE /observations/{id}</code> 需当前 <code>{"created_at":"原值"}</code>；<code>DELETE /daily-metrics/{id}</code> 需当前 <code>{"updated_at":"原值"}</code>；<code>DELETE /accounts/{id}</code> 需 <code>{"id":"同一账号ID"}</code>，有业务记录的账号必须先清理或停用。待办、模板及恢复接口保留原有版本校验。所有访客均可改删公开范围内的数据。</p>
`;

export function publicBusinessDocs(original) {
  return original.replace('经营数据需要账号密码或独立授权凭证。','已选业务数据公开可读写；敏感管理功能仍需要认证。')
    .replace('<h2>接口</h2>',section+'<h2>接口</h2>').replace('返回登录','返回网站');
}
