import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewCollection,REVIEW_PAGE_AHEAD} from '../web/review-controller.mjs';

function source(total,{revision=7,changeAt=null}={}) {
  const calls=[];
  const read=async path=>{
    const url=new URL(path,'http://x'),offset=Number(url.searchParams.get('offset'));calls.push(offset);
    const items=Array.from({length:Math.max(0,Math.min(100,total-offset))},(_,i)=>({id:offset+i,article_id:1}));
    return {items,has_more:total>offset+100,read_revision:changeAt!==null&&offset>=changeAt?revision+1:revision};
  };
  return {read,calls};
}

test('later review pages are fetched together and the result matches a page-by-page read',async()=>{
  for(const total of [0,40,100,101,250,300,301,700]) {
    const {read,calls}=source(total),result=await readReviewCollection(read,'snapshots','V字');
    assert.deepEqual(result.items.map(row=>row.id),Array.from({length:total},(_,i)=>i),String(total));
    assert.equal(result.read_revision,7);
    const pages=Math.max(1,Math.ceil(total/100));
    assert.ok(calls.length<pages+REVIEW_PAGE_AHEAD,'at most one batch of extra requests');
  }
});

test('a changed revision on any later page still fails instead of mixing two versions',async()=>{
  const {read}=source(350,{changeAt:200});
  await assert.rejects(readReviewCollection(read,'snapshots','V字'),error=>error.code==='READ_REVISION_CHANGED');
});

test('later pages carry the first page revision',async()=>{
  const paths=[];
  await readReviewCollection(async path=>{paths.push(path);const offset=Number(new URL(path,'http://x').searchParams.get('offset'));
    return {items:offset<200?Array.from({length:100},(_,i)=>({id:offset+i})):[],has_more:offset<100,read_revision:3};},'snapshots','V字');
  assert.ok(paths.slice(1).every(path=>path.endsWith('&read_revision=3')));
});
