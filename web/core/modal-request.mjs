import { api } from "./api.mjs";
import { runtime } from "./state.mjs";
async function modalRequest(path, ticket, version) {
  try {
    return await api(path);
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return null;
    throw err;
  }
}
export {
  modalRequest
};
