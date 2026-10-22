import { api } from "./api.mjs";
import { runtime } from "./state.mjs";
async function modalRequest(path, ticket, version, context) {
  try {
    return await api(path, { context });
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return null;
    throw err;
  }
}
export {
  modalRequest
};
