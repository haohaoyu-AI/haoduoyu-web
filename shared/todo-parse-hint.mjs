/** Words that make a to-do sentence worth reading with the model ("一句话加待办").
 * A sentence without any of them is added as typed, with no model call. Shared by the page and the server. */
export const TODO_PARSE_HINT = /明天|明早|明晚|后天|下周|下星期|下个?月|本周|这周|周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\d{1,2}\s*[号日]|\d{1,2}\s*月|\d{1,2}[/.-]\d{1,2}|每天|每日|天天|每晚|每早|\d+\s*次|[一二两三四五六七八九十]+\s*次|月底|月初|不限次|次数不限|无限次|随时记/;
