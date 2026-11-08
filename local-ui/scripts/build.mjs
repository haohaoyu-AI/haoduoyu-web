import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {draftTransforms} from './draft-transforms.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root,'frontend');
const output = path.join(root,'build/site');
// Resolve the pinned project dependency, or an explicitly supplied existing install.
// This script never installs a dependency or silently chooses a different version.
const esbuildModule = process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild';
const {build, version} = await import(esbuildModule);
if (version !== '0.28.2') throw new Error('The verified interface build requires esbuild 0.28.2');
await fs.mkdir(output,{recursive:true});
const files = ['index.html','favicon.svg','manifest.webmanifest','tokens.css','style.css','memos.css','glass.css','workbench.css','mobile.css','sw-update.css','offline.css','review.css'];
const hashes = {};
for (const file of files) {
  const bytes = await fs.readFile(path.join(src,'public',file));
  await fs.writeFile(path.join(output,file),bytes);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
}
const overrides = {
  'core/api.mjs':'local/client.mjs',
  'offline/runtime.mjs':'local/runtime.mjs'
};
const transforms = [
  ...draftTransforms,
  // Both standalone hosts currently block downloads. Report that before creating a Blob;
  // never present a download attempt as a saved backup or clear retained drafts.
  ['daily-notes-controller.mjs', "import {api, apiNetwork} from './core/api.mjs';", "import {api, apiNetwork} from './core/api.mjs';\nimport {toast} from './ui/toast.mjs';"],
  ['daily-notes-controller.mjs', 'async function exportDraftArchive() {', 'async function exportDraftArchive() {\n  return toast("当前版本暂不支持文件导出，草稿仍保留。",true);'],
  ['daily-notes-controller.mjs', 'function exportLegacyDraft(item, category) {', 'function exportLegacyDraft(item, category) {\n  return toast("当前版本暂不支持文件导出，草稿仍保留。",true);'],
  ['memos-controller.mjs', 'durable: true,', 'durable: true, online: () => true,'],
  ['pages/unscheduled-todos.mjs', '勾选完成后移至今日待办（需联网）；也可选择日期移动。', '勾选完成后移至今日待办；也可选择日期移动。'],
  ['controller.mjs', '后台会自动同步；如有冲突，可在这里查看和处理。', '内容只保存在本机，不会上传网站。'],
  ['offline/ui.mjs', "const title = textNode(document, 'h2', '同步状态');", "const title = textNode(document, 'h2', '本机保存状态');"],
  ['offline/ui.mjs', "details.append(textNode(document, 'h3', '待提交队列'));", "details.append(textNode(document, 'p', '这是独立本机版本，没有线上同步或上传。'));"],
];
const applied = [];
await build({absWorkingDir:path.dirname(root),entryPoints:[path.join(src,'web/local/main.mjs')],outfile:path.join(output,'app.js'),bundle:true,
  format:'esm',platform:'browser',target:'chrome91',minify:false,metafile:true,
  plugins:[{name:'standalone-local-data-only',setup(builder) {
    builder.onResolve({filter:/\.mjs$/}, args => {
      if (!args.importer) return;
      const absolute = path.resolve(args.resolveDir,args.path);
      for (const [original,replacement] of Object.entries(overrides))
        if (absolute === path.join(src,'web',original)) return {path:path.join(src,'web',replacement)};
    });
    builder.onLoad({filter:/\.mjs$/}, async args => {
      const relative = path.relative(path.join(src,'web'),args.path).replaceAll(path.sep,'/');
      const patches = transforms.filter(([file]) => file === relative);
      if (!patches.length) return;
      let contents = await fs.readFile(args.path,'utf8');
      for (const [file,before,after] of patches) {
        if (!contents.includes(before) || contents.indexOf(before) !== contents.lastIndexOf(before))
          throw new Error('Expected exactly one nonvisual adapter patch: '+file+' '+before);
        contents = contents.replace(before,after); applied.push({file,before,after});
      }
      return {contents,loader:'js'};
    });
  }}]
}).then(async result => {
  await fs.writeFile(path.join(root,'build/bundle-inputs.json'),JSON.stringify(result.metafile,null,2));
});
const bundle = await fs.readFile(path.join(output,'app.js'),'utf8');
if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\.register\(\s*["']\/sw/.test(bundle))
  throw new Error('Unexpected network transport in standalone bundle');
await fs.writeFile(path.join(root,'build/manifest.json'),JSON.stringify({build:'standalone-original-interface',
  sourceBaseline:'b752bfe', originalShell:'9ee30aaf90e1117f092292da432619cecbc62abd63443b5bd4c8b06d92e9d59a',
  unchangedAssets:hashes, scriptSha256:crypto.createHash('sha256').update(bundle).digest('hex'),
  sourceAliases:overrides, nonvisualSemanticPatches:applied,networkTransportIncluded:false},null,2));
console.log('Built local-only original interface:',output);
