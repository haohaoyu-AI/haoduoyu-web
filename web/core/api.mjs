import { clearArticleIndexes, resetSessionIndexes } from "./session-index-state.mjs";
import { runtime, state } from "./state.mjs";
import { renderLogin } from "../pages/login.mjs";
import { closeModal } from "../ui/modal.mjs";
async function api(path, options = {}) {
  const requestSessionEpoch = runtime.sessionEpoch, requestIdentity = state.me?.id ?? null;
  const { envelope = false, ...requestOptions } = options;
  const opts = { credentials: "same-origin", ...requestOptions, headers: { Accept: "application/json", ...options.headers || {} } };
  if (opts.body !== void 0) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.csrfToken) opts.headers["X-CSRF-Token"] = state.me.csrfToken;
  let response;
  try {
    response = await fetch(`/api/v1${path}`, opts);
  } catch {
    throw new Error("暂时无法连接网站，请检查网络后重试。");
  }
  if (response.ok && !["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) {
    if (["/auth/login", "/auth/logout", "/auth/password"].includes(path)) resetSessionIndexes();
    else clearArticleIndexes();
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  const currentSession = requestSessionEpoch === runtime.sessionEpoch && requestIdentity === (state.me?.id ?? null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && currentSession) {
      state.me = null;
      closeModal();
      renderLogin();
    }
    ;
    const err = new Error(payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。"));
    err.status = response.status;
    err.code = payload.error?.code;
    if (response.status === 401 && !currentSession) err.staleSession = true;
    throw err;
  }
  return envelope ? payload : payload.data;
}
export {
  api
};
