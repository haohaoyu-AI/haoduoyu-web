# 磨砂视觉与匿名编辑整合

独立分支 `opt/glass-public-notes-integration` 合并两个明确输入：磨砂视觉 `6565d3cc5f9e8d7ae01702bf2ff9176c7a933da3` 与匿名 notes/memos 权限 `a787527fe93c7090046c5d4e855416b04a29aede`。未引入其他视觉 WIP。本任务只推送代码，不创建 PR、GitHub 合并或部署。

## 保留边界与冲突

视觉分支的 `public/glass.css`、`public/style.css`、`public/memos.css`、`public/index.html`、静态资源登记和原视觉资产保持原字节。所有 `web/` 和相关 notes/memos 后端实现保持权限分支的原字节，匿名编辑不退回所有者登录。

唯一人工冲突是 `tests/snapshot-integration.test.mjs`：保留磨砂分支精确 HTML/构建资源登记证明，同时先剥离已批准的前后端权限增量，再核对快照原实现；匿名 can_edit=true 的新授权断言保留。未放宽任意源码变化，也保留快照不读取 memo 存储的 SQL 断言。

bundle 从合并源码重新生成，`.ci/public-assets.json` 重新计算十个静态资源哈希；不直接选择任一旧包。

## 权限与配置零变更

匿名业务仍按明确 `DAILY_NOTES_OWNER_ID` / `MEMOS_OWNER_ID` 固定归属，不能由任意 user 参数或 todo owner 改写。Origin、固定公开写 header、限流、CAS、保存收据和软删恢复保持；真实 owner session 的 CSRF 和授权优先，public actor 不拥有 admin 身份。管理、备份和密钥不公开，todo/文章/快照现状保留。

没有新增/修改配置、DB 迁移、凭据或 Cron；`.openai`、runtime、Cloudflare 配置生成器、db/drizzle、安全和 storage 均保留原输入。部署沿用既有 `PUBLIC_BUSINESS_MODE=1` 及两个已有 owner UUID 和全部其他生产绑定，不扩大配置授权。未读取或修改任何生产数据。

回退仅切回上一 Worker/资源及原配置；不操作 SQL，不重放旧迁移、不删除表。回退到旧权限包会收回匿名编辑，但保留已保存的数据。原未经匿名授权的视觉包不能冒充此次完整整合包。

## 实际证据

权限分支历史结果仍为首轮完整702/706，修正旧权限断言后定向6/6；不是706全绿。本次整合另做唯一一次完整本地检查，精确结果由最终交付回复及本地日志提供，不重跑无关检查。

整合定向源码/快照证明13/13通过。本地桌面1440和手机375匿名真实新增、编辑、软删恢复通过，匿名备份401；默认todo、文章页、只读快照及磨砂CSS token最小smoke通过，页面异常及外联0。只使用合成临时D1；[报告与精确资源哈希](glass-public-notes-integration-evidence/report.json)、[桌面截图](glass-public-notes-integration-evidence/anonymous-1440.png)、[手机截图](glass-public-notes-integration-evidence/anonymous-375.png)。旧视觉及权限证据保持原样。

远程 Actions 曾返回 Forbidden，本轮未重试或换路线，状态未知。父级按最终整合提交与 Worker 字节哈希统一发布；本说明不是已上线证明。
