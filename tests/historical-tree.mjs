import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const paths = (value) => value.split('\0').filter(Boolean);

export function historicalTree(commit) {
  return {
    read: (file) => git('show', `${commit}:${file}`),
    files: (...roots) => paths(git('ls-tree', '-rz', '--name-only', commit, '--', ...roots)),
    changedSince: (baseline, ...roots) => paths(git('diff', '--name-only', '--no-renames', '-z', baseline, commit, '--', ...roots)),
  };
}
