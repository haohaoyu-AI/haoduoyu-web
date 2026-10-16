import { normalizeTopic, topicOutsideWorkTitles, type TopicCandidate } from './topic-radar';

export const ENTERTAINMENT_SOURCES = ['toutiao', 'weibo'] as const;
export type EntertainmentSource = typeof ENTERTAINMENT_SOURCES[number];
type SourceBoard = { platform: { platform: string; status: string; fetched_at: string | null; upstream_updated_at?: string | null }; candidates: TopicCandidate[] };
const DAY = 86_400_000;

export function isEntertainmentCandidate(candidate: TopicCandidate) {
  // Public controversy is a research lead, not a fact finding. Exclude only
  // obvious private-life excavation rather than every controversy/risk term.
  const privateLife = /恋情|恋爱|分手|离婚|私生活|出轨|偷拍|私照|私生|未成年|曝.{0,12}(?:女儿|儿子|孩子)|港媒拍到/;
  return candidate.categories.length > 0 && !privateLife.test(topicOutsideWorkTitles(candidate.title));
}

// Never merge on a person's name alone. Punctuation variants and the same
// official topic URL are strong identities; other semantic matches need research.
function canonicalURL(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const query = url.searchParams.get('q');
    if (query) return `${url.hostname}${url.pathname}?q=${normalizeTopic(query)}`;
    return url.pathname === '/' ? null : `${url.hostname}${url.pathname}`;
  } catch { return null; }
}

export function mergeEntertainmentBoards(boards: SourceBoard[], now = Date.now()) {
  const merged: TopicCandidate[] = [];
  const ordered = ENTERTAINMENT_SOURCES.map((source) => boards.find((board) => board.platform.platform === source));
  const available = ordered.map((board) => {
    if (!board || board.platform.status !== 'ok' || !board.platform.fetched_at) return [];
    const fetched = Date.parse(board.platform.fetched_at);
    const upstream = board.platform.upstream_updated_at ? Date.parse(board.platform.upstream_updated_at) : null;
    if (!Number.isFinite(fetched) || now - fetched > DAY || fetched > now + 300_000 || (upstream !== null && (!Number.isFinite(upstream) || now - upstream > DAY))) return [];
    return board.candidates;
  });
  const active = available.map((items) => items.filter(isEntertainmentCandidate));
  const unclassified = new Map<string, TopicCandidate>();
  for (const candidate of available.flat()) {
    // Explicit non-entertainment source categories are not classification gaps.
    // Category-less headlines remain discoverable, without being promoted to entertainment.
    if (candidate.categories.length || candidate.signals.some((signal) => signal.source_categories?.length)) continue;
    const key = normalizeTopic(candidate.topic);
    const existing = unclassified.get(key);
    if (existing) {
      for (const signal of candidate.signals) if (!existing.signals.some((item) => item.platform === signal.platform && item.url === signal.url)) existing.signals.push(signal);
    } else unclassified.set(key, { ...candidate, signals: [...candidate.signals] });
  }
  // A quoted work name can anchor unquoted references in this same batch.
  // Group only matching public-discussion nodes; premiere and casting remain distinct.
  const works = [...new Set(active.flat().flatMap((candidate) => [...candidate.title.matchAll(/《([^》]{3,30})》/g)].map((match) => match[1])))];
  const workNode = (title: string) => {
    const work = works.find((name) => title.includes(name));
    if (!work) return null;
    if (/追|大结局|结局|收官/.test(title)) return `${work}:收官讨论`;
    if (/开播|定档/.test(title)) return `${work}:播出节点`;
    return null;
  };
  // Alternate the two sources without converting their ranks or heat metrics.
  for (let row = 0; row < Math.max(0, ...active.map((items) => items.length)); row += 1) {
    for (const items of active) {
      const candidate = items[row];
      if (!candidate) continue;
      const key = normalizeTopic(candidate.topic);
      const urls = candidate.signals.map((signal) => canonicalURL(signal.url)).filter(Boolean);
      const existing = merged.find((item) => (normalizeTopic(item.topic) === key || (!!workNode(candidate.title) && workNode(item.title) === workNode(candidate.title))) || item.signals.some((signal) => { const url = canonicalURL(signal.url); return url && urls.includes(url); }));
      if (!existing) {
        merged.push({ ...candidate, signals: [...candidate.signals], categories: [...candidate.categories] });
      } else {
        existing.categories = [...new Set([...existing.categories, ...candidate.categories])];
        for (const signal of candidate.signals) {
          if (!existing.signals.some((item) => item.platform === signal.platform && item.url === signal.url && item.rank === signal.rank)) existing.signals.push(signal);
        }
      }
    }
  }
  // Multi-source presence is a selection aid, never a claim of verified facts.
  merged.sort((a, b) => new Set(b.signals.map((signal) => signal.platform)).size - new Set(a.signals.map((signal) => signal.platform)).size);
  return { featured: merged.slice(0, 5), additional: merged.slice(5), total: merged.length, unclassified: [...unclassified.values()] };
}

export function topicBrief(candidate: TopicCandidate) {
  const summaries = candidate.signals.filter((signal) => signal.source_summary && normalizeTopic(signal.source_summary) !== normalizeTopic(candidate.title));
  const publicMaterial = /大结局|追剧|剧集|电视剧|开播|剧照|杀青/.test(candidate.title);
  const performance = /演唱会|舞台|巡演|演出|音乐节/.test(candidate.title);
  const film = /票房|电影|排片|上映/.test(candidate.title);
  const visual = /宣传照|大秀|红毯|时装周/.test(candidate.title);
  const focus = performance ? '现场表现与观众体验' : film ? '作品表现与数据口径' : publicMaterial ? '剧情节点与人物表达' : visual ? '公开物料与视觉表达' : '公开事件的新进展';
  return {
    summaries,
    focus,
    analysis: candidate.classification.risk_terms.length ? '这是一条带争议或风险词的榜单线索，不代表相关说法已被证实。先核对完整公开表述、当事方回应与独立证据，再决定是否形成判断。' : performance ? '可研究现场呈现、主办方信息与观众体验之间的关系；纪录或规模说法须核对认证机构及统计口径。'
      : film ? '可对照档期、排片和观众反馈；单项榜单指标不足以说明口碑或商业成败。'
      : publicMaterial ? '可从具体剧情、人物选择与公开讨论的分歧切入；需先看完整片段，不能把话题热度当成剧情评价。'
      : visual ? '可对照完整公开物料的造型、品牌表达与传播方式；图片话题不能证明代言关系或商业变化。'
      : '先确认事件的新节点与完整原始表述，再判断读者真正关心的问题；榜单记录本身不证明事件结论。',
    angle: candidate.angles[0]?.question ?? `建议围绕${focus}，核对原始物料后选一个具体变化展开。`,
  };
}
