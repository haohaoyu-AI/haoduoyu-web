import { stdin, stdout } from 'node:process';
import { openDatabase } from '../src/db.mjs';
import { createUser, hashPassword, audit } from '../src/auth.mjs';

async function secret(label) {
  stdout.write(label);
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data',onData); stdout.write('\n'); };
    const onData = input => {
      for (const character of input) {
        if (character === '\u0003') { finish(); reject(new Error('已取消')); return; }
        if (character === '\r' || character === '\n') { finish(); resolve(value); return; }
        if (character === '\u007f' || character === '\b') { value = [...value].slice(0,-1).join(''); continue; }
        if (character >= ' ') value += character;
      }
    };
    stdin.on('data',onData);
  });
}
try {
  const [command, flag, username, ...extra] = process.argv.slice(2);
  if (!['create','reset-password'].includes(command) || flag !== '--username' || !username || extra.length)
    throw new Error('用法：npm run admin -- create|reset-password --username ACCOUNT；密码从标准输入读取');
  let password;
  if (stdin.isTTY) {
    password = await secret('请输入密码（至少12字符，输入不回显）：');
    if (password !== await secret('请再次输入密码：')) throw new Error('两次密码不同');
  } else {
    let input = '';
    for await (const part of stdin) { input += part; if (input.length > 2048) throw new Error('输入过长'); }
    const lines = input.replace(/\r/g,'').replace(/\n+$/,'').split('\n');
    password = lines[0];
    if (lines.length > 2 || lines.length === 2 && lines[1] !== password) throw new Error('密码确认不一致');
  }
  const db = openDatabase();
  try {
    if (command === 'create') {
      const user = await createUser(db,username,password);
      audit(db,'local-admin','user.created',user.id);
    } else {
      const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
      if (!user) throw new Error('账号不存在');
      const hash = await hashPassword(password);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        audit(db,'local-admin','user.password_reset',user.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    stdout.write(command === 'create' ? '管理员已创建。\n' : '密码已重置，该账号的登录会话已注销。\n');
  } finally { db.close(); }
} catch (error) {
  console.error(error.code?.startsWith('ERR_SQLITE') ? '数据库操作失败，请检查账号是否已存在。' : error.message);
  process.exitCode = 1;
}
