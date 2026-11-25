// Local durability is a separate protocol. JSON from an HTTP response cannot forge this marker.
const localMarker = Symbol('haoduoyu-local-durable-document');
const documents = new WeakMap();
export function localDocument({local, server = null, operation = null, conflict = null}) {
  const {content_hash, change_seq, ...value} = structuredClone(local);
  const document = Object.freeze({...value, [localMarker]: true});
  documents.set(document, {local: value, server: structuredClone(server),
    operation: structuredClone(operation), conflict: structuredClone(conflict)});
  return document;
}
export const isLocalDocument = value => Boolean(value && documents.has(value));
export const documentValue = value => documents.get(value)?.local || value;
export const documentState = value => documents.get(value) || null;
