import {queueHook, flushPending, stateDirectory} from './runtime.mjs';
import {readSecret} from './vault.mjs';

let queued = false;
async function main() {
  const index = process.argv.indexOf('--thread');
  const folder = stateDirectory(index >= 0 ? process.argv[index + 1] : null);
  let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 1000000) throw Error('Hook input is too large'); }
  let input; try { input = JSON.parse(raw); } catch { throw Error('Actual native hook input is missing'); }
  await queueHook(folder, input);
  queued = true;
  await flushPending(folder, {readSecret, maximum: 1, timeoutMs: 1800});
  process.stdout.write('{}');
}
main().catch(() => {
  // Stop/Interrupt expect JSON. Do not surface private HTTP bodies or hook inputs.
  process.stdout.write(JSON.stringify({systemMessage: queued ? '得到大脑原生生命周期尚未收到服务器确认；已保留原事件，请核对本机连接和网站记录。' : '得到大脑原生生命周期未接入：本机保护配置缺失或事件身份不符，请核对当前真实对话绑定。'}));
  process.exitCode = 0;
});
