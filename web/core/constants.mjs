const platforms = { toutiao: "今日头条", zhihu: "知乎", wechat: "微信公众号", other: "其他平台" };
const modeLabels = { manual: "人工", automatic: "自动化", mixed: "人工＋自动化", unknown: "未记录" };
const kindLabels = { latest: "最新数据", d1: "第 1 天观察", d3: "第 3 天观察", d7: "第 7 天观察" };
const metrics = { reads: "阅读", impressions: "展现", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享", approvals: "赞同", reading_users: "阅读人数" };
const nav = [
  { id: "dashboard", label: "总览", icon: "grid" },
  { id: "articles", label: "文章", icon: "articles" },
  { id: "reviews", label: "数据", icon: "chart" },
  { id: "todos", label: "每日待办", icon: "check" },
  { id: "notes", label: "碎碎念", icon: "edit" },
  { id: "settings", label: "设置", icon: "settings" }
];
const settingsTabs = { accounts: "账号", keys: "AI 授权", security: "安全", log: "操作日志" };
const legacyPages = { management: "accounts", accounts: "accounts", keys: "keys" };
const defaultFilters = () => ({ q: "", mode: "", from: "", to: "", sort: "published_at", order: "desc", group: "", platform: "", topic: "", data_status: "" });
const articleColumns = { reads: ["阅读", "reads"], likes: ["点赞", "likes"], comments: ["评论", "comments"], as_of: ["数据截至", "latest_as_of"],
   approvals: ["赞同", "approvals"], mode: ["生产方式", ""], duration: ["耗时", "duration"], published: ["发布日期",
"published_at"], account: ["账号", ""] };
const articleStatuses = { no_snapshot: "未采集", missing_reads: "缺阅读数据", missing_likes: "缺点赞数据", missing_comments: "缺评论数据", incomplete:
   "指标不完整", zero_reads: "真实0阅读", date_unverified: "日期待核实" };
const articleChoices = { topic: { entertainment: "文娱（推断）", insurance: "保险（推断）", unknown: "未推断" }, mode: modeLabels,
group: { account: "按账号", mode: "按生产方式" } };
const defaultColumns = ["reads", "likes", "comments", "as_of"];
export {
  articleChoices,
  articleColumns,
  articleStatuses,
  defaultColumns,
  defaultFilters,
  kindLabels,
  legacyPages,
  metrics,
  modeLabels,
  nav,
  platforms,
  settingsTabs
};
