# V字复盘档案导入与对账

档案仅面向站点所有者的登录会话，写入仍检查同源及 CSRF。页面预览、批次、结果和对账均在私有档案接口下。原始表格、逐行正文、图地址和证据材料应保留在私有目录。通用审计只记录批次标识、页码和计数。

## 从来源表到档案字段

| 来源 | 批次类型 | 映射原则 |
| --- | --- | --- |
| 平台文章目录 | `directory` | 把实际平台编号作为文本写入 `refs[].platform_id`，引用类型为 `publication`。实际发布标题写入 `record.published_title`。仅在来源给出状态和时间时填写。 |
| 草稿清单 | `drafts` | 把实有草稿编号写入 `draft` 引用。原稿标题写入 `record.original_title`。可选的入箱时间和主草稿角色采用来源值。一个原稿有多个草稿编号时，可在同一行附多个引用。 |
| 历史指标表 | `metrics` | 用明确的站内 `item_id` 或发布编号找到已有的文章。每行必须有真实 `snapshot.observed_at`。展示、阅读、点击率和互动等来源提供的值分别进入 `snapshot.metrics`。已知零值写 0，未知可写 null 或留空。 |
| 已有复盘 | 所有者的 `GET /api/v1/review/archive/legacy` | 对照原 UUID 填 `record.legacy_id`，人工确认稿件类型后再选档案范围。已知原稿标题、样本与特定发布关联可继续沿用。关联后，旧日快照从原记录按原日期读取。 |

由来源明确给出的删除状态可归档为 `deleted`。清单里看不到一条内容，只产生未见对账项。旧日快照仅有日期时，档案展示真实日期并保留空的采集时刻。

## 本地 CSV 映射

将 XLSX 中实际需要的一张表手工导出为 UTF-8 CSV，再为真实表头配置映射。脚本在本机生成每页的规范化 JSON。运行时无网络请求，成功时无终端输出。输出目录必须是绝对路径且尚不存在，位于 Git 工作树和构建目录之外。输出目录权限为 0700，文件权限为 0600。

```sh
node scripts/review-archive-import-csv.mjs --csv /tmp/my-private/source.csv --mapping /tmp/my-private/mapping.json --output /tmp/my-private/pages
```

以下是合成历史指标列的配置。把列名替换为手头文件的确切表头。

```json
{
  "kind": "metrics",
  "source": "synthetic-metric-export",
  "scope": {
    "account": "V字",
    "platform": "toutiao",
    "kind": "article",
    "collected_at": "2026-11-10T09:00:00+08:00",
    "from": "2026-11-09",
    "to": "2026-11-09"
  },
  "mapping": {
    "references": [
      {
        "kind": "publication",
        "columns": { "platform_id": "编号列" }
      }
    ],
    "snapshot": {
      "observed_at": "真实采集时刻列",
      "metrics": {
        "reads": { "column": "阅读列", "format": "grouped-number" },
        "ctr": { "column": "点击率百分号列", "format": "percent" },
        "comments": { "column": "评论列", "format": "number" }
      }
    }
  }
}
```

字符串映射保留文本，包括平台编号的前导零。范围日期需要明确填写，没有日期窗口时分别填 `null`。数字单位按实际列配置，`percent` 读取例如 `3.4%` 的显示值，`ratio` 把例如 `0.034` 的比例转换为 3.4。原始值是数字百分数时可用 `number`。空白单元格会省略，可用 `values` 把实际状态标签映射为档案枚举，例如 `{ "column":"状态", "values": { "已发布":"published" } }`。目录和草稿清单把对应字段写在 `mapping.record` 并选用各自的引用类型。

脚本默认产生未核实完整覆盖的批次。只有手中的来源证据同时支持完整范围和实际总行数时才在配置中添加 `whole_scope: true` 和 `total_rows`。生成的 `manifest.json` 列出同一批次的全部 JSON 页，最后写入。清单缺失时说明本地生成未完成。

## 预览、提交与续传

站点的档案导入页可逐个选择生成的 JSON 页。每页最多八行和十六条平台引用。等价的所有者 API 顺序如下。

1. `POST /api/v1/review/archive/imports/preview` 返回 `preview_hash`、新建、更新、已登记、冲突及未识别项，预览阶段不写业务数据和检查点。
2. `POST /api/v1/review/archive/imports/apply` 发送同一页并加上 `preview_hash`。服务器重新核对相关档案，结果与检查点在同一事务内落库。
3. 中断后用 `GET /api/v1/review/archive/imports/{run_id}` 读取已提交页和 `next_page`。原页相同请求可重放并返回已保存结果。已提交页内容不同、跳页或预览后档案变化都需先核对。
4. `GET /api/v1/review/archive/imports/{run_id}/reconcile` 读取平台有本站缺、本站有平台未见、疑似重复和状态冲突。只有结尾页、声明范围、总数和处理结果都支持覆盖结论，才给出完整覆盖。指标表不用于判断平台文章清单的缺漏。

平台编号和发布状态已确认的文章可独立入档。多份原稿同时符合内容证据时，文章保留「关联待核」并参与发布和阅读统计，候选草稿保持原状态。

当前没有原始文件和字段表头，配置里的列名和数值是合成示例。落实真实历史缺口需要用户提供授权的本地目录、草稿清单、带真实采集时刻的各份指标表，以及实际原稿、来源清单和图资料。
