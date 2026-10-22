import { platforms } from "../core/constants.mjs";
import { e, icon } from "../core/dom.mjs";
import { accountLabel, accountName, bjtDate, displayTime, num, rowsForAccount, time } from "../core/format.mjs";
import { state } from "../core/state.mjs";
import { empty, field, formEnd, platformLogo } from "../ui/components.mjs";
import { openModal } from "../ui/modal.mjs";
import { toast } from "../ui/toast.mjs";
function renderAccounts() {
  const accounts = rowsForAccount(state.accounts);
  return `<section class="card">${accounts.length ? `<div class="table-scroll"><table class="data-table accounts-table"><thead><tr><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${accounts.map((a) => `<tr><td><span class="account-title">${platformLogo(a.platform)}${e(a.name)}</span><div class="cell-sub">${e(platforms[a.platform] || a.platform)}</div></td><td><span class="badge ${a.active ? "up" : ""}">${a.active ? "使用中" : "已停用"}</span></td><td>${e(time(a.created_at))}</td><td><button class="btn small" data-action="edit-account" data-id="${e(a.id)}">${icon("edit", 13)}编辑</button></td></tr>`).join("")}</tbody></table></div>` : empty("暂无账号")}</section>`;
}
function renderKeys(keys) {
  return `<section class="card">${keys.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>凭证名称</th><th>账号范围</th><th>权限</th><th>最近使用</th><th>状态</th><th></th></tr></thead><tbody>${keys.map((k) => {
    let ids = k.account_ids || k.account_ids_json || [], permissions = k.permissions || k.permissions_json || [];
    if (typeof ids === "string") {
      try {
        ids = JSON.parse(ids);
      } catch {
        ids = [];
      }
    }
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions);
      } catch {
        permissions = [];
      }
    }
    return `<tr><td>${e(k.name)}<div class="cell-sub">创建 ${e(time(k.created_at))}</div></td><td class="key-scope">${ids.map((id) => e(accountName(id))).join("<br>") || "无账号权限"}</td><td>${permissions.map((p) => `<span class="badge ${p === "write" ? "up" : ""}">${p === "read" ? "读取" : p === "write" ? "写入" : e(p)}</span>`).join(" ")}</td><td>${k.last_used_at ? e(time(k.last_used_at)) : "尚未使用"}</td><td><span class="badge ${k.revoked_at ? "" : "up"}">${k.revoked_at ? "已撤销" : "有效"}</span></td><td>${k.revoked_at ? "" : `<button class="btn small danger" data-action="revoke-key" data-id="${e(k.id)}" data-name="${e(k.name)}">撤销</button>`}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("暂无凭证", "供自动化工具按账号范围读取或录入数据。")}</section>`;
}
function auditLabel(action) {
  const labels = [["新增文章", "article.create", "POST /articles"], ["修改文章", "article.update", "PUT /articles/:id"], ["追加复盘快照", "observation.create", "POST /observations"], ["填写每日数据", "daily_metrics.upsert", "POST /daily-metrics"], ["添加账号", "account.create", "POST /accounts"], ["修改账号", "account.update", "PUT /accounts/:id"], ["创建 AI 凭证", "api_key.create", "api_key.created", "POST /api-keys"], ["撤销 AI 凭证", "api_key.revoke", "api_key.revoked", "DELETE /api-keys/:id"], ["修改密码", "auth.password", "auth.password_changed", "PUT /auth/password"], ["登录网站", "auth.login", "POST /auth/login"], ["退出登录", "auth.logout", "POST /auth/logout"], ["初始化网站", "auth.bootstrap"]];
  const route = String(action || "").replace(/^(PUT|DELETE) \/(articles|accounts|api-keys)\/[^/]+$/, "$1 /$2/:id");
  return labels.find((row) => row.includes(route))?.[0] || route || "未知操作";
}
function renderSecurity() {
  return `<section class="card panel security-panel"><h2>登录与安全</h2><p class="muted security-context">当前登录：${e(state.me.username)}</p><form id="password-form"><div class="form-field"><label for="current-password">当前密码</label><input class="input" type="password" id="current-password" name="currentPassword" autocomplete="current-password" required></div><div class="form-field field-spaced"><label for="new-password">新密码</label><input class="input" type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="12" required><span class="hint">至少 12 位</span></div><div class="form-field field-spaced"><label for="confirm-password">再次输入新密码</label><input class="input" type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="12" required></div><p class="form-message" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">更新密码</button></div></form><div class="detail-section"><h3>数据导出</h3><a class="btn" href="/api/v1/export" download>${icon("download", 14)}导出发布记录 CSV</a></div></section>`;
}
function renderAudit(audit, keys = []) {
  const actors = [...new Set(audit.map((r) => r.actor))], groups = [];
  const actor = (value) => state.me?.id && value === "user:" + state.me.id ? "我" : keys.find((k) => value === "key:" + k.id)?.name || `${String(value).startsWith("user:") ? "用户" : String(value).startsWith("key:") ? "未识别凭据" : "未知来源"} ${num(actors.indexOf(value) + 1)}`;
  for (const row of audit) {
    const day = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "日期未知", label = auditLabel(row.action), last = groups.at(-1);
    if (last && day !== "日期未知" && last.day === day && last.actor === row.actor && last.label === label) last.rows.push(row);
    else groups.push({ day: day, actor: row.actor, label, rows: [row] });
  }
  let day = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day = g.day;
    return `${heading}<details class="audit-item"><summary><div><strong>${e(g.label)} ×${e(num(g.rows.length))}</strong><div class="audit-meta">${e(actor(g.actor))} · ${e(time(g.rows.at(-1).created_at, true))}${g.rows.length > 1 ? " — " + e(time(g.rows[0].created_at, true)) : ""}</div></div></summary><ol class="snapshot-timeline">${g.rows.map((r) => {
      const article = r.entity_id && typeof r.entity_label === "string" && r.entity_label ? r : null;
      return `<li>${e(auditLabel(r.action))} · <time datetime="${e(r.created_at)}" title="${e(time(r.created_at))}">${e(displayTime(r.created_at))}</time>${article ? `<br><button class="article-link" data-action="article-detail" data-id="${e(article.entity_id)}">${e(article.entity_label)}</button>` : ""}</li>`;
    }).join("")}</ol></details>`;
  }).join("") || empty("暂无操作记录")}</div></section>`;
}
function accountModal(id = "") {
  const a = state.accounts.find((a) => a.id === id) || { platform: "toutiao", name: "", active: true };
  openModal(id ? "管理运营账号" : "添加运营账号", `<form id="account-form" data-id="${e(id)}"><div class="form-grid"><div class="form-field"><label for="field-platform">所属平台</label><select class="input" id="field-platform" name="platform" ${id ? "disabled" : ""}>${Object.entries(platforms).map(([key, label]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field("name", '账号名称 <span class="required">*</span>', "text", a.name, 'required maxlength="100"')}${id ? `<div class="form-field full"><label class="check-option"><input type="checkbox" name="active" ${a.active ? "checked" : ""}>启用此账号</label><span class="hint">停用保留历史数据。</span></div>` : ""}</div>${formEnd(id ? "保存账号" : "添加账号")}</form>`);
}
function keyModal() {
  if (!state.accounts.some((a) => a.active)) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal("创建 AI 接入凭证", `<form id="key-form"><div class="form-grid">${field("name", '凭证名称 <span class="required">*</span>', "text", "", 'required maxlength="80"', true)}<fieldset class="form-field permission-fields"><legend class="field-label">允许访问的账号 <span class="required">*</span></legend><div class="checkboxes">${state.accounts.filter((a) => a.active).map((a) => `<label class="check-option"><input type="checkbox" name="account_ids" value="${e(a.id)}" ${state.account === a.id ? "checked" : ""}>${e(accountLabel(a))}</label>`).join("")}</div></fieldset><fieldset class="form-field permission-fields"><legend class="field-label">允许的操作</legend><div class="checkboxes"><label class="check-option"><input type="checkbox" name="permissions" value="read" checked>读取文章与数据</label><label class="check-option"><input type="checkbox" name="permissions" value="write">新增与更新数据</label></div></fieldset></div>${formEnd("创建凭证")}</form>`);
}
export {
  accountModal,
  auditLabel,
  keyModal,
  renderAccounts,
  renderAudit,
  renderKeys,
  renderSecurity
};
