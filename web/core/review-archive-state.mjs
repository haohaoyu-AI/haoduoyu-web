import {day, reviewDateTime} from './review-data.mjs';

export const archivePath = '/review/archive';
export const archiveHref = '?page=review&account=V%E5%AD%97&review_section=archive';

export const archiveKinds = {article:'长文',micro:'微头条'};
export const archiveProduction = {unfinished:'制作未完成',complete:'制作完成',unknown:'制作状态未核实'};
export const archivePublication = {
  unpublished:'未发布',pending:'待发布',scheduled:'定时',published:'已发布',deleted:'已删除',unknown:'发布状态未核实'
};
export const archiveAssociation = {pending:'待核关联',matched:'已关联',ambiguous:'多个候选待核',not_needed:'不适用'};
export const archiveFieldState = {
  missing:'未填',not_filled:'未填',none:'没有',unverified:'无法核实',unknown:'无法核实',
  not_applicable:'不适用',unsupported:'功能未支持',present:'已记录',recorded:'已记录',provided:'已记录',verified:'已核实'
};
export const archiveMetrics = {
  reads:'阅读',impressions:'展现',ctr:'点击率',likes:'点赞',comments:'评论',shares:'分享',favorites:'收藏',reposts:'转发',
  interactions:'互动',fan_reads:'粉丝阅读',fan_impressions:'粉丝展现',completion_rate:'完读率',avg_read_seconds:'平均阅读时长',
  revenue:'收入',traffic_sources:'流量来源',completion_curve:'完读曲线',audience:'受众'
};
export const archiveTimeLabels = {
  creative_started_at:'开始创作',draft_saved_at:'存入草稿箱',scheduled_at:'定时发布',published_at:'实际发布',deleted_at:'删除',
  imitation_started_at:'仿写开始',imitation_completed_at:'仿写成稿',sample_published_at:'样本发布时间'
};
export const archiveLabels = {
  ...archiveTimeLabels,original_title:'原稿标题',published_title:'发布标题',platform_url:'平台链接',platform_id:'平台编号',
  original_body:'原稿正文',published_body:'发布正文',sources:'文末来源',cover:'AI 封面',images:'配图',
  alternate_titles:'备选标题',sample_title:'仿写样本',sample_url:'样本链接',sample_reference_id:'样本库关联',
  source_note:'来源说明',tags:'标签',snapshot:'历史快照',snapshots:'历史快照',metrics:'历史指标',refs:'平台标识',
  'images.total':'总图数','images.real':'真实图数','images.ai':'AI 图数'
};

export function canAccessReviewArchive(me,account) {
  return account === 'V字' && Boolean(me?.id && me.csrfToken && me.reviewArchive === true &&
    !me.publicBusiness && !me.offlineIdentity);
}

export function isReviewArchiveRoute(search) {
  return new URLSearchParams(search).get('review_section') === 'archive';
}

export function archiveGroups(items) {
  const groups = new Map();
  for (const row of items) {
    const date = day(row.sort_at);
    if (!groups.has(date)) groups.set(date,[]);
    groups.get(date).push(row);
  }
  return Array.from(groups.entries()).sort(([a],[b]) => b.localeCompare(a)).map(([date,rows]) => ({
    date,rows:rows.sort((a,b) => (Date.parse(b.sort_at) || 0) - (Date.parse(a.sort_at) || 0) ||
      String(a.id).localeCompare(String(b.id)))
  }));
}

export function archiveDate(value, unavailable='未填') {
  return reviewDateTime(value) || unavailable;
}

export function archiveMissing(state) {
  return archiveFieldState[state] || '未填';
}

export function archiveTitle(row) {
  return row.published_title || row.original_title || row.title || '未填标题';
}

export function archiveQuery(filters,offset=0,revision=null) {
  const params = new URLSearchParams({offset:String(offset)});
  for (const name of ['kind','production_status','publication_status','association_status','from','to']) {
    if (filters[name]) params.set(name,filters[name]);
  }
  if (revision != null) params.set('read_revision',String(revision));
  return params.toString();
}

export function acceptArchivePage(page,previous) {
  if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' || !Number.isInteger(page.read_revision)) {
    throw new Error('档案分页返回不完整。');
  }
  if (previous.revision != null && page.read_revision !== previous.revision) throw new Error('档案已更新，请重新读取。');
  const ids = new Set(previous.items.map(row => row.id));
  for (const row of page.items) {
    if (typeof row?.id !== 'string' || ids.has(row.id)) throw new Error('档案分页含重复记录，请重新读取。');
    ids.add(row.id);
  }
  if (page.has_more && (!Number.isInteger(page.next_offset) || page.next_offset <= previous.offset)) {
    throw new Error('档案续页游标无效。');
  }
  return {
    items:[...previous.items,...page.items],revision:page.read_revision,
    offset:page.has_more ? page.next_offset : previous.offset,more:page.has_more
  };
}
