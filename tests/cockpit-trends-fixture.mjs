// In-memory display fixture only. No database or production endpoint is used.
export const cockpitNow = '2026-11-11T08:00:00Z';
export const cockpitAccount = 'V字';
const values = [18,15000,12000,1800,5,110,1600,3,1700,1200,2100,36,220,65,6800,950,2100,55,
  130,2300,16,740,9,260,256000,86,390,420,6746,2,70,290,1200,4019,20000,1,430,3900,310,4,46,38];
export const cockpitFixture = {articles:[],snapshots:[],loadedAt:cockpitNow};
for (const [index,reads] of values.entries()) {
  const date = new Date(Date.UTC(2026,9,26 + Math.floor(index / 3),index % 3 * 6)).toISOString();
  const id = `synthetic-chart-${index}`;
  const age = index % 4 === 0 ? 18 : 24;
  const snapshot = new Date(Date.parse(date) + age * 3600000).toISOString();
  cockpitFixture.articles.push({id,account:cockpitAccount,title:`合成验收文章 ${index + 1}：观察内容表现与读者反馈`,
    published_at:date,status:'published'});
  cockpitFixture.snapshots.push({id:`snapshot-${index}`,article_id:id,snapshot_date:snapshot,age_hours:age,
    reads,ctr:reads >= 10000 ? 15 : Math.round((2 + index % 11) * 10) / 10,
    avg_read_seconds:35 + index % 30,completion_rate:30 + index % 25});
}
