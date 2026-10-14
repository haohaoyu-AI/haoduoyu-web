// Only a successful fresh sample with a different fingerprint creates this
// private brand. Error messages and caller-supplied properties cannot create it.
const sourceChanges=new WeakSet<object>();
export function credentialSourceChanged():Error {
 const error=Error('credential_source_changed');sourceChanges.add(error);return error;
}
export function isCredentialSourceChanged(value:unknown):boolean {
 return value!==null&&typeof value==='object'&&sourceChanges.has(value);
}
