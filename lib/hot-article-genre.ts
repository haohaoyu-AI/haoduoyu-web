// Conservative title classification only; an account's name does not establish
// the topic of each article. Unclassified titles require actual public research.
export function entertainmentArticleTitle(title:string){
 if(/世界杯|奥运|足球|篮球|乒乓|羽毛球|网球|中超|英超|NBA|CBA|国足|比分|联赛|运动员|夺冠/i.test(title))return false;
 return /电影|票房|上映|首映|影院|影后|影帝|电视剧|热播剧|新剧|剧集|追剧|开播|剧组|剧照|编剧|演员|导演|歌手|艺人|影视|文娱|娱乐|综艺|演唱会|演出|专辑|主题曲|音乐剧|影展|电影节|脱口秀/.test(title);
}
