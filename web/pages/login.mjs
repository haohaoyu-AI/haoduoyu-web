import { $, e, icon } from "../core/dom.mjs";
import { resetSessionIndexes } from "../core/session-index-state.mjs";
import { runtime } from "../core/state.mjs";
import { stopPageEntry } from "../ui/entry.mjs";
import { closePopover } from "../ui/popover.mjs";
function renderLogin() {
  resetSessionIndexes();
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card"><div class="brand login-brand"><span \
class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">好多鱼工作台</h1></div><form id="login-form" aria-label="账号登录"><div class="form-field">\
<label for="username">账号</label><input class="input" id="username" name="username" autocomplete="username" required autofocus></div><div \
class="form-field"><label for="password">密码</label><input class="input" id="password" name="password" type="password" \
autocomplete="current-password" required></div><p class="form-message" role="alert"></p><button class="btn primary" type="submit">登录 ${icon(
  "arrow", 15)}</button></form>\
</section></main>`;
}
// A failed network or initialization request does not mean that credentials
// are required. Keep this distinct from the real 401 login flow and retry the
// full identity check before showing any account data.
function renderInitializationError(message, onRetry, {status} = {}) {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  const explanation = status === 429 ? "请求较多，请稍后重试。" : "未能完成连接或读取，请检查网络后重试。";
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card" role="alert"><div class="brand login-brand"><span ` +
    `class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">工作台暂时无法打开</h1></div><p>${explanation}</p><p>${e(message || "请稍后重试。")}</p><button ` +
      `id="init-retry" class="btn primary" type="button">重新连接</button></section></main>`;
  $("#init-retry")?.addEventListener("click", onRetry);
}
export {
  renderLogin, renderInitializationError
};
