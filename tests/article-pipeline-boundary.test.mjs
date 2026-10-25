import test from 'node:test';
import assert from 'node:assert/strict';
import {pipelineInput,rethrowArticlePipelineConflict,validateArticleStatusQuery,validateArticleInputComplexity,seriesFromTitle} from '../src/article-pipeline-io.mjs';

test('pipeline constraint mapping recognizes only the two reviewed commit constraints',()=>{
  for(const key of ['matrix_articles.run_dir','matrix_articles.slot, matrix_articles.run_date'])
    for(const suffix of ['',': SQLITE_CONSTRAINT',': SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)'])
      for(const prefix of ['','D1_ERROR: '])assert.throws(()=>rethrowArticlePipelineConflict(new Error(prefix+'UNIQUE constraint failed: '+key+suffix)),
        error=>error.status===409&&error.code==='ARTICLE_PIPELINE_KEY_CONFLICT');
  const messages=['UNIQUE constraint failed: other.run_dir','UNIQUE constraint failed: matrix_articles.run_dir_extra',
    'UNIQUE constraint failed: matrix_articles.run_dir, other.id','UNIQUE constraint failed: matrix_articles.slot',
    'UNIQUE constraint failed: matrix_articles.run_dir: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)',
    'CHECK constraint failed: matrix_articles','network timeout: UNIQUE constraint failed: matrix_articles.run_dir'];
  for(const message of messages){const original=new Error(message);assert.throws(()=>rethrowArticlePipelineConflict(original),error=>error===original);}
  const known=Object.assign(new Error('UNIQUE constraint failed: matrix_articles.run_dir'),{status:503});
  assert.throws(()=>rethrowArticlePipelineConflict(known),error=>error===known);
});

test('status query duplicates fail and null lifecycle never silently becomes published',()=>{
  assert.throws(()=>validateArticleStatusQuery(new URLSearchParams('status=published&status=draft_saved')),error=>error.status===400);
  validateArticleStatusQuery(new URLSearchParams('status=draft_saved'));
  assert.throws(()=>pipelineInput({}, {status:null}, 'Synthetic'),error=>error.status===400);
  assert.equal(pipelineInput({status:'draft_saved'}, {status:null}, 'Synthetic').status,'draft_saved');
});

test('series inference fills only a missing/null value and preserves explicit values',()=>{
  const title='【保险200篇·第27篇】Synthetic';
  assert.equal(seriesFromTitle(title),27);
  assert.equal(pipelineInput({},null,title).series_no,27);
  assert.equal(pipelineInput({}, {series_no:9,status:'published'}, title).series_no,9);
  assert.equal(pipelineInput({series_no:null}, {series_no:9,status:'published'}, title).series_no,null);
  assert.equal(seriesFromTitle('【保险200篇·第9007199254740992篇】'),null);
});

test('deep parsed JSON is rejected before recursive hashing and serialization',()=>{
  const deep=JSON.parse('{"x":'.repeat(10000)+'0'+'}'.repeat(10000));
  assert.throws(()=>validateArticleInputComplexity({sample:deep}),error=>error.status===400);
  assert.throws(()=>validateArticleInputComplexity({unknown_ignored_key:deep}),error=>error.status===400);
  assert.throws(()=>pipelineInput({sample:deep},null,'Synthetic'),error=>error.status===400);
});
