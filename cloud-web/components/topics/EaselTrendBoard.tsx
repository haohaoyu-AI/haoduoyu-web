// SPDX-License-Identifier: Apache-2.0
// Adapted from https://github.com/ZJU-REAL/Easel/blob/d80b26ca598dd29bdc23da236cb9743a9a8751bc/web/frontend/src/components/TrendsPage.tsx
// Adaptations are documented in vendor/easel-ui/NOTICE.
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, RefreshCw, Search } from 'lucide-react';
import styles from './easel-trends.module.css';

export type EaselTrendRow = {
  row_id: string;
  title: string;
  rank: number | null;
  metric: string | null;
  url: string | null;
  label?: string | null;
};

export type EaselTrendStatus = 'loading' | 'ok' | 'empty' | 'stale' | 'error' | 'not_implemented';

export type EaselTrendBoardProps = {
  id: string;
  label: string;
  platformKey: string;
  status: EaselTrendStatus;
  statusText: string;
  metaText?: string;
  rows: EaselTrendRow[];
  expanded: boolean;
  refreshing: boolean;
  selectedRowId?: string;
  onRefresh: () => void;
  onToggleExpanded: (expanded: boolean) => void;
  onInspect: (rowId: string) => void;
  onCopy: (rowId: string) => void;
  canCopy: (rowId: string) => boolean;
  renderDetail: (row: EaselTrendRow) => ReactNode;
  error?: string | null;
  notices?: ReactNode;
  diagnostics?: ReactNode;
};

const DEFAULT_ROW_LIMIT = 15;

function rankLabel(row: EaselTrendRow) {
  if (row.rank !== null) return String(row.rank);
  return /置顶/.test(row.label ?? '') ? '置顶' : '—';
}

export function EaselTrendBoard({
  id,
  label,
  platformKey,
  status,
  statusText,
  metaText,
  rows,
  expanded,
  refreshing,
  selectedRowId,
  onRefresh,
  onToggleExpanded,
  onInspect,
  onCopy,
  canCopy,
  renderDetail,
  error,
  notices,
  diagnostics,
}: EaselTrendBoardProps) {
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_ROW_LIMIT);
  const boardTitleId = `${id}-title`;

  return (
    <section className={styles.board} data-platform={platformKey} data-status={status} data-expanded={expanded} data-detail-open={!!selectedRowId} aria-labelledby={boardTitleId} aria-busy={status === 'loading'}>
      <header className={styles.boardHeader}>
        <div className={styles.boardTitleGroup}>
          <h3 className={styles.boardTitle} id={boardTitleId}>{label}</h3>
          <span className={styles.count} aria-label={`${visibleRows.length} 条当前可见线索`}>{visibleRows.length}</span>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={`刷新${label}热榜`}
          title={refreshing ? '正在刷新' : `刷新${label}热榜`}
        >
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? styles.spinning : undefined} />
        </button>
      </header>

      <p className={`${styles.status} ${styles[`status_${status}`]}`} role="status">
        {statusText}{metaText ? ` · ${metaText}` : ''}
      </p>
      {error && status !== 'not_implemented' && <p className={styles.error} role="alert">{error}</p>}
      {notices}

      {status === 'loading' && rows.length === 0 ? (
        <div className={styles.skeletonList} role="status" aria-label={`${label}读取中`}>
          {Array.from({ length: 4 }, (_, index) => <span className={styles.skeleton} key={index} />)}
        </div>
      ) : null}

      {visibleRows.length > 0 ? (
        <ol className={styles.rows} id={`${id}-rows`}>
          {visibleRows.map((row) => {
            const isOpen = selectedRowId === row.row_id;
            const rankTop = row.rank !== null && row.rank >= 1 && row.rank <= 3;
            const detailId = `${id}-detail-${encodeURIComponent(row.row_id)}`;
            const titleProps = {
              className: styles.title,
              title: row.title,
              'aria-label': row.url ? `打开原榜条目：${row.title}` : `查看「${row.title}」的研究详情`,
            };
            return (
              <li className={styles.rowItem} key={row.row_id}>
                <div className={`${styles.row} ${isOpen ? styles.rowSelected : ''}`}>
                  <span className={`${styles.rank} ${rankTop ? styles.rankTop : ''}`} aria-label={row.rank ? `榜位 ${row.rank}` : rankLabel(row)}>{rankLabel(row)}</span>
                  <div className={styles.main}>
                    {row.url ? (
                      <a {...titleProps} href={row.url} target="_blank" rel="noreferrer">{row.title}</a>
                    ) : (
                      <button {...titleProps} type="button" aria-expanded={isOpen} aria-controls={detailId} onClick={() => onInspect(row.row_id)}>{row.title}</button>
                    )}
                    {row.metric && <span className={styles.hot} title={`平台指标：${row.metric}`}>{row.metric}</span>}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.inspect}
                      onClick={() => onInspect(row.row_id)}
                      aria-label={`${isOpen ? '收起' : '查看'}「${row.title}」的研究详情`}
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      title={isOpen ? '收起研究详情' : '查看研究详情'}
                    >
                      <Search size={14} aria-hidden="true" />
                    </button>
                    {canCopy(row.row_id) ? (
                      <button
                        type="button"
                        className={styles.copy}
                        onClick={() => onCopy(row.row_id)}
                        aria-label={`展开并复制「${row.title}」的证据包`}
                        title="复制证据包"
                      ><Copy size={13} aria-hidden="true" /><span>复制包</span></button>
                    ) : <span className={styles.copySpacer} aria-hidden="true" />}
                  </div>
                </div>
                <div className={styles.detail} id={detailId} hidden={!isOpen}>{isOpen ? renderDetail(row) : null}</div>
              </li>
            );
          })}
        </ol>
      ) : status === 'empty' || status === 'ok' || status === 'stale' ? (
        <p className={styles.empty}>{status === 'empty' ? '上游返回空榜' : '此范围暂无命中；原榜状态仍保留'}</p>
      ) : null}

      {rows.length > DEFAULT_ROW_LIMIT && (
        <button
          type="button"
          className={styles.expand}
          onClick={() => onToggleExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls={`${id}-rows`}
        >
          {expanded ? <><ChevronUp size={14} aria-hidden="true" />收起为前 15 条</> : <><ChevronDown size={14} aria-hidden="true" />查看更多（共 {rows.length} 条）</>}
        </button>
      )}
      {diagnostics && <details className={styles.diagnostics}><summary>来源详情</summary><div>{diagnostics}</div></details>}
    </section>
  );
}
