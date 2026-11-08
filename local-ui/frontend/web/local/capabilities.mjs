// No semantic polyfills: an old WebView must not weaken validation or storage.
export function missingLocalCapabilities(environment = globalThis) {
  return [
    ['IndexedDB', Boolean(environment.indexedDB?.open)],
    ['structuredClone', typeof environment.structuredClone === 'function'],
    ['crypto.randomUUID', typeof environment.crypto?.randomUUID === 'function'],
    ['crypto.subtle', typeof environment.crypto?.subtle?.digest === 'function'],
    ['String.isWellFormed', typeof environment.String?.prototype?.isWellFormed === 'function'],
    ['Object.hasOwn', typeof environment.Object?.hasOwn === 'function'],
  ].filter(([,present]) => !present).map(([name]) => name);
}
