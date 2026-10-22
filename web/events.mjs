import {isRequestAbort, cancelModalRequests} from './core/requests.mjs';
import { applyArticleFilters, init, navigate, reloadFilteredPage, renderPage, renderShell } from "./controller.mjs";
import { api } from "./core/api.mjs";
import { defaultColumns, defaultFilters, metrics, settingsTabs } from "./core/constants.mjs";
import { $, $$, e, icon } from "./core/dom.mjs";
import { iso, safeURL, time } from "./core/format.mjs";
import { readRoute, updateRoute } from "./core/router.mjs";
import { clearArticleIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { articleDraft, articleFilterPanel, articleMenu, articleModal, viewDraft } from "./pages/articles.mjs";
import { dashboardInfoBody, renderDashboard } from "./pages/dashboard.mjs";
import { articleDetail } from "./pages/detail.mjs";
import { renderLogin } from "./pages/login.mjs";
import { reviewModal } from "./pages/reviews.mjs";
import { accountModal, keyModal } from "./pages/settings.mjs";
import { field, formEnd, renderSnapshot } from "./ui/components.mjs";
import { replacePageContent } from "./ui/entry.mjs";
import { setMenu, syncMenu } from "./ui/menu.mjs";
import { closeModal, openModal } from "./ui/modal.mjs";
import { closePopover, popover } from "./ui/popover.mjs";
import { toast } from "./ui/toast.mjs";
function registerEvents() {
  document.addEventListener("click", async (event) => {
    if (runtime.activePopover?.node.contains(event.target) && event.target.closest("[role=menuitem]")) closePopover();
    if (runtime.activePopover && !runtime.activePopover.node.contains(event.target) && !runtime.activePopover.trigger.contains(event.target)) {
      const control = event.target.closest('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])');
      closePopover();
      control?.focus();
    }
    const target = event.target.closest("[data-action],[data-nav]");
    if (!target) {
      if (event.target.classList.contains("modal-backdrop")) closeModal();
      if (event.target.classList.contains("shell") && $(".shell").classList.contains("menu-open")) setMenu(false);
      return;
    }
    if (runtime.activePopover?.node.contains(target) && !["reset-draft", "draft-sort"].includes(target.dataset.action)) closePopover();
    if (target.dataset.nav) {
      event.preventDefault();
      navigate(target.dataset.nav);
      return;
    }
    const action = target.dataset.action, id = target.dataset.id;
    try {
      switch (action) {
        case "missing-list":
          state.filters = { ...defaultFilters(), data_status: target.dataset.status || "incomplete" };
          state.account = "";
          state.listPage = 1;
          navigate("articles");
          break;
        case "list-prev":
          state.listPage = Math.max(1, state.listPage - 1);
          updateRoute();
          renderPage();
          break;
        case "list-next":
          if (state.articleMeta?.has_more) {
            state.listPage++;
            updateRoute();
            renderPage();
          }
          break;
        case "sort-column": {
          const key = target.dataset.sort;
          state.filters.order = state.filters.sort === key && state.filters.order === "desc" ? "asc" : "desc";
          state.filters.sort = key;
          reloadFilteredPage('[data-sort="' + key + '"]');
          break;
        }
        case "save-view":
          openModal("保存常用视图", `<form id="save-view-form">${field("name", '视图名称 <span class="required">*</span>', "text", "", 'maxlength="80" required')}${formEnd("保存视图")}</form>`);
          break;
        case "close-modal":
          closeModal();
          break;
        case "menu":
          setMenu(!$(".shell").classList.contains("menu-open"));
          break;
        case "settings-tab":
          if (Object.hasOwn(settingsTabs, target.dataset.tab)) {
            navigate("settings", target.dataset.tab);
            $("[data-action=settings-tab][data-tab=" + state.settingsTab + "]")?.focus();
          }
          break;
        case "article-filter": {
          cancelModalRequests();
          runtime.modalRequestVersion++;
          if (runtime.searchTimer) {
            clearTimeout(runtime.searchTimer);
            runtime.searchTimer = null;
            const version = runtime.renderVersion + 1;
            await renderPage();
            if (version !== runtime.renderVersion || state.page !== "articles" || $("#overlay").firstChild) break;
          }
          const trigger = $("[data-action=article-filter]");
          if (trigger) popover(trigger, articleFilterPanel(), { label: "文章筛选" });
          break;
        }
        case "reset-draft":
          $("#filter-panel").outerHTML = articleFilterPanel({ filters: defaultFilters(), columns: new Set(defaultColumns), account: "" });
          $("#filter-panel select")?.focus();
          break;
        case "draft-sort": {
          const draft = articleDraft($("#filter-panel"));
          draft.filters.order = draft.filters.sort === target.dataset.sort && draft.filters.order === "desc" ? "asc" : "desc";
          draft.filters.sort = target.dataset.sort;
          $("#filter-panel").outerHTML = articleFilterPanel(draft);
          $('#filter-panel [data-sort="' + target.dataset.sort + '"]')?.focus();
          break;
        }
        case "article-platform":
        case "review-platform":
          state.filters.platform = target.dataset.platform;
          reloadFilteredPage("[data-action=" + action + "][aria-pressed=true]");
          break;
        case "remove-filter":
          if (target.dataset.filter === "account") state.account = "";
          else if (Object.hasOwn(defaultFilters(), target.dataset.filter)) state.filters[target.dataset.filter] = defaultFilters()[target.dataset.filter];
          reloadFilteredPage();
          break;
        case "article-menu": {
          const article = state.articles.find((a) => a.id === id);
          if (article) popover(target, articleMenu(article), { menu: true, label: "文章操作" });
          break;
        }
        case "detail-info":
          popover(target, `<p>${e(target.dataset.reason)}</p>`, { label: target.getAttribute("aria-label") });
          break;
        case "dashboard-info":
          popover(target, dashboardInfoBody(target.dataset.kind, id), { label: target.getAttribute("aria-label") });
          break;
        case "top-platform":
          state.topPlatform = target.dataset.platform;
          updateRoute();
          await renderPage();
          if (!$("#overlay").firstChild && document.activeElement === document.body) $("[data-action=top-platform][aria-pressed=true]")?.focus();
          break;
        case "all-top":
        case "select-platform":
          event.preventDefault();
          state.filters = { ...defaultFilters(), platform: action === "all-top" ? state.topPlatform : target.dataset.platform, ...action === "all-top" ? { sort: "reads", order: "desc" } : {} };
          state.account = "";
          state.listPage = 1;
          navigate("articles");
          break;
        case "new-daily":
          state.reviewTab = "daily";
          await reviewModal();
          break;
        case "trend-tab":
          if (["metrics", "publication"].includes(target.dataset.tab)) {
            state.trendTab = target.dataset.tab;
            state.trendOpen = true;
            replacePageContent(renderDashboard(state.dashboard));
            $("[data-action=trend-tab][data-tab=" + state.trendTab + "]")?.focus();
          }
          break;
        case "page-menu":
          popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button><a href="/api/v1/export" download role="menuitem">导出发布记录 CSV</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
          break;
        case "key-help":
          popover(target, "<p>供自动化工具按账号范围读取或录入数据；凭据创建后仅显示一次。</p>", { label: "AI 凭据用途" });
          break;
        case "logout":
          await api("/auth/logout", { method: "POST" });
          state.me = null;
          renderLogin();
          break;
        case "refresh":
          clearArticleIndexes();
          renderPage();
          break;
        case "overview-period":
          if (["yesterday", "7d", "30d"].includes(target.dataset.period) && state.overviewPeriod !== target.dataset.period) {
            state.overviewPeriod = target.dataset.period;
            updateRoute();
            renderShell();
          }
          break;
        case "show-due":
          state.reviewTab = "pending";
          navigate("reviews");
          break;
        case "toggle-attention":
          state.attentionExpanded = !state.attentionExpanded;
          if (state.dashboard) {
            replacePageContent(renderDashboard(state.dashboard));
          }
          break;
        case "new-article":
          await articleModal();
          break;
        case "edit-article":
          await articleModal(id);
          break;
        case "article-detail":
          await articleDetail(id);
          break;
        case "review-article":
          await reviewModal(id, target.dataset.kind || "latest");
          break;
        case "new-review":
          await reviewModal();
          break;
        case "review-tab":
          if (["pending", "observations", "daily"].includes(target.dataset.tab)) {
            state.reviewTab = target.dataset.tab;
            updateRoute(true);
            const version = runtime.renderVersion + 1;
            await renderPage();
            if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $("[data-action=review-tab][data-tab=" + state.reviewTab + "]")?.focus();
          }
          break;
        case "new-account":
          accountModal();
          break;
        case "edit-account":
          accountModal(id);
          break;
        case "new-key":
          keyModal();
          break;
        case "select-account":
          state.account = id;
          state.listPage = 1;
          navigate("articles");
          break;
        case "record-detail": {
          const row = state.reviewRecords.find((r) => r.id === id);
          if (row) openModal("数据记录详情", `${renderSnapshot(row)}<p class="cell-sub record-context">${e(row.date ? "统计日期：" + row.date : "数据截至：" + time(row.as_of))}${row.updated_at ? " · 更新于 " + e(time(row.updated_at)) : ""}</p>`);
          break;
        }
        case "revoke-key":
          openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p><form id="revoke-form" data-id="${e(id)}">${formEnd("确认撤销")}</form>`);
          break;
        case "copy-token": {
          const token = $("#created-token").textContent;
          try {
            await navigator.clipboard.writeText(token);
            toast("凭证已复制，请在安全位置保存。");
          } catch {
            const range = document.createRange();
            range.selectNodeContents($("#created-token"));
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            toast("已选中凭证，请手动复制。");
          }
          break;
        }
        case "reset-filters":
          state.filters = defaultFilters();
          state.account = "";
          state.listPage = 1;
          updateRoute();
          renderShell();
          break;
      }
    } catch (err) {
      if (!err.staleSession && !isRequestAbort(err)) toast(err.message, true);
    }
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.id === "filter-view") {
      const view = state.savedViews.find((v) => v.id === el.value);
      if (view) {
        $("#filter-panel").outerHTML = articleFilterPanel(viewDraft(view));
        $("#filter-panel select")?.focus();
      }
    } else if (el.name === "columns" && el.closest("#filter-panel")) {
      $("#filter-panel").outerHTML = articleFilterPanel(articleDraft(el.form));
      $('#filter-panel input[value="' + el.value + '"]')?.focus();
    } else if (el.id === "global-account") {
      state.account = el.value;
      state.listPage = 1;
      updateRoute();
      renderShell();
    } else if (el.id === "page-size") {
      state.pageSize = Number(el.value);
      state.listPage = 1;
      updateRoute();
      renderPage();
    } else if (el.id === "trend-date") {
      state.trendDate = el.value;
      state.trendOpen = true;
      replacePageContent(renderDashboard(state.dashboard));
    } else if (el.id === "trend-metric") {
      state.trendMetric = el.value;
      state.trendOpen = true;
      replacePageContent(renderDashboard(state.dashboard));
    } else if (el.closest("#article-filters") && el.name && el.name !== "q") {
      state.filters[el.name] = el.value;
      reloadFilteredPage("[name=" + el.name + "]");
    } else if (el.id === "review-account") {
      const select = $("#review-article");
      select.innerHTML = '<option value="">账号总体</option>' + state.reviewArticles.filter((a) => a.account_id === el.value).map((a) => `<option value="${e(a.id)}">${e(a.title)}</option>`).join("");
    }
  });
  document.addEventListener("toggle", (event) => {
    const key = event.target.dataset?.state;
    if (event.target.isConnected && key === "trendOpen") state[key] = event.target.open;
  }, true);
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.name === "q" && el.closest("#article-filters")) {
      state.filters.q = el.value;
      state.listPage = 1;
      updateRoute();
      clearTimeout(runtime.searchTimer);
      const query = el.value, version = runtime.renderVersion;
      runtime.searchTimer = setTimeout(async () => {
        runtime.searchTimer = null;
        if (state.page !== "articles" || state.filters.q !== query || runtime.renderVersion !== version) return;
        const start = el.selectionStart;
        await renderPage();
        if (runtime.renderVersion === version + 1 && !$("#overlay").firstChild) {
          const next = $("#article-filters input[name=q]");
          if (next) {
            next.focus();
            next.setSelectionRange(start, start);
          }
        }
      }, 350);
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "filter-panel") {
      event.preventDefault();
      applyArticleFilters(event.target);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (runtime.activePopover) {
      if (event.key === "Tab") {
        const current = runtime.activePopover;
        setTimeout(() => {
          if (runtime.activePopover === current && !current.node.contains(document.activeElement)) closePopover({ restoreFocus: false });
        }, 0);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePopover();
        return;
      }
      if (runtime.activePopover.menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = $$("[role=menuitem]", runtime.activePopover.node), i = items.indexOf(document.activeElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        return;
      }
    }
    if (event.key === "Escape" && $(".shell")?.classList.contains("menu-open")) {
      event.preventDefault();
      setMenu(false);
      return;
    }
    if (!$("#overlay").firstChild) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
    if (event.key === "Tab") {
      const nodes = $$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]', $("#overlay")).filter((el) => el.getClientRects().length);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.matches("#login-form,#article-form,#review-form,#account-form,#key-form,#password-form,#revoke-form,#article-filters,#save-view-form")) return;
    event.preventDefault();
    if (form.id === "article-filters") return;
    const button = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data = Object.fromEntries(values);
    if (button?.disabled) return;
    if (message) message.textContent = "";
    if (button) button.disabled = true;
    try {
      switch (form.id) {
        case "save-view-form": {
          const saved = { id: crypto.randomUUID(), name: data.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
          if (!saved.name) throw new Error("请填写视图名称。");
          state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
          storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
          closeModal();
          toast("常用视图已保存在此浏览器。");
          await renderPage();
          break;
        }
        case "login-form":
          await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
          await init({ freshLogin: true });
          break;
        case "article-form": {
          const body = { account_id: data.account_id, title: data.title.trim(), url: data.url.trim(), published_at: iso(data.published_at), started_at: iso(data.started_at), production_mode: data.production_mode, summary: data.summary, notes: data.notes, platform_article_id: data.platform_article_id?.trim() || "" };
          if (!safeURL(body.url)) throw new Error("文章链接请使用 http 或 https 地址。");
          if (body.started_at && new Date(body.started_at) > new Date(body.published_at)) throw new Error("选题开始时间不能晚于发布时间。");
          const id = form.dataset.id;
          if (id) body.version = Number(form.dataset.version);
          await api(id ? `/articles/${encodeURIComponent(id)}` : "/articles", { method: id ? "PUT" : "POST", body });
          closeModal();
          toast(id ? "发布记录已更新。" : "发布记录已保存。");
          await renderPage();
          break;
        }
        case "review-form": {
          const m = {};
          for (const key of Object.keys(metrics)) {
            const value = data[`metric_${key}`];
            if (value !== "" && value != null) m[key] = Number(value);
          }
          if (!Object.keys(m).length) throw new Error("请至少填写一个已取得的指标。");
          let body, path;
          if (form.dataset.type === "daily") {
            path = "/daily-metrics";
            body = { account_id: data.account_id, article_id: data.article_id || null, date: data.date, metrics: m, source: data.source.trim() };
          } else {
            path = "/observations";
            body = { article_id: data.article_id, kind: data.kind, as_of: iso(data.as_of), collected_at: iso(data.collected_at), metrics: m, source: data.source.trim(), note: data.note };
          }
          await api(path, { method: "POST", body });
          closeModal();
          toast("数据已保存，总览会同步更新。");
          await renderPage();
          break;
        }
        case "account-form": {
          const id = form.dataset.id;
          await api(id ? `/accounts/${encodeURIComponent(id)}` : "/accounts", { method: id ? "PUT" : "POST", body: id ? { name: data.name.trim(), active: values.has("active") } : { platform: data.platform, name: data.name.trim() } });
          state.accounts = (await api("/accounts")).sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - ["toutiao", "zhihu", "wechat", "other"].indexOf(b.platform));
          closeModal();
          toast("运营账号已保存。");
          renderShell();
          break;
        }
        case "key-form": {
          const ids = values.getAll("account_ids"), permissions = values.getAll("permissions");
          if (!ids.length) throw new Error("请至少选择一个允许访问的账号。");
          if (!permissions.length) throw new Error("请至少选择一种操作权限。");
          const result = await api("/api-keys", { method: "POST", body: { name: data.name.trim(), account_ids: ids, permissions } });
          openModal("凭证已创建 · 请立即保存", `<div class="info-line warn">${icon("key", 15)}<span>凭证仅显示一次，请安全保存。</span></div><pre class="token-box" id="created-token">${e(result.token)}</pre><div class="form-actions"><button class="btn" data-action="copy-token">${icon("copy", 14)}复制凭证</button><button class="btn primary" data-action="close-modal">我已保存</button></div>`);
          await renderPage();
          break;
        }
        case "revoke-form":
          await api(`/api-keys/${encodeURIComponent(form.dataset.id)}`, { method: "DELETE" });
          closeModal();
          toast("凭证已撤销。");
          await renderPage();
          break;
        case "password-form":
          if (data.newPassword !== data.confirmPassword) throw new Error("两次输入的新密码不一致。");
          await api("/auth/password", { method: "PUT", body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
          form.reset();
          toast("密码已更新，请使用新密码登录。");
          state.me = null;
          renderLogin();
          break;
      }
    } catch (err) {
      if (err.staleSession || isRequestAbort(err)) return;
      if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "这条记录已被其他人或 AI 更新。请关闭后重新打开，核对最新内容再保存。" : err.message;
      else toast(err.message, true);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  });
  window.addEventListener("resize", () => {
    closePopover();
    if ($(".shell")?.classList.contains("menu-open")) setMenu(false);
    else syncMenu();
  });
  window.addEventListener("popstate", () => {
    closeModal();
    readRoute();
    if (state.me) {
      updateRoute();
      renderShell();
    }
  });
}
export {
  registerEvents
};
