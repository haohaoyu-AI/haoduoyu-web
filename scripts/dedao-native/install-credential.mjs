import path from 'node:path';
import {atomicJson, readJson, stateDirectory, validateBinding, validateEndpoint} from './runtime.mjs';
import {writeSecret} from './vault.mjs';
import {readPrivateJsonLine} from './read-private-input.mjs';

// The caller forwards the private register response directly over process stdin.
// Never paste a bridge credential into the chat, shell command, or a text file.
async function main() {
  const input = await readPrivateJsonLine();
  const bridge = input.native_bridge;
  const binding = validateBinding({...bridge, turn_id: input.turn_id});
  const endpoint = validateEndpoint(input.endpoint || 'https://haoduoyu.xyz/api/dedao/native');
  if (!bridge || typeof bridge.credential !== 'string' || bridge.credential.length < 16 || !Number.isFinite(Date.parse(bridge.expires_at)) || Date.parse(bridge.expires_at) <= Date.now()) throw Error('Native registration credential is missing or expired');
  const folder = stateDirectory(binding.thread_id);
  try { const old = validateBinding(await readJson(path.join(folder, 'binding.json'))); if (old.thread_id !== binding.thread_id) throw Error('Do not replace another native binding'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (input.siwc_bypass_bearer_token !== undefined && (typeof input.siwc_bypass_bearer_token !== 'string' || input.siwc_bypass_bearer_token.length < 16 || /[\r\n]/.test(input.siwc_bypass_bearer_token))) throw Error('Existing Sites authorization is invalid');
  await writeSecret(path.join(folder, 'vault.json'), {...binding, endpoint, credential: bridge.credential, expires_at: bridge.expires_at, ...(input.siwc_bypass_bearer_token ? {siwc_bypass_bearer_token: input.siwc_bypass_bearer_token} : {})});
  await atomicJson(path.join(folder, 'binding.json'), binding);
  process.stdout.write(JSON.stringify({stored: true, thread_id: binding.thread_id, state_directory: folder}) + '\n');
}
main().catch(() => { process.stderr.write('Native registration could not be stored; preserve the original record and reconnect through MCP.\n'); process.exitCode = 1; });
