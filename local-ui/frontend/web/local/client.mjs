// Both historical API entry points terminate in the same local transaction
// service. No fetch, server fallback, cookie, login or upload path exists.
import {runtime,state} from '../core/state.mjs';
import {getLocalRuntime} from './runtime.mjs';
async function localRequest(path,options = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const active = () => {
    if (epoch !== runtime.sessionEpoch || identity !== (state.me?.id ?? null) || options.signal?.aborted ||
      options.context?.controller?.signal.aborted) throw new DOMException('请求已取消','AbortError');
  };
  const local = await getLocalRuntime(); active();
  return local.call(path,{...options,offlineGuard:active});
}
export const api = localRequest;
export const apiNetwork = localRequest;
