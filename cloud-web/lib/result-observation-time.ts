/** Result ages describe observed data; they never authorize or schedule a refresh. */
export const resultRefreshAgeMs=6*3600000;

export function confirmedObservationTime(value:unknown,now:number):number|null{
 if(typeof value!=='string')return null;
 const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/);
 if(!parts)return null;
 const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1])return null;
 if(Number(parts[4])>23||Number(parts[5])>59||Number(parts[6]??0)>59||Number(parts[7]??0)>23||Number(parts[8]??0)>59)return null;
 const at=Date.parse(value);return Number.isFinite(at)&&at<=now?at:null;
}

export function observationTimeLabel(at:number):string{
 return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
}
