import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {saveExecution} from './runtime.mjs';
export const mcpURL='https://xiaoyu-event-test.haohaoyu202409.chatgpt.site/mcp';
export const defaultWorkDir=()=>path.resolve(process.env.DEDAO_WORK_DIR||path.join(homedir(),'.haoduoyu-dedao'));
export async function loadConfiguration(){const workDir=defaultWorkDir();let c={};try{c=JSON.parse(await fs.readFile(path.join(workDir,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本机配置不可读，请保留原文件后检查');}
 const fields={DEDAO_MCP_URL:'mcp_url',DEDAO_CODEX_BIN:'codex_bin',DEDAO_DOWNLOAD_DIR:'download_dir',DEDAO_CHROME_PROFILE:'chrome_profile',DEDAO_CDP_URL:'cdp_url'};for(const [env,key] of Object.entries(fields))if(!process.env[env]&&typeof c[key]==='string')process.env[env]=c[key];process.env.DEDAO_MCP_URL||=mcpURL;return c;}
export function cdpFromContents(contents){const [line,route]=contents.trim().split(/\r?\n/),port=Number(line);if(!Number.isInteger(port)||port<1||port>65535||route&&!/^\/devtools\/browser(?:\/[A-Za-z0-9-]+)?$/.test(route))throw Error('Chrome 调试记录无效');return `ws://127.0.0.1:${port}${route||'/devtools/browser'}`;}
export async function discoverCdp(profile){try{return cdpFromContents(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export function chromeProfiles(){const base=process.env.LOCALAPPDATA;if(process.platform==='win32')return [process.env.DEDAO_CHROME_PROFILE,base&&path.join(base,'Google','Chrome','User Data'),base&&path.join(base,'Chromium','User Data'),base&&path.join(base,'Microsoft','Edge','User Data')].filter(Boolean);return [process.env.DEDAO_CHROME_PROFILE,process.platform==='darwin'?path.join(homedir(),'Library','Application Support','Google','Chrome'):path.join(homedir(),'.config','google-chrome')].filter(Boolean);}
export const codexAvailable=file=>{if(!file||/\.(cmd|bat)$/i.test(file))return false;const result=spawnSync(file,['--version'],{encoding:'utf8',timeout:10000,windowsHide:true});return result.status===0&&/^codex-cli\s+\d+\.\d+(?:\.\d+)?(?:\S*)\s*$/m.test(result.stdout||'');};
const executable=codexAvailable;
export async function resolveCodexCandidate(file,{windows=process.platform==='win32'}={},seen=new Set()){
 if(!file||/\.(cmd|bat|js)$/i.test(file)||seen.size>4||seen.has(file))return null;seen.add(file);
 if(windows){
  try{file=await fs.realpath(file);}catch{return null;}
  try{const shim=await fs.readFile(file.replace(/\.exe$/i,'.shim'),'utf8'),target=shim.match(/^\s*path\s*=\s*"([^"]+)"\s*$/m),args=shim.match(/^\s*args\s*=\s*(.*)$/m);if(!target||args&&args[1].trim()!== '""')return null;return resolveCodexCandidate(target[1],{windows},seen);}catch(e){if(e.code!=='ENOENT')return null;}
  // Known EXE shims create a different child PID. Never record their exit as
  // Codex exit; reuse the package's native binary or install official CLI.
  if(/(?:^|[\\/])shims(?:[\\/]|$)|[\\/]WindowsApps[\\/][^\\/]+\.exe$|[\\/]Volta[\\/]bin[\\/]/i.test(file))return null;
 }
 return executable(file)?file:null;
}
async function searchNative(root,depth=0,budget={n:0}){if(depth>7||budget.n++>1500)return null;let entries;try{entries=await fs.readdir(root,{withFileTypes:true});}catch{return null;}for(const e of entries)if(e.isFile()&&e.name.toLowerCase()==='codex.exe'){const file=await resolveCodexCandidate(path.join(root,e.name));if(file)return file;}for(const e of entries)if(e.isDirectory()){const found=await searchNative(path.join(root,e.name),depth+1,budget);if(found)return found;}return null;}
export async function findCodex(){
 for(const file of [process.env.DEDAO_CODEX_BIN,process.env.CODEX_CLI_PATH]){const found=await resolveCodexCandidate(file);if(found)return found;}if(process.platform!=='win32')return executable('codex')?'codex':null;
 const names=spawnSync('where.exe',['codex'],{encoding:'utf8',windowsHide:true}).stdout?.trim().split(/\r?\n/).filter(Boolean)||[];for(const candidate of names){const found=await resolveCodexCandidate(candidate);if(found)return found;}
 const roots=[path.join(defaultWorkDir(),'codex-runtime','node_modules','@openai'),process.env.APPDATA&&path.join(process.env.APPDATA,'npm','node_modules','@openai'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'OpenAI','Codex','bin'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','OpenAI','Codex','bin'),...names.map(c=>path.join(path.dirname(c),'node_modules','@openai'))];
 const app=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-AppxPackage '*Codex*' | Select-Object -ExpandProperty InstallLocation"],{encoding:'utf8',windowsHide:true,timeout:10000});roots.push(...(app.stdout?.trim().split(/\r?\n/).filter(Boolean)||[]));
 for(const root of new Set(roots.filter(Boolean))){for(const sub of ['app/resources/codex.exe','resources/codex.exe']){const file=await resolveCodexCandidate(path.join(root,sub));if(file)return file;}const found=await searchNative(root);if(found)return found;}return null;
}
export async function ensureCodexLogin(bin,notify=console.log){if(spawnSync(bin,['login','status'],{stdio:'ignore',timeout:10000}).status===0)return;notify('需要你确认：Codex 尚未登录。请按现有 Codex 登录窗口完成账号授权，不用填写 API key。');await new Promise((resolve,reject)=>{const child=spawn(bin,['login'],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Codex 登录未完成')));});if(spawnSync(bin,['login','status'],{stdio:'ignore',timeout:10000}).status!==0)throw Error('Codex 登录尚未确认');}
export async function prepareConfiguration({notify=console.log}={}){
 const previous=await loadConfiguration(),workDir=defaultWorkDir();await fs.mkdir(workDir,{recursive:true,mode:0o700});let bin=await findCodex();if(!bin){
  notify('未找到现有 Codex CLI，正在当前用户目录安装官方 CLI；现有 Codex 配置和模型保持原样。');const cli=process.env.npm_execpath||process.env.DEDAO_NPM_CLI||path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');await fs.access(cli);const r=await fetch('https://registry.npmjs.org/@openai/codex/latest');if(!r.ok)throw Error('官方 Codex 安装信息读取失败');const metadata=await r.json();if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(metadata.version))throw Error('官方 Codex 版本无法确认');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,'install','--prefix',path.join(workDir,'codex-runtime'),'--save-exact','--ignore-scripts','@openai/codex@'+metadata.version],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('官方 Codex CLI 安装未成功')));});bin=await findCodex();
 }if(!bin)throw Error('未找到原生 Codex 执行文件，请检查官方 CLI 安装结果');process.env.DEDAO_CODEX_BIN=bin;await ensureCodexLogin(bin,notify);
 let profile=process.env.DEDAO_CHROME_PROFILE,endpoint=process.env.DEDAO_CDP_URL;const explicit=!!endpoint&&!profile;
 if(!explicit){endpoint=undefined;notify('正在检查已有浏览器。若尚未允许连接，请在已登录得到的 Edge 打开 edge://inspect/#remote-debugging（Chrome 使用 chrome://inspect/#remote-debugging），勾选允许远程调试，并在稍后弹窗点击“允许”。本程序会自动继续。');
  const deadline=Date.now()+15*60*1000;while(Date.now()<deadline){for(const candidate of chromeProfiles()){const found=await discoverCdp(candidate);if(found){profile=candidate;endpoint=found;break;}}if(endpoint)break;await new Promise(r=>setTimeout(r,2000));}
  if(!endpoint)throw Error('仍未发现浏览器连接；请保留本窗口说明，确认当前 Edge/Chrome 支持并已允许远程调试');
 }
 const downloadDir=path.resolve(process.env.DEDAO_DOWNLOAD_DIR||path.join(workDir,'downloads'));await fs.mkdir(downloadDir,{recursive:true});const config={...previous,mcp_url:process.env.DEDAO_MCP_URL,codex_bin:bin,chrome_profile:profile||undefined,cdp_url:explicit?endpoint:undefined,download_dir:downloadDir};
 process.env.DEDAO_CDP_URL=endpoint;if(profile)process.env.DEDAO_CHROME_PROFILE=profile;process.env.DEDAO_DOWNLOAD_DIR=downloadDir;await saveExecution(path.join(workDir,'config.json'),config);return {workDir,downloadDir,config};
}
