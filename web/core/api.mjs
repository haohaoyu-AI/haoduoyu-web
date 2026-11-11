import { clearArticleIndexes, resetSessionIndexes } from "./session-index-state.mjs";
import { runtime, state } from "./state.mjs";
import { renderLogin } from "../pages/login.mjs";
import { closeModal } from "../ui/modal.mjs";
import { assertRequestActive, backgroundRequests, isRequestAbort, pendingGet } from "./requests.mjs";
import { offlineRequest, captureOfflineRateLimitContext, recordOfflineRateLimit } from "../offline/runtime.mjs";
import { parseRetryAfter, retryAfterDelay } from "./retry-after.mjs";
function apiOptions(options) {
  const opts = { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...options.headers || {} } };
  if (opts.body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.csrfToken) {
    opts.headers["X-CSRF-Token"] = state.me.csrfToken;
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.publicBusiness) {
    opts.headers["X-Public-Business"] = "1";
  }
  return opts;
}
async function apiTransport(path, opts) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, opts);
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw Object.assign(new Error("暂时无法连接网站，请检查网络后重试。"), {code: "NETWORK_UNAVAILABLE"});
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
    throw Object.assign(new Error("服务暂时不可用，请稍后重试。"), {code: "NETWORK_UNAVAILABLE"});
  }
  return { ok: response.ok, status: response.status, text, retryAfter: response.headers?.get?.("Retry-After") ?? null,
    serverDate: response.headers?.get?.("Date") ?? null };
}
function apiFailure(path, response, payload, epoch, identity, suppressAuthRedirect = false) {
  const current = epoch === runtime.sessionEpoch && identity === (state.me?.id ?? null);
  if (response.status === 401 && path !== "/auth/login" && current && !suppressAuthRedirect) {
    state.me = null;
    closeModal();
    renderLogin();
  }
  const message = payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error = new Error(message);
  error.status = response.status;
  error.code = payload.error?.code;
  if (error.code === 'OPENAI_REVIEW_IN_FLIGHT' && typeof payload.error?.run_id === 'string') error.run_id = payload.error.run_id;
  if (error.code === 'OPENAI_CONNECTIVITY_IN_FLIGHT' && typeof payload.error?.test_id === 'string') error.test_id = payload.error.test_id;
  if (response.status === 429) {
    const serverTime = Date.parse(response.serverDate);
    error.retryAfterMs = retryAfterDelay(parseRetryAfter(response.retryAfter, Number.isFinite(serverTime) ? serverTime : Date.now()));
  }
  if (response.status === 401 && !current) error.staleSession = true;
  return error;
}
async function apiNetwork(path, options = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const rateLimitContext = captureOfflineRateLimitContext();
  const { envelope = false, context, suppressAuthRedirect = false, ...requestOptions } = options;
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
    if (response.status === 429) payload = {error: {code: 'RATE_LIMITED', message: '请求较多，请稍后重试。'}};
    else throw new Error("服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) {
    const error = apiFailure(path, response, payload, epoch, identity, suppressAuthRedirect);
    if (error.status === 429 && epoch === runtime.sessionEpoch && identity === (state.me?.id ?? null))
      await recordOfflineRateLimit(rateLimitContext, error.retryAfterMs);
    throw error;
  }
  return envelope ? payload : payload.data;
}
function api(path, options = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const active = () => {
    if (epoch !== runtime.sessionEpoch || identity !== (state.me?.id ?? null) || options.signal?.aborted ||
        options.context?.controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
  };
  return offlineRequest(path, options, apiNetwork, me => {
    if (state.me && state.me.id === me.id) state.me = me;
  }, active);
}
export {
  api, apiNetwork
};
