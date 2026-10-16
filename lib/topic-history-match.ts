import type { TopicCandidate } from './topic-radar';
import type { TopicHistoryEntry } from './topics-history';

function cleanForMatch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function quotedWorks(value: string): string[] {
  return [...value.matchAll(/《([^《》]{1,60})》/g)].map((match) => cleanForMatch(match[1]));
}

const GENERIC_PHRASES = [
  '电影票房', '电视剧', '娱乐新闻', '为什么火', '引发热议', '网友表示', '最新消息',
  '再次官宣', '正式官宣', '热搜第一', '票房纪录', '全网热议', '明星演员',
];

function findSpecificOverlap(candidateText: string, historyText: string): string | null {
  const candidateRuns = candidateText.match(/[\u3400-\u9fff]{6,}/g) ?? [];
  const historyRuns = historyText.match(/[\u3400-\u9fff]{6,}/g) ?? [];
  for (const candidateRun of candidateRuns) {
    for (const historyRun of historyRuns) {
      const maxLength = Math.min(20, candidateRun.length, historyRun.length);
      for (let length = maxLength; length >= 6; length -= 1) {
        for (let start = 0; start <= candidateRun.length - length; start += 1) {
          const phrase = candidateRun.slice(start, start + length);
          if (GENERIC_PHRASES.some((generic) => phrase.includes(generic) || generic.includes(phrase))) continue;
          if (historyRun.includes(phrase)) return phrase;
        }
      }
    }
  }
  return null;
}

export function findTopicHistoryMatches(candidate: TopicCandidate, entries: TopicHistoryEntry[]) {
  const candidateText = `${candidate.topic} ${candidate.title}`;
  const candidateNormalized = cleanForMatch(candidate.topic);
  const candidateWorks = new Set(quotedWorks(candidateText));
  const matches: TopicCandidate['history_matches'] = [];

  for (const entry of entries) {
    const pastTopic = entry.topic ?? '';
    const pastTitle = entry.title;
    const pastNormalized = cleanForMatch(pastTopic);
    let reason = '';
    let matchedText = '';
    if (candidateNormalized && (candidateNormalized === pastNormalized || candidateNormalized === cleanForMatch(pastTitle))) {
      reason = '完整话题词面一致';
      matchedText = candidate.topic;
    } else {
      const pastWorks = new Set(quotedWorks(`${pastTopic} ${pastTitle}`));
      const sameWork = [...candidateWorks].find((work) => work && pastWorks.has(work));
      if (sameWork) {
        reason = '作品名词面一致，可能相关，不代表内容重复';
        matchedText = `《${sameWork}》`;
      } else {
        const phrase = findSpecificOverlap(candidateText, `${pastTopic} ${pastTitle}`);
        if (phrase) {
          reason = '发现6字以上具体词面重合，仅提示核对';
          matchedText = phrase;
        }
      }
    }
    if (!reason) continue;
    matches.push({
      article_id: entry.article_id,
      title: pastTitle,
      created: entry.created,
      writer: entry.writer,
      run_kind: entry.run_kind,
      reason,
      matched_text: matchedText,
      source: entry.source,
    });
  }
  return matches.slice(0, 3);
}
