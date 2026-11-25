// Local frontend preview with synthetic in-memory API reads. No Worker, D1 or external calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {cockpitFixture,cockpitNow} from './cockpit-trends-fixture.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const root = resolve('public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json','.png':'image/png'};
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  if (url.pathname.startsWith('/api/v1/')) {
    let data = [];
    if (url.pathname === '/api/v1/auth/me') data = {id:'synthetic-chart-owner',username:'本地合成验收',publicBusiness:true};
    else if (url.pathname === '/api/v1/workbench-snapshot/index') {
      const rows = Object.fromEntries(['todos','life_notes','work_notes','work_reminders','memo_groups','memos','unscheduled_todos','note_labels']
        .map(key => [key,[]]));
      data = projectWorkbenchSnapshot(rows,{scope_id:'4'.repeat(64),generated_at:cockpitNow,date:null,
        version:url.searchParams.get('version') === '2' ? 2 : 1},snapshotBudget());
    }
    else if (url.pathname === '/api/v1/accounts') data = [{id:'synthetic-account',platform:'toutiao',name:'V字'}];
    else if (url.pathname.startsWith('/api/v1/review/')) data = {
      items:cockpitFixture[url.pathname.slice('/api/v1/review/'.length)] || [],has_more:false,read_revision:1};
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({data})); return;
  }
  if (url.pathname === '/__clock.js') {
    res.writeHead(200,{'Content-Type':'text/javascript'});
    res.end(`const NativeDate=Date;globalThis.Date=class extends NativeDate {
      constructor(...args){super(...(args.length?args:[${JSON.stringify(cockpitNow)}]));}
      static now(){return NativeDate.parse(${JSON.stringify(cockpitNow)});}};`); return;
  }
  if (url.pathname === '/__frame') {
    const width = [375,390,1440].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 390;
    const height = width === 1440 ? 1100 : 844;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<html><head><title>合成驾驶舱验收 · ${width}px</title></head><body style="margin:0;background:#fff">
      <iframe title="合成驾驶舱验收" style="display:block;width:${width}px;height:${height}px;border:0"
      src="/?page=review&account=V%E5%AD%97&review_section=cockpit"></iframe></body></html>`); return;
  }
  const path = resolve(root,'.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try {
    let body = await readFile(path);
    if (path.endsWith('/index.html')) body = body.toString().replace('<head>','<head><script src="/__clock.js"></script>');
    res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT) || 8947;
server.listen(port,'127.0.0.1',() => console.log(`SYNTHETIC_COCKPIT http://localhost:${port}`));
