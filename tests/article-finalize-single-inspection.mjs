// Actual article-tools finalization, migrated SQLite/current execution gates,
// synthetic previously declared DOCX bytes. No external calls or renderer.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
import {hash,owner,native,operations} from './word-phase-pool-fixture.mjs';

const h=createSyntheticHarness({projectRoot:process.cwd()}),load=h.loader();
const format=load('article-format'),integrity=load('image-integrity');
let textParses=0,rasterChecks=0;
const parse=format.parseArticle;format.parseArticle=(...args)=>{textParses++;return parse(...args);};
const raster=integrity.assertRasterImage;integrity.assertRasterImage=(...args)=>{rasterChecks++;return raster(...args);};
const article=load('article-tools'),w=load('word-recovery'),p=load('word-progress'),op=operations(w,p);
const intake=load('articles');
const source=['Synthetic title','Synthetic body'];
const images=[
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=',
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=',
].map(value=>new Uint8Array(Buffer.from(value,'base64')));
const plan=images.map((bytes,index)=>({sha256:hash(bytes),source_url:'https://example.com/synthetic-'+index,source_title:'Synthetic image '+index,after_paragraph:index}));
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function word(text=source){
 const body=text.flatMap((paragraph,index)=>[
  '<w:p><w:r><w:t xml:space="preserve">'+escape(paragraph)+'</w:t></w:r></w:p>',
  '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId'+index+'"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
 ]).join('');
 return zipSync({
  '[Content_Types].xml':strToU8('<Types><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<Relationships><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'</w:body></w:document>'),
  'word/_rels/document.xml.rels':strToU8('<Relationships>'+images.map((_,index)=>'<Relationship Id="rId'+index+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image'+index+'.png"/>').join('')+'</Relationships>'),
  'word/media/image0.png':images[0],'word/media/image1.png':images[1],
 });
}
const row=job=>h.sql.prepare('SELECT * FROM articles WHERE owner=? AND id=?').get(job.owner,job.target_id);
async function fixture(label,{text=source,manifest=true}={}){
 const who=owner('finalize-'+label);
 const created=await intake.createArticle(who,new File([source.join('\n')],'synthetic.txt'));
 // Set only the ordinary uploaded→queued fixture state; dispatch is outside
 // this offline test. The actual claim tool must establish its own origin proof.
 h.sql.prepare("UPDATE articles SET state='queued' WHERE owner=? AND id=? AND state='uploaded'").run(who,created.id);
 const claimed=await article.articleCall(who,'claim_article',{article_id:created.id});
 assert.equal(claimed.claimed,true,'Actual fresh intake establishes the official claim origin; state='+claimed.state+' recovery='+JSON.stringify(claimed.recovery));
 const job={owner:who,target_kind:'article',target_id:created.id,claim_token:claimed.claim_token,input_sha256:hash(JSON.stringify(source)),execution_token:randomUUID(),execution_id:randomUUID(),request_key:randomUUID()};
 const bytes=word(text),when=new Date().toISOString(),sha=hash(bytes);
 const contract={contract_version:1,author:'synthetic',input_sha256:hash(JSON.stringify(source)),prompt_sha256:hash('synthetic-prompt'),original_sha256:hash(JSON.stringify(source)),sources_sha256:hash('[]'),sources:[],frozen_at:when,layout:{images:plan,sha256:hash(JSON.stringify(plan)),recorded_at:when}};
 const output_id=randomUUID(),key=`articles/${job.target_id}/output/${output_id}/0-${sha}`;
 const meta={output_id,size:bytes.length,sha256:sha,chunks:1,parts:[{key,sha256:sha,size:bytes.length}],bytes:bytes.length};
 h.sql.prepare('UPDATE articles SET artifact_manifest=?,result_meta=? WHERE owner=? AND id=?').run(manifest?JSON.stringify(contract):null,JSON.stringify(meta),job.owner,job.target_id);
 await h.bucket.put(key,bytes);
 // Official continuation adoption binds these previously declared synthetic
 // bytes. Image pixel-observation history is unrecorded; final manifest/raster
 // integrity and current serial execution permission still run unmodified.
 assert.equal((await op.acquire(job,'heavy')).acquired,true);
 return {job,bytes,meta,contract,args:{...native(job),output_id}};
}
const finalize=f=>article.articleCall(f.job.owner,'finalize_article_output',f.args);
try{
 const good=await fixture('good');textParses=rasterChecks=0;
 assert.equal((await finalize(good)).ready,true);
 assert.equal(textParses,1);assert.equal(rasterChecks,2);
 const saved=row(good.job),verification=JSON.parse(saved.result_meta).verification;
 assert.equal(saved.state,'word_ready');assert.equal(saved.result_key,`articles/${good.job.target_id}/result-${good.meta.sha256}.docx`);
 assert.deepEqual(Object.keys(verification).sort(),['original_sha256','layout_sha256','word_sha256','image_count','verified_at'].sort());
 assert.equal(verification.original_sha256,good.contract.original_sha256);assert.equal(verification.layout_sha256,good.contract.layout.sha256);assert.equal(verification.word_sha256,good.meta.sha256);assert.equal(verification.image_count,2);
 assert.deepEqual(h.objects.get(saved.result_key).bytes,good.bytes);
 const before=JSON.stringify(saved),puts=h.counts['bucket.put'];
 assert.equal((await finalize(good)).read_only,true);
 assert.equal(textParses,1);assert.equal(rasterChecks,2);assert.equal(h.counts['bucket.put'],puts);assert.equal(JSON.stringify(row(good.job)),before);
 console.log('PASS actual finalize parses once, checks every image, retains five-field receipt and exact bytes; finalized replay does no inspection/write');

 const strict=await fixture('strict',{text:['Synthetic title','Synthetic  body']});
 const strictBefore=JSON.stringify(row(strict.job)),strictPuts=h.counts['bucket.put'];textParses=rasterChecks=0;
 await assert.rejects(finalize(strict),/成稿文字与冻结原文不一致/);
 assert.equal(textParses,1);assert.equal(rasterChecks,0);assert.equal(JSON.stringify(row(strict.job)),strictBefore);assert.equal(h.counts['bucket.put'],strictPuts);
 console.log('PASS strict frozen whitespace corruption rejects despite correct part/full SHA, without output publication');

 const legacy=await fixture('no-manifest',{text:['Synthetic title','Synthetic  body'],manifest:false});textParses=rasterChecks=0;
 assert.equal((await finalize(legacy)).ready,true);assert.equal(textParses,1);assert.equal(rasterChecks,0);assert.equal(JSON.parse(row(legacy.job).result_meta).verification,null);
 console.log('PASS no-manifest path preserves original normalized-text compatibility and one parse');

 const race=await fixture('manifest-race'),raceBefore=row(race.job);
 h.on({method:'bucket.put',phase:'after',match:({key})=>key.startsWith(`articles/${race.job.target_id}/result-`),action:()=>{
  h.sql.prepare('UPDATE articles SET artifact_manifest=? WHERE owner=? AND id=?').run(JSON.stringify({...race.contract,synthetic_changed:true}),race.job.owner,race.job.target_id);
 }});
 await assert.rejects(finalize(race),/Task changed/);
 assert.equal(row(race.job).result_key,null);assert.equal(row(race.job).result_meta,raceBefore.result_meta);
 assert.equal(h.externalCalls,0);
 console.log('PASS changed frozen manifest before final CAS cannot become ready; actual execution/SQLite gates retained; external requests0');
}finally{h.close();}
