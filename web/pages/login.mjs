import { $, icon } from "../core/dom.mjs";
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
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card"><div class="brand login-brand"><span class="brand\
-mark">${icon("fish", 27)}</span><h1 class="brand-title">好多鱼图文</h1></div><form id="login-form" aria-label="账号登录"><div class="form-field"><la\
bel for="username">账号</label><input class="input" id="username" name="username" autocomplete="username" required autofocus></div><div class=\
"form-field"><label for="password">密码</label><input class="input" id="password" name="password" type="password" autocomplete="current-passwo\
rd" required></div><p class="form-message" role="alert"></p><button class="btn primary" type="submit">登录 ${icon("arrow", 15)}</button></\
form></section></main>`;
}
export {
  renderLogin
};
