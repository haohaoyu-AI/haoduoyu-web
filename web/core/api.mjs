import { clearArticleIndexes, resetSessionIndexes } from "./session-index-state.mjs";
import { runtime, state } from "./state.mjs";
import { renderLogin } from "../pages/login.mjs";
import { closeModal } from "../ui/modal.mjs";
import { assertRequestActive, backgroundRequests, isRequestAbort, pendingGet } from "./requests.mjs";
function apiOptions(options) {
  const opts = { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...options.headers || {} } };
  if (opts.body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.csrfToken) {
    opts.headers["X-CSRF-Token"] = state.me.csrfToken;
  }
  return opts;
}
async function apiTransport(path, opts) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, opts);
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw new Error("暂时无法连接网站，请检查网络后重试。");
  }
  if (response.ok && !["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) {
    if (["/auth/login", "/auth/logout", "/auth/password"].includes(path)) resetSessionIndexes();
    else clearArticleIndexes();
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  return { ok: response.ok, status: response.status, text };
}
function apiFailure(path, response, payload, epoch, identity) {
  const current = epoch === runtime.sessionEpoch && identity === (state.me?.id ?? null);
  if (response.status === 401 && path !== "/auth/login" && current) {
    state.me = null;
    closeModal();
    renderLogin();
  }
  const message = payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error = new Error(message);
  error.status = response.status;
  error.code = payload.error?.code;
  if (response.status === 401 && !current) error.staleSession = true;
  return error;
}
async function api(path, options = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const { envelope = false, context, ...requestOptions } = options;
  const opts = apiOptions(requestOptions), method = (opts.method || "GET").toUpperCase();
  const scope = method === "GET" ? context || backgroundRequests() : null;
  const response = scope ? await pendingGet(
    path,
    opts,
    envelope,
    scope,
    (signal) => apiTransport(path, { ...opts, signal })
  ) : await apiTransport(path, opts);
  if (scope) assertRequestActive(scope, opts.signal);
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) throw apiFailure(path, response, payload, epoch, identity);
  return envelope ? payload : payload.data;
}
export {
  api
};
