import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {atomicJson, defaultStateRoot} from './runtime.mjs';

function runPowerShell(script, input, stage = 'operation') {
  return new Promise((resolve, reject) => {
    // EncodedCommand carries only this fixed script, never the secret input. It
    // avoids Windows native argument quote changes in ACL enum strings.
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(Error('Windows protected credential storage is unavailable')));
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(Error(`Windows protected credential storage failed (${stage})`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function withinProtectedRoot(file) {
  const relative = path.relative(defaultStateRoot(), path.resolve(file));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Credential storage must stay inside the native local protected directory');
}
export async function writeSecret(file, data) {
  if (process.platform !== 'win32') throw Error('This native bridge requires Windows CurrentUser DPAPI');
  withinProtectedRoot(file);
  await fs.mkdir(path.dirname(file), {recursive: true});
  // Credentials cross the child boundary only on stdin. No command argument,
  // environment variable, browser, log or generated hook definition contains them.
  const ciphertext = await runPowerShell('Add-Type -AssemblyName System.Security;$bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Convert]::ToBase64String($protected))', JSON.stringify(data), 'DPAPI protect');
  await atomicJson(file, {version: 1, format: 'dpapi-current-user', ciphertext});
  await runPowerShell('$ErrorActionPreference="Stop";$p=[Console]::In.ReadToEnd();$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,"FullControl","ContainerInherit,ObjectInherit","None","Allow");$acl.AddAccessRule($rule);[IO.Directory]::SetAccessControl($p,$acl)', path.dirname(file), 'directory ACL');
}
export async function readSecret(file) {
  if (process.platform !== 'win32') throw Error('This native bridge requires Windows CurrentUser DPAPI');
  withinProtectedRoot(file);
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  if (record.format !== 'dpapi-current-user' || typeof record.ciphertext !== 'string') throw Error('Native credential vault protection is invalid');
  const plain = await runPowerShell('Add-Type -AssemblyName System.Security;$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd());$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($plain))', record.ciphertext, 'DPAPI unprotect');
  try { return JSON.parse(plain); } catch { throw Error('Native credential vault cannot be read by this Windows account'); }
}
