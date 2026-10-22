import { platforms } from "./constants.mjs";
import { state } from "./state.mjs";
const num = (value) => value === null || value === void 0 || value === "" ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).
format(Number(value));
const compact = (value) => value == null ? "—" : Number(value) >= 1e4 ? `${num(Number(value) / 1e4)}万` : num(value);
const bjtDate = (value = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric",
   month: "2-digit", day: "2-digit" }).format(new Date(value));
const time = (value, short = false) => {
  if (!value) return "未记录";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...short ? {} : { year: "numeric",
     second: "2-digit" }, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};
const duration = (seconds) => {
  if (seconds == null) return "未记录";
  const n = Number(seconds);
  if (n < 60) return `${Math.round(n)} 秒`;
  if (n < 3600) return `${Math.round(n / 60)} 分钟`;
  const h = Math.floor(n / 3600), m = Math.round(n % 3600 / 60);
  return m === 60 ? `${h + 1} 小时` : `${h} 小时${m ? ` ${m} 分钟` : ""}`;
};
const localDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 16);
};
const iso = (value) => value ? (/* @__PURE__ */ new Date(`${value}:00+08:00`)).toISOString() : null;
const metricData = (item) => {
  const raw = item?.metrics ?? item?.metrics_json ?? {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
};
const accountLabel = (account) => `${platforms[account.platform] || account.platform} · ${account.name}`;
const accountName = (id) => {
  const a = state.accounts.find((a2) => a2.id === id);
  return a ? accountLabel(a) : "未找到账号";
};
const selectedQuery = () => state.account ? `account_id=${encodeURIComponent(state.account)}` : "";
const rowsForAccount = (rows) => state.account ? rows.filter((a) => a.account_id === state.account) : rows;
function displayTime(value) {
  const stamp = Date.parse(value), diff = Date.now() - stamp;
  return !Number.isFinite(stamp) ? "未记录" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} 小时前` : time(value, bjtDate(value).
  slice(0, 4) === bjtDate().slice(0, 4));
}
function safeURL(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export {
  accountLabel,
  accountName,
  bjtDate,
  compact,
  displayTime,
  duration,
  iso,
  localDateTime,
  metricData,
  num,
  rowsForAccount,
  safeURL,
  selectedQuery,
  time
};
