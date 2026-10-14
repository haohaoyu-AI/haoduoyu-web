# 得到页面：原 pending 任务的明确恢复入口

基线：`90631880e59b15c059f3668c70a7c67c296ab446`。独立工作树：`/workspace/sites/haoduoyu-dedao-pending-ui-recovery`。本轮仅修改 `app/dedao/page.tsx`、新增 `tests/dedao-cloud-pending-ui-recovery.mjs` 与本说明；仅父级整合，不 push 或部署。

## 修复

原 POST 写入 queued/pending 后返回409，fallback GET 读到同一请求。GET 会清本地恢复指针和错误，而主按钮被活动任务门禁禁用；刷新页面也没有能调用已修复后端的入口。

现在已核验本人视图中的 queued/pending 任务，且 `writing_executor_registered === false`、原 request_key 为有效 UUID 时，主按钮显示“恢复本篇成文”。双连接未就绪或有待处理读取错误时按钮禁用。点击只使用这份任务的原 request_key 和本人 owner_scope；不生成新 key，不让可选本地指针覆盖服务器任务 key。

恢复不依赖 sessionStorage 指针，已读回的原任务就是入口依据。没有明确点击时，轮询、focus 和 visibility 恢复仍只有 GET。原 POST 写锁、账号代际、读序号、认证清理和未知结果回读沿用；新增已接受视图引用，旧按钮闭包不能在同 owner 的更新状态后补派或另建请求。当前有效 POST/GET 失败时取消该引用确认，保留可见任务及原 key；成功 GET 后才重新确认。

sending/unknown/accepted、已登记执行者、缺少登记状态、writing/processing/completed、无效 key 均没有恢复入口。未知结果先 GET 核对；只有确实仍为同原任务 pending 才能再次明确点击恢复。未改后端 notify CAS、readiness、claim/reserve/consume、完成判定、平台权限或迁移。

## 精确离线验证

```sh
node --test --test-reporter=tap tests/dedao-cloud-pending-ui-recovery.mjs
node tests/offline-eight-interactions-ui.mjs
node tests/owner-scope-browser-mutations.mjs
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint app/dedao/page.tsx tests/dedao-cloud-pending-ui-recovery.mjs
git diff --check
```

专项执行实际页面 TSX 与原有受控 hooks/transport。初始基线30案：10通过、20失败。最终相同31案对 Git 90631880 原样页面源码复跑为10通过、21失败；修后31/31通过。覆盖409后同 key GET、刷新发现 pending、可选存储不可用、双击单 POST、不同本地指针不盖任务 key、保护状态、双连接断开、POST/GET 回执丢失与原任务重读、同 owner 晚状态/旧回调、跨 owner 晚到 GET/POST 200/401/403、认证与未知身份清理。

只读子审确认主恢复路径，并追加复现“双回执丢失后旧 handler 可再 POST”边界。增加/加强两个回归先得到0通过/2失败，再按建议清确认引用，最终31案全部通过。子审因根代理模型容量错误停止，未切模型或重试；最后边界按该建议实现并由专项验证，不能称最终提交已再次完整独审。

原交互19案、本人账号变更10案、typecheck、定向 lint 和 diff check 全部通过。另逐字节核对264个原 lib、云 API 与 drizzle 跟踪文件，与基线完全相同；没有迁移变更。

日志和结果位于 `/workspace/scratch/haoduoyu-three-review-20261014/cloud/`：`pending-ui-before.tap`、`pending-ui-baseline-final-suite.tap`、`pending-ui-stale-failure-before.tap`、`pending-ui-after.tap`、`existing-ui.log`、`owner-mutations.log`、`typecheck.log`、`targeted-lint.log`、`diff-check.log`、`invariant-bytes.log`、`results.json`。`baseline-source/app/dedao/page.tsx` 是 Git 90631880 原样字节，只用于同套测试复跑。正式独审原件位于同 scratch 下的 `independent-review/cloud/`，未覆盖。

这是实际源码的离线交互验证；不是 Chromium、真实生产接收者/执行者或平台草稿链验收。未操作生产、平台、订阅、日程或部署，未运行整站构建和全量历史套件。
