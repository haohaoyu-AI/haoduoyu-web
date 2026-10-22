import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

export const errorFiles = [
  'shared/auth.mjs', 'src/security.mjs', 'src/storage.mjs', 'src/backup.mjs',
  'src/worker.mjs', 'src/records.mjs', 'src/overview.mjs', 'src/analytics.mjs',
];

// Reviewed first-party call arguments only: quoted messages, numeric statuses,
// and the existing label/key/initialization expressions. Never accepts external input.
export async function errorCalls(root = new URL('../', import.meta.url), canonicalOnly = false) {
  const rows = [];
  for (const file of errorFiles) {
    const source = await readFile(new URL(file, root), 'utf8');
    let ordinal = 0;
    for (const match of source.matchAll(/\b(fail|bad)\s*\(/g)) {
      if (/function\s+$/.test(source.slice(0, match.index))) continue;
      const start = match.index + match[0].length;
      let quote = '', escaped = false, depth = 1, end = start;
      for (; end < source.length; end++) {
        const char = source[end];
        if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = '';
        } else if ("'\"`".includes(char)) quote = char;
        else if (char === '(') depth++;
        else if (char === ')' && --depth === 0) break;
      }
      if (depth) throw new Error('Unbalanced error call in ' + file);
      const expression = source.slice(start, end);
      const args = vm.runInNewContext('[' + expression + ']', {
        label: '合成字段', key: 'synthetic-metric', state: {initialized: 0},
      });
      const alternate = vm.runInNewContext('[' + expression + ']', {
        label: '另一合成字段', key: 'another-synthetic-metric', state: {initialized: 2},
      });
      const overviewLegacy = file === 'src/overview.mjs' && typeof args[0] === 'string';
      if (canonicalOnly && (overviewLegacy || match[1] === 'bad')) {
        throw new Error('Noncanonical error signature in ' + file);
      }
      const [status, code, message] = match[1] === 'bad' ? [400, 'VALIDATION_ERROR', args[0]]
        : overviewLegacy ? [args[2] ?? 400, args[0], args[1]] : args;
      if (!Number.isInteger(status) || typeof code !== 'string' || typeof message !== 'string') {
        throw new Error('Invalid error signature in ' + file);
      }
      rows.push({file, ordinal: ++ordinal, baselineLine: source.slice(0, match.index).split('\n').length,
        status, code, message, alternateMessage: match[1] === 'bad' ? alternate[0]
          : overviewLegacy ? alternate[1] : alternate[2]});
    }
  }
  return rows;
}
