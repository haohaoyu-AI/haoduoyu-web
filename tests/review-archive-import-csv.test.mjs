import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {buildArchiveImportPages,parseArchiveCsv,writeArchiveImportPages} from '../scripts/review-archive-import-csv.mjs';

const collected = '2026-11-10T09:00:00+08:00';
const scope = {account:'V字',platform:'toutiao',kind:'micro',collected_at:collected,from:null,to:null};
const directory = {kind:'directory',source:'synthetic-export',scope,mapping:{
  record:{published_title:'发布标题',publication_status:{column:'状态',values:{'已发':'published'}}},
  references:[{kind:'publication',columns:{platform_id:'文章编号'}}],
}};
const source = '\uFEFF文章编号,发布标题,状态\r\n0000123,"合成 ""引号""\n段落",已发\r\n';

test('explicit CSV mapping retains quoted cells and platform-number text while producing stable checkpoints',()=>{
  const parsed = parseArchiveCsv(source);
  assert.deepEqual(parsed.rows,[['0000123','合成 "引号"\n段落','已发']]);
  const first = buildArchiveImportPages(source,directory);
  assert.deepEqual(first,buildArchiveImportPages(source,directory));
  assert.deepEqual(first[0].rows[0].refs,[{kind:'publication',platform_id:'0000123'}]);
  assert.equal(first[0].rows[0].record.publication_status,'published');
  assert.equal(first[0].scope.collected_at,'2026-11-10T01:00:00.000Z');
  assert.equal(first[0].coverage.whole_scope,false);
  assert.throws(()=>parseArchiveCsv('field,field\na,b'),{code:'CSV_HEADERS'});
  assert.throws(()=>buildArchiveImportPages(source,{...directory,whole_scope:true,total_rows:2}),{code:'CONFIG_COVERAGE'});
  assert.throws(()=>buildArchiveImportPages(source,{...directory,scope:{...scope,account:'another'}}),{code:'CONFIG_SCOPE'});
});

test('metric adapter preserves zero and unknown, converts explicitly named units and requires real collection times',()=>{
  const metrics = {kind:'metrics',source:'synthetic-metrics',scope,mapping:{
    references:[{kind:'publication',columns:{platform_id:'编号'}}],
    snapshot:{observed_at:'采集时刻',metrics:{reads:{column:'阅读',format:'grouped-number'},
      ctr:{column:'点击率',format:'ratio'},comments:{column:'评论',values:{'未知':null}}}},
  }};
  const csv = '编号,采集时刻,阅读,点击率,评论\n000901,2026-11-09T13:00:00+08:00,0,0.034,未知';
  const [page] = buildArchiveImportPages(csv,metrics);
  assert.deepEqual(page.rows[0].snapshot.metrics,{reads:0,ctr:3.4,comments:null});
  assert.equal(page.rows[0].snapshot.observed_at,'2026-11-09T05:00:00.000Z');
  assert.throws(()=>buildArchiveImportPages(csv.replace('2026-11-09T13:00:00+08:00','2026-11-09'),metrics),{code:'CSV_OBSERVATION_TIME'});
  assert.throws(()=>buildArchiveImportPages(csv.replace('2026-11-09T13:00:00+08:00','2026-11-11T13:00:00+08:00'),metrics),{code:'CSV_OBSERVATION_TIME'});
});

test('local CSV pages are bounded and written only into a new private directory outside Git',async t=>{
  const folder = await mkdtemp(join(tmpdir(),'archive-csv-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const csv = join(folder,'synthetic.csv'), mapping = join(folder,'mapping.json'), output = join(folder,'archive-pages');
  const raws = ['文章编号,发布标题,状态',...Array.from({length:9},(_,i)=>`0000${i},合成标题${i},已发`)].join('\n');
  await Promise.all([writeFile(csv,raws),writeFile(mapping,JSON.stringify({...directory,whole_scope:true,total_rows:9}))]);
  await writeArchiveImportPages({csv,mapping,output});
  assert.equal((await stat(output)).mode&0o777,0o700);
  assert.equal((await stat(join(output,'page-0001.json'))).mode&0o777,0o600);
  const manifest = JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.pages,['page-0001.json','page-0002.json']);
  const last = JSON.parse(await readFile(join(output,'page-0002.json'),'utf8'));
  assert.equal(last.rows.length,1);
  assert.deepEqual(last.coverage,{last_page:true,whole_scope:true,total_rows:9});
  assert.equal(last.run_id,manifest.run_id);
  await assert.rejects(writeArchiveImportPages({csv,mapping,output}),{code:'EEXIST'});
  const fakeRepo = join(folder,'synthetic-root');
  await mkdir(fakeRepo);
  await mkdir(join(fakeRepo,'.git'));
  await writeFile(join(fakeRepo,'.git','HEAD'),'ref: refs/heads/main\n');
  await assert.rejects(writeArchiveImportPages({csv,mapping,output:join(fakeRepo,'blocked')}),{code:'OUTPUT_NOT_PRIVATE'});
});

test('local adapter suppresses raw mapped values and paths from process output',async t=>{
  const folder = await mkdtemp(join(tmpdir(),'archive-csv-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const csv = join(folder,'fixture.csv'), mapping = join(folder,'mapping.json');
  const script = fileURLToPath(new URL('../scripts/review-archive-import-csv.mjs',import.meta.url));
  const run = (output)=>promisify(execFile)(process.execPath,[script,'--csv',csv,'--mapping',mapping,'--output',output]);
  await Promise.all([writeFile(csv,source),writeFile(mapping,JSON.stringify(directory))]);
  const pass = await run(join(folder,'valid-pages'));
  assert.equal(pass.stdout,'');
  assert.equal(pass.stderr,'');
  await writeFile(csv,source.replace('已发','UNMAPPED_SYNTHETIC_PRIVATE_VALUE'));
  await assert.rejects(run(join(folder,'invalid-pages')),error=>{
    assert.equal(error.stdout,'');
    assert.equal(error.stderr,'CSV_VALUE_UNMAPPED\n');
    return true;
  });
});
