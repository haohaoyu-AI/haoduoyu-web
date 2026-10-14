export type ArticleListScope = 'publish' | 'writing';

// Old provider receipts predate article_id in their JSON. Their owner/run-kind/day
// namespaces are authoritative lineage, shared by the purge and atomic work fence.
export function writingReceiptSql(c = 'c', w = 'w') {
  return `((${w}.writer='claude' AND (
    (${w}.run_kind='daily' AND ${c}.id=${w}.owner||':'||${w}.day)
    OR (${w}.run_kind='workflow_test' AND ${c}.id IN ('workflow-test:'||${w}.owner||':'||${w}.day,'workflow-test-retry:'||${w}.owner||':'||${w}.day,'workflow-test-extended:'||${w}.owner||':'||${w}.day))
    OR (${w}.run_kind='workflow_rewrite_v2' AND ${c}.id IN ('workflow-rewrite-v2:'||${w}.owner||':'||${w}.day,'workflow-rewrite-v2-confirmed-retry:'||${w}.owner||':'||${w}.day))
    OR (substr(${w}.run_kind,1,7)='manual:' AND ${c}.id='manual:'||${w}.owner||':'||substr(${w}.run_kind,8)||':claude')))
    OR (substr(${w}.run_kind,1,14)='stepwise_text:' AND ${c}.id='stepwise_text:'||${w}.owner||':'||substr(${w}.run_kind,15)||':'||${w}.writer))`;
}

// These expressions are shared by listing, preview and the atomic deletion fence.
// Unknown / resumable states remain work, even if the main Toutiao stage completed.
export function writingArticleSql(a = 'articles') {
  return `(EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
    OR EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
    OR EXISTS(SELECT 1 FROM editorial_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
    OR EXISTS(SELECT 1 FROM outline_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
    OR substr(${a}.source_key,1,54)='articles/'||${a}.id||'/writing-')`;
}
export function listScopeSql(scope: ArticleListScope, a = 'articles') {
  return scope === 'writing' ? writingArticleSql(a) : `NOT ${writingArticleSql(a)}`;
}
export function protectedArticleSql(a = 'articles') {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  const claim = (alias: string, token: string, expires: string) =>
    `(${alias}.${token} IS NOT NULL AND (${alias}.${expires} IS NULL OR julianday(${alias}.${expires}) IS NULL OR ${alias}.${expires}>${now}))`;
  return `(${a}.state NOT IN ('uploaded','failed','text_saved','completed')
    OR ${claim(a, 'claim_token', 'claim_expires')}
    OR (${a}.state='completed' AND (${a}.result_key IS NULL OR ${a}.draft_url IS NULL OR NOT EXISTS(
      SELECT 1 FROM article_deliveries d WHERE d.owner=${a}.owner AND d.article_id=${a}.id AND d.platform='zhihu' AND d.state='saved' AND d.draft_url IS NOT NULL)))
    OR (${a}.result_meta IS NOT NULL AND ${a}.result_key IS NULL)
    OR EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=${a}.owner AND d.article_id=${a}.id AND
      (d.state NOT IN ('saved','blocked') OR ${claim('d', 'claim_token', 'claim_expires')}))
    OR EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.owner=${a}.owner AND u.article_id=${a}.id AND
      u.state NOT IN ('verified','cancelled') AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.owner=u.owner AND e.attempt_id=u.id))
    OR EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND
      w.state NOT IN ('text_saved','submitted','revision_saved','permanently_deleted'))
    OR EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND w.state<>'text_saved')
    OR EXISTS(SELECT 1 FROM editorial_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND w.state<>'text_saved')
    OR EXISTS(SELECT 1 FROM outline_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND w.state NOT IN ('final_saved','finalized','text_saved'))
    OR EXISTS(SELECT 1 FROM editorial_stages_v3 s JOIN editorial_runs_v3 w ON w.owner=s.owner AND w.id=s.run_id
      WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND s.state IN ('claimed','requested'))
    OR EXISTS(SELECT 1 FROM editorial_stages s JOIN editorial_flows w ON w.owner=s.owner AND w.id=s.run_id
      WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND s.state IN ('claimed','requested'))
    OR EXISTS(SELECT 1 FROM outline_flow_stages s JOIN outline_flows w ON w.owner=s.owner AND w.id=s.run_id
      WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND s.state IN ('claimed','requested'))
    OR EXISTS(SELECT 1 FROM editorial_requests r JOIN editorial_flows w ON w.owner=r.owner AND w.id=r.flow_id
      WHERE w.owner=${a}.owner AND w.article_id=${a}.id AND r.state NOT IN ('text_saved','completed','cancelled','failed')
      AND (w.state<>'text_saved' OR ${claim('r', 'claim_hash', 'claim_expires')}))
    OR EXISTS(SELECT 1 FROM manual_writing_batches b JOIN writing_runs w ON w.owner=b.owner
      AND substr(w.run_kind,1,51)='text_revision:'||b.id||':'
      WHERE b.owner=${a}.owner AND json_valid(b.snapshot) AND json_extract(b.snapshot,'$.daily_source.article_id')=${a}.id
      AND w.state<>'revision_saved')
    OR EXISTS(SELECT 1 FROM claude_attempts c WHERE c.owner=${a}.owner AND c.state='requested'
      AND (json_extract(CASE WHEN json_valid(c.response) THEN c.response ELSE '{}' END,'$.snapshot.article_id')=${a}.id
        OR json_extract(CASE WHEN json_valid(c.response) THEN c.response ELSE '{}' END,'$.article_id')=${a}.id
        OR EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=c.owner AND w.article_id=${a}.id AND ${writingReceiptSql()})
        OR c.id IN(SELECT e.provider_attempt_id FROM daily_editorial_drafts e WHERE e.owner=${a}.owner AND e.article_id=${a}.id)))
    OR EXISTS(SELECT 1 FROM article_handoffs h WHERE h.owner=${a}.owner AND h.article_id=${a}.id AND
      (h.state='sending' OR (h.state IN ('delivered','unknown') AND ${a}.state NOT IN ('completed','text_saved')
        AND (${a}.state<>'failed' OR ${a}.claim_expires IS NULL OR h.created>${a}.claim_expires)))))`;
}

export function visibleArticleSql(a = 'articles') {
  return `NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=${a}.owner AND x.id=${a}.id)`;
}
