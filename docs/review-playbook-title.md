# 规则手册显示名称

规则页面使用活动手册 `content_md` 中、首个二级标题之前的第一个 Markdown 一级标题作为显示名称；没有一级标题时回退为“规则手册”与版本号。现有正文、规则、日期和版本不因显示名称改变而被改写。

要更改名称，先按账号读取活动手册的 `id`、完整 `content_md` 和 `content_hash`。保留其余正文，仅修改或添加一级标题，再以 `PATCH /api/v1/review/playbooks/{id}` 提交 `{"expected_hash":"<刚读取的 content_hash>","content_md":"<更新后的完整 Markdown>"}`。旧 hash 会返回冲突，需重新读取后处理；若写入结果不明，先 GET 核实再决定是否重试。

此操作沿用现有写入鉴权：owner 管理员会话及 CSRF，或已启用的同源公共业务写入规则；普通 bearer 凭据不会因此获得写入权限。
