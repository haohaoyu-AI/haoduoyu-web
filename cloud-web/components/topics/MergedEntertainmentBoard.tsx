import type { ReactNode } from 'react';
import type { TopicCandidate } from '../../lib/topic-radar';
import { topicBrief } from '../../lib/topic-merged';
import styles from './easel-trends.module.css';

const labels: Record<string, string> = { toutiao: '今日头条', weibo: '微博' };
export function MergedEntertainmentBoard({ featured, additional, unclassified = [], pending, renderDetail }: {
  featured: TopicCandidate[]; additional: TopicCandidate[]; unclassified?: TopicCandidate[]; pending: boolean;
  renderDetail: (candidate: TopicCandidate) => ReactNode;
}) {
  return <div className={styles.mergedBoard}>
    <div className={styles.selectionHeading}><h3>文娱线索（未核验） <span>{featured.length} 条</span></h3><p>两源合并去重 · 规则初筛线索，事实与分析待核验</p></div>
    {pending && <p className={styles.notice} role="status">正在读取两源热榜，已返回的线索先展示…</p>}
    {!pending && featured.length < 5 && <p className={styles.notice} role="status">本次可用文娱线索 {featured.length} 条，未满 5 条；不使用旧缓存、无关热点或私生活传闻补位。</p>}
    <div className={styles.featuredList}>
      {featured.map((candidate) => {
        const brief = topicBrief(candidate);
        const sourceTitles = [...new Set(candidate.signals.map((signal) => signal.source_title).filter((value): value is string => !!value))];
        return <article className={styles.featuredItem} key={candidate.id} data-featured-topic={candidate.id}>
          <h4>{candidate.classification.risk_terms.length > 0 ? `榜单原题：“${candidate.title}”` : candidate.title}</h4>
          {candidate.classification.risk_terms.length > 0 && <p className={styles.noticeWarn}>争议线索 · 待核验；不代表相关说法属实</p>}
          <div className={styles.signalLine}>{candidate.signals.map((signal, index) => <span key={`${signal.platform}-${index}`}>
            {labels[signal.platform] ?? signal.platform} · {signal.rank ? `原榜第 ${signal.rank} 位` : '原榜未标名次'}{signal.metric ? ` · 平台指标 ${signal.metric}` : ' · 未提供热度值'}
            {signal.url && <> · <a href={signal.url} target="_blank" rel="noreferrer">原始话题 ↗</a></>}
          </span>)}</div>
          <dl className={styles.briefGrid}>
            <dt>事件摘要</dt><dd>{brief.summaries.length ? brief.summaries.map((signal, index) => <p key={index}>[{labels[signal.platform]}来源摘要，未独立核验] {signal.source_summary}</p>) : <p>榜单线索：本次在{[...new Set(candidate.signals.map((signal) => labels[signal.platform]))].join('、')}观察到此话题，归入{candidate.categories.join(' / ')}。来源未提供事件正文，发生时间与具体经过待核验。{sourceTitles.length > 1 && <> 同题线索合并：{sourceTitles.map((title) => `“${title}”`).join('；') }。</>}</p>}</dd>
            <dt>爆点分析<span>待核验</span></dt><dd>{brief.analysis}</dd>
            <dt>可写角度<span>建议</span></dt><dd>{brief.angle}</dd>
          </dl>
          <details className={styles.researchDetails}><summary>证据与近期去重</summary>{renderDetail(candidate)}</details>
        </article>;
      })}
    </div>
    <section className={styles.additional} aria-labelledby="additional-topics-title"><h3 id="additional-topics-title">附加热点 <span>{additional.length}</span></h3>
      {additional.length ? <ul>{additional.map((candidate) => <li key={candidate.id}><details><summary><span>{candidate.title}</span><small>{[...new Set(candidate.signals.map((signal) => labels[signal.platform]))].join(' / ')} · {candidate.categories.join(' / ')}</small></summary>{renderDetail(candidate)}</details></li>)}</ul> : <p className={styles.notice}>{pending ? '等待读取剩余线索' : '本次暂无其他合格文娱线索'}</p>}
    </section>
    {unclassified.length > 0 && <details className={styles.additional} data-unclassified-topics="true">
      <summary>待分类线索 · 原榜记录（{unclassified.length} 条）</summary>
      <p className={styles.notice}>这些标题没有足够的文娱分类依据，可能包含其他领域；纯人名、作品名线索保留在此供发现，不占文娱线索或附加热点名额。标题与相关说法均未核验。</p>
      <ul>{unclassified.map((candidate) => <li key={candidate.id}><span>{candidate.title}</span><div className={styles.signalLine}>{candidate.signals.map((signal, index) => <span key={index}>{labels[signal.platform]} · {signal.rank ? `原榜第 ${signal.rank} 位` : '原榜未标名次'}{signal.metric ? ` · 平台指标 ${signal.metric}` : ''}{signal.url && <> · <a href={signal.url} target="_blank" rel="noreferrer">原始话题 ↗</a></>}</span>)}</div></li>)}</ul>
    </details>}
  </div>;
}
