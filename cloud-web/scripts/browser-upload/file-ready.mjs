import {createHash} from 'node:crypto';
import {copyFile, readFile, stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

// Only materialize bytes already legitimately available in this executor.
// This helper does not download, discover a browser path, or prove visibility.
export async function prepareNamedWord({source, destination, sha256, size}) {
  if (!path.isAbsolute(source) || !path.isAbsolute(destination) || !/\.docx$/i.test(destination) || source === destination)
    throw Error('Use distinct absolute paths and a named .docx destination');
  const inspect = async name => {
    const info = await stat(name);
    if (!info.isFile() || info.size !== size) throw Error('Word size mismatch');
    const digest = createHash('sha256').update(await readFile(name)).digest('hex');
    if (digest !== sha256) throw Error('Word SHA256 mismatch');
    return {sha256: digest, size: info.size};
  };
  await inspect(source);
  // Never overwrite a file, including another task's browser-visible Word.
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  const confirmed = await inspect(destination);
  return {...confirmed, filename: path.basename(destination), absolute_path: destination,
    checked_at: new Date().toISOString(), visible_in_browser: false};
}
