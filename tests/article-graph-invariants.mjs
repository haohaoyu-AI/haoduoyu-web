import assert from 'node:assert/strict';

const graph=Object.freeze({
  matrix_articles:['id','account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes','version','created_at','updated_at'],
  matrix_observations:['id','article_id','as_of','collected_at','kind','metrics_json','source','note','created_at'],
  matrix_daily_metrics:['id','account_id','article_id','date','metrics_json','source','updated_at'],
});
const tableNames=[...Object.keys(graph),'matrix_accounts','matrix_users','matrix_todos','matrix_todo_templates',
  'matrix_todo_template_links','matrix_todo_preferences','matrix_daily_notes','matrix_sessions','matrix_api_keys',
  'matrix_audit','matrix_idempotency','matrix_login_attempts','matrix_control'].sort();
const pipelineFields=['status','slot','run_dir','run_date','series_no','writer','illustrator','sample_json',
  'char_count','subheading_count','image_count','cover_desc','draft_ref_json','timings_json','reruns_json','blockers_json','verify_items_json'];
const integerFields=new Set(['series_no','char_count','subheading_count','image_count']);
const oldIndexes={
  matrix_articles:['matrix_article_url','matrix_article_platform_id','matrix_article_account_date'],
  matrix_observations:['matrix_observation_article_time'],
  matrix_daily_metrics:['matrix_daily_account_day','matrix_daily_article_day'],
};
const rowidAlias='__graph_rowid__';
const quote=name=>'"'+String(name).replaceAll('"','""')+'"';
const compare=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
const sorted=items=>[...items].sort(compare);
const identifier=token=>token?.kind==='word'||token?.kind==='identifier';

// A fail-closed lexical canonicalizer, not a general SQL equivalence engine.
// Identifier quoting/case and formatting may change after a table rename;
// single-quoted string contents must remain exact (including whitespace).
function tokens(sql) {
  const result=[];
  for(let i=0;i<sql.length;) {
    const char=sql[i];
    if(/\s/.test(char)){i++;continue;}
    if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
    if(sql.startsWith('/*',i)) {
      const end=sql.indexOf('*/',i+2);assert.notEqual(end,-1,'Unterminated SQL comment');i=end+2;continue;
    }
    if(char==="'"||char==='"'||char==='`'||char==='[') {
      const endChar=char==='['?']':char;let value='',closed=false;i++;
      while(i<sql.length) {
        if(sql[i]===endChar) {
          if(sql[i+1]===endChar){value+=endChar;i+=2;continue;}
          i++;closed=true;break;
        }
        value+=sql[i++];
      }
      assert.ok(closed,'Unterminated SQL quoted token');
      result.push({kind:char==="'"?'string':'identifier',value:char==="'"?value:value.toLowerCase()});continue;
    }
    const word=/^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if(word){result.push({kind:'word',value:word[0].toLowerCase()});i+=word[0].length;continue;}
    const number=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
    if(number){result.push({kind:'number',value:number[0]});i+=number[0].length;continue;}
    result.push({kind:'symbol',value:char});i++;
  }
  return result;
}
function enclosingEnd(list,start=0) {
  assert.equal(list[start]?.value,'(');let depth=0;
  for(let i=start;i<list.length;i++)if(list[i].kind==='symbol') {
    if(list[i].value==='(')depth++;
    if(list[i].value===')'&&--depth===0)return i;
  }
  assert.fail('Unbalanced SQL parentheses');
}
function expression(list,table) {
  let clean=list.filter(token=>token.value!==';'||token.kind!=='symbol');
  clean=clean.filter((token,index)=>!(identifier(token)&&token.value===table&&clean[index+1]?.value==='.')&&
    !(token.value==='.'&&identifier(clean[index-1])&&clean[index-1].value===table));
  while(clean[0]?.value==='('&&enclosingEnd(clean)===clean.length-1)clean=clean.slice(1,-1);
  return JSON.stringify(clean.map(token=>[identifier(token)?'identifier':token.kind,token.value]));
}
function checks(sql,table) {
  const list=tokens(sql),result=[];
  for(let i=0;i<list.length;i++)if(list[i].kind==='word'&&list[i].value==='check'&&list[i+1]?.value==='(') {
    const end=enclosingEnd(list,i+1);result.push(expression(list.slice(i+2,end),table));i=end;
  }
  return result.sort();
}
function tableOptions(sql) {
  const list=tokens(sql),start=list.findIndex(token=>token.kind==='symbol'&&token.value==='(');
  assert.notEqual(start,-1,'Missing CREATE TABLE body');
  return expression(list.slice(enclosingEnd(list,start)+1),'');
}
function predicate(sql,table) {
  if(sql===null)return null;
  const list=tokens(sql);let depth=0;
  for(let i=0;i<list.length;i++) {
    if(list[i].kind==='symbol'&&list[i].value==='(')depth++;
    if(list[i].kind==='symbol'&&list[i].value===')')depth--;
    if(depth===0&&list[i].kind==='word'&&list[i].value==='where')return expression(list.slice(i+1),table);
  }
  return null;
}
function normalizeForeignKeys(rows) {
  const groups=new Map();
  for(const row of rows) {
    if(!groups.has(row.id))groups.set(row.id,[]);
    groups.get(row.id).push(row);
  }
  return sorted([...groups.values()].map(group=>{
    group.sort((a,b)=>a.seq-b.seq);const first=group[0];
    for(const row of group)for(const key of ['table','on_update','on_delete','match'])assert.equal(row[key],first[key]);
    return {table:first.table.toLowerCase(),on_update:first.on_update.toUpperCase(),on_delete:first.on_delete.toUpperCase(),
      match:first.match.toUpperCase(),columns:group.map(row=>({from:row.from,to:row.to}))};
  }));
}
function indexMeaning(index) {
  return {name:index.origin==='c'?index.name:null,unique:index.unique,origin:index.origin,partial:index.partial,
    xinfo:index.xinfo.map(row=>({seqno:row.seqno,cid:row.name===null?row.cid:null,name:row.name,
      desc:row.desc,coll:row.coll?.toUpperCase()??null,key:row.key})),where:index.where};
}
function columnMeaning(column) {
  return {name:column.name,type:column.type.toUpperCase().trim(),notnull:column.notnull,pk:column.pk,
    default:column.dflt_value===null?null:expression(tokens(column.dflt_value),'')};
}
function hasAll(actual,expected,message) {
  const remaining=[...actual];
  for(const item of expected) {
    const key=JSON.stringify(item),index=remaining.findIndex(candidate=>JSON.stringify(candidate)===key);
    assert.notEqual(index,-1,message);remaining.splice(index,1);
  }
  return remaining;
}
async function all(db,sql) {
  const result=await db.prepare(sql).all();assert.ok(Array.isArray(result.results),'Expected D1 result rows');return result.results;
}

export async function captureGraphState(db) {
  const schema=await all(db,"SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger','view') ORDER BY type,name");
  const matrixTables=schema.filter(row=>row.type==='table'&&row.name.startsWith('matrix_')).map(row=>row.name).sort();
  assert.deepEqual(matrixTables,tableNames,'Unexpected matrix table inventory');
  const tables={};
  for(const name of matrixTables) {
    const sql=schema.find(row=>row.type==='table'&&row.name===name).sql;
    const columns=await all(db,`PRAGMA table_info(${quote(name)})`);
    assert.ok(columns.length>0);assert.ok(!columns.some(column=>column.name===rowidAlias),'Reserved capture alias collision');
    const rows=await all(db,`SELECT CAST(rowid AS TEXT) AS ${quote(rowidAlias)},${columns.map(column=>quote(column.name)).join(',')} FROM ${quote(name)} ORDER BY rowid`);
    const rawIndexes=await all(db,`PRAGMA index_list(${quote(name)})`),indexes=[];
    for(const index of rawIndexes) {
      const indexSql=schema.find(row=>row.type==='index'&&row.name===index.name)?.sql??null;
      indexes.push({name:index.name,unique:index.unique,origin:index.origin,partial:index.partial,
        xinfo:await all(db,`PRAGMA index_xinfo(${quote(index.name)})`),where:predicate(indexSql,name),sql:indexSql});
    }
    tables[name]={sql,columns,rows,checks:checks(sql,name),indexes,tableOptions:tableOptions(sql),
      foreignKeys:normalizeForeignKeys(await all(db,`PRAGMA foreign_key_list(${quote(name)})`)),
      foreignKeyTiming:tokens(sql).filter(token=>token.kind==='word'&&['deferrable','initially','deferred','immediate'].includes(token.value)).map(token=>token.value),
      objects:schema.filter(row=>row.tbl_name===name)};
  }
  return {tableNames:matrixTables,tables};
}

export function assertGraphPreserved(before,after,{pipelineAdded=false}={}) {
  assert.deepEqual(before.tableNames,tableNames);assert.deepEqual(after.tableNames,tableNames);
  for(const name of tableNames) {
    const old=before.tables[name],current=after.tables[name];
    if(!Object.hasOwn(graph,name)) {
      assert.deepEqual(current,old,`${name}: unrelated data/schema changed`);continue;
    }
    const originalColumns=graph[name];
    assert.deepEqual(old.columns.map(column=>column.name),originalColumns,`${name}: source column contract`);
    const currentOriginal=current.columns.filter(column=>originalColumns.includes(column.name));
    assert.deepEqual(currentOriginal.map(column=>column.name),originalColumns,`${name}: original column order/names changed`);
    for(const column of old.columns) {
      const actual=currentOriginal.find(item=>item.name===column.name),expected=columnMeaning(column);
      if(pipelineAdded&&name==='matrix_articles'&&['url','published_at'].includes(column.name))expected.notnull=0;
      assert.deepEqual(columnMeaning(actual),expected,`${name}.${column.name}: column semantics changed`);
    }
    assert.deepEqual(current.foreignKeys,old.foreignKeys,`${name}: foreign key semantics changed`);
    assert.ok(old.foreignKeys.every(key=>key.on_update==='NO ACTION'&&key.on_delete==='NO ACTION'),`${name}: expected source NO ACTION`);
    assert.deepEqual(current.foreignKeyTiming,old.foreignKeyTiming,`${name}: FK timing changed`);
    assert.deepEqual(current.tableOptions,old.tableOptions,`${name}: STRICT/WITHOUT ROWID/table options changed`);
    const extraChecks=hasAll(current.checks,old.checks,`${name}: original CHECK changed or missing`);
    const expectedIndexNames=[...oldIndexes[name]].sort();
    assert.deepEqual(old.indexes.filter(index=>index.origin==='c').map(index=>index.name).sort(),expectedIndexNames,`${name}: unexpected source explicit indexes`);
    const extraIndexes=hasAll(current.indexes.map(indexMeaning),old.indexes.map(indexMeaning),`${name}: original index semantics changed or missing`);
    const originalRows=state=>state.rows.map(row=>Object.fromEntries([rowidAlias,...originalColumns].map(column=>[column,row[column]])));
    assert.deepEqual(originalRows(current),originalRows(old),`${name}: original rows/ROWID/raw JSON changed`);
    assert.deepEqual(current.objects.filter(object=>!['table','index'].includes(object.type)),
      old.objects.filter(object=>!['table','index'].includes(object.type)),`${name}: trigger/view changed`);
    if(pipelineAdded&&name==='matrix_articles') {
      const added=current.columns.filter(column=>!originalColumns.includes(column.name));
      assert.deepEqual(added.map(column=>column.name).sort(),[...pipelineFields].sort(),'pipeline field inventory');
      for(const column of added) {
        assert.equal(column.type.toUpperCase().trim(),integerFields.has(column.name)?'INTEGER':'TEXT',column.name+' type');
        assert.equal(column.notnull,0,column.name+' must remain nullable');assert.equal(column.pk,0,column.name+' cannot change PK');
        const value=columnMeaning(column).default;
        if(column.name==='status')assert.equal(value,expression(tokens("'published'"),''),'status default');
        else assert.ok(value===null||value===expression(tokens('NULL'),''),column.name+' default');
      }
      for(const row of current.rows)for(const column of pipelineFields)
        assert.equal(row[column],column==='status'?'published':null,'old article pipeline copy: '+column);
      assert.equal(extraIndexes.length,2,'exactly two added pipeline indexes');
      const expected=[
        {name:'matrix_article_run_dir',columns:['run_dir'],where:'run_dir IS NOT NULL'},
        {name:'matrix_article_slot_date',columns:['slot','run_date'],where:'slot IS NOT NULL AND run_date IS NOT NULL'},
      ];
      for(const index of expected) {
        const actual=extraIndexes.find(item=>item.name===index.name);assert.ok(actual,index.name+' missing');
        assert.equal(actual.origin,'c');assert.equal(actual.unique,1);assert.equal(actual.partial,1);
        assert.equal(actual.where,expression(tokens(index.where),name),index.name+' predicate');
        assert.deepEqual(actual.xinfo.filter(item=>item.key===1).map(item=>({name:item.name,desc:item.desc,coll:item.coll})),
          index.columns.map(column=>({name:column,desc:0,coll:'BINARY'})),index.name+' columns');
        assert.deepEqual(actual.xinfo.filter(item=>item.key===0),
          [{seqno:index.columns.length,cid:-1,name:null,desc:0,coll:'BINARY',key:0}],index.name+' ROWID auxiliary column');
      }
    } else {
      assert.equal(current.columns.length,old.columns.length,`${name}: unexpected added columns`);
      assert.deepEqual(extraChecks,[],`${name}: unexpected added CHECK`);
      assert.deepEqual(extraIndexes,[],`${name}: unexpected added index`);
    }
  }
}
