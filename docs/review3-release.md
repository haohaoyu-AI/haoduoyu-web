# Review3 BOT迁移说明

先部署数据库新增nullable列和配套API，再启用三个视图：overview、articles、playbook。保留旧UUID PUT、offset/read_revision、expected_hash及删除收据/墓碑；无需为公开复盘新增Bearer。公开写请求仍带站点同源Origin、X-Public-Business:1和JSON Content-Type。

BOT每篇登记实际playbook_version_used和applied_rule_ids；未知为null，不追填最新法典。[]代表明确没有使用规则。每次采集登记真实age_hours和source(toutiao_excel/manual)，未知为null。禁止按snapshot_date猜年龄或把旧22份缺年龄快照当24h样本；0是已知值，不能填补未知。

新增POST articles必须持久保存调用者UUID id，重试原id/原完整体；数字PUT playbooks/{version}也必须有稳定id及匹配version。旧UUID PUT体仍不传id。规则PATCH必须传account、playbook_id、该法典最新expected_hash和操作save_id，只能改status/evidence/support_ids/counter_ids/trials。保留精确请求用于收据重放，冲突先读回核对。

daily复盘最多两句；停止新建three_day，保留历史读取。>=10有效样本才按最近30篇q80/q30判定；不足10篇的固定阈值判定必须标记reliable:false。分析按上海发布周计算，不用采集日冒充发布日期。查看/api-docs和/openapi.json取得完整字段及响应。

上线后读回核验：旧内容hash未因null列或candidate展示默认值改变；缺年龄样本仍为未知；文章详情返回snapshots/applied_rules；page/verdict先筛选后分页；总览率变化显示百分点。不得向生产写入文档示例或虚构证据。
