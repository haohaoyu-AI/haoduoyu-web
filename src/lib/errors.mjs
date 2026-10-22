export function fail(status, code, message) {
  throw Object.assign(new Error(message), {status, code});
}
