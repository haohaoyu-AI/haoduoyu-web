import {digest,stable,fail} from './security.mjs';
import {consistentRead} from './storage.mjs';
import {shiftDay} from './lib/time.mjs';

export function snapshotDate(value) {
  if(typeof value!=='string'||!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    throw fail(400,'VALIDATION_ERROR','请明确提供有效的 YYYY-MM-DD');
  const stamp=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==value)
    throw fail(400,'VALIDATION_ERROR','请明确提供有效的 YYYY-MM-DD');
  return value;
}

export function snapshotHash(snapshot) {
  const content={snapshot_format:snapshot.snapshot_format,date:snapshot.date,timezone:snapshot.timezone};
  for(const name of ['todos','templates','accounts','articles','observations','daily_metrics'])
    content[name]=snapshot[name].map(row=>stable(row)).sort((a,b)=>{
      const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;
    });
  return digest(JSON.stringify(stable(content)));
}

// Read only explicitly projected business fields. No SELECT *, audit, users,
// sessions, credentials, raw backups or soft-deleted todos/templates are read.
export async function readBusinessSnapshot(db,{date,ownerId,accountIds}, {maxRows=2000,maxBytes=131072}={}) {
  snapshotDate(date);
  const start=new Date(date+'T00:00:00+08:00').toISOString();
  const end=new Date(Date.parse(start)+86400000).toISOString(),windowStart=shiftDay(date,-29);
  let queries=0;
  return consistentRead(db,async store=>{
    let total=0,bytes=0;
    async function all(sql,args=[],order='id') {
      const rows=[];
      for(let offset=0;;offset+=200) {
        if(++queries>24)throw fail(503,'SNAPSHOT_LIMIT','快照读取预算不足，未发送不完整内容');
        const page=await store.all(sql+' ORDER BY '+order+' LIMIT 200 OFFSET ?',...args,offset);
        for(const row of page) {
          total++;bytes+=Buffer.byteLength(JSON.stringify(row));
          if(total>maxRows||bytes>maxBytes)throw fail(413,'SNAPSHOT_LIMIT','快照超过单次完整推送预算，未发送');
          rows.push(row);
        }
        if(page.length<200)return rows;
      }
    }
    const todos=await all('SELECT id,date,text,completed,version,created_at,updated_at FROM matrix_todos WHERE user_id=? AND date=? AND deleted_at IS NULL',[ownerId,date]);
    const templates=await all('SELECT t.id,t.text,t.version,t.created_at,t.updated_at,(SELECT count(DISTINCT d.date) FROM matrix_todo_template_links l JOIN matrix_todos d ON d.user_id=l.user_id AND d.id=l.todo_id WHERE l.user_id=t.user_id AND l.template_id=t.id AND d.completed=1 AND d.deleted_at IS NULL AND d.date>=? AND d.date<=?) AS completed_days FROM matrix_todo_templates t WHERE t.user_id=? AND t.deleted_at IS NULL',[windowStart,date,ownerId],'t.id');
    const scope=JSON.stringify(accountIds),where=' IN (SELECT value FROM json_each(?))';
    const accounts=await all('SELECT id,platform,name,active,created_at FROM matrix_accounts WHERE id'+where,[scope]);
    if(accounts.length!==accountIds.length)throw fail(503,'NOTION_CONFIG','快照账号范围尚未核实');
    const metrics=rows=>rows.map(({metrics_json,...row})=>{
      let value;try {value=JSON.parse(metrics_json);}catch {}
      if(!value||typeof value!=='object'||Array.isArray(value))throw fail(503,'SNAPSHOT_DATA','业务指标无法完整解析，未发送');
      return {...row,metrics:value};
    });
    const observations=metrics(await all('SELECT o.id,o.article_id,o.as_of,o.collected_at,o.kind,o.metrics_json,o.source,o.note,o.created_at FROM matrix_observations o JOIN matrix_articles a ON a.id=o.article_id WHERE a.account_id'+where+' AND o.as_of>=? AND o.as_of<?',[scope,start,end],'o.id'));
    const daily_metrics=metrics(await all('SELECT id,account_id,article_id,date,metrics_json,source,updated_at FROM matrix_daily_metrics WHERE account_id'+where+' AND date=?',[scope,date]));
    const articles=await all('SELECT a.id,a.account_id,a.title,a.url,a.published_at,a.started_at,a.production_mode,a.summary,a.notes,a.version FROM matrix_articles a WHERE a.account_id'+where+' AND ((a.published_at>=? AND a.published_at<?) OR EXISTS(SELECT 1 FROM matrix_observations o WHERE o.article_id=a.id AND o.as_of>=? AND o.as_of<?) OR EXISTS(SELECT 1 FROM matrix_daily_metrics d WHERE d.article_id=a.id AND d.date=?))',[scope,start,end,start,end,date],'a.id');
    const snapshot={snapshot_format:'haoduoyu-business-snapshot-v1',date,timezone:'Asia/Shanghai',
      generated_at:new Date().toISOString(),todos,templates,accounts,articles,observations,daily_metrics};
    snapshot.content_hash=snapshotHash(snapshot);
    return snapshot;
  });
}

export const snapshotCounts=snapshot=>Object.fromEntries(['todos','templates','accounts','articles','observations','daily_metrics'].map(k=>[k,snapshot[k].length]));
export const emptySnapshot=snapshot=>['todos','articles','observations','daily_metrics'].every(k=>snapshot[k].length===0);
