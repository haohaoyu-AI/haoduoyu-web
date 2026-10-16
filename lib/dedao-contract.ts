export const DEDAO_URL='https://www.biji.com/writing/6aa3c781dd3446e897981a7c';
export const DEDAO_MESSAGES=[
 '继续下一篇，请按我们已有的写作约定推荐选题，并告诉我你最推荐哪一个。',
 '就用你最推荐的选题，标题也用你推荐的。按我们已有的节奏继续推进。',
 '框架就按你的方案，开始写。',
 '定稿。按这份最新版本保存，完成写作进程。这次先停在这一篇。',
] as const;
export const DEDAO_ACTIONS=['recommend','adopt','framework','finalize','download'] as const;
export const DEDAO_STAGES=['等待执行端','推荐选题','采用推荐','确认框架','撰写正文','团队审稿','事实核查与修正','确认定稿','下载 Word','上传网站','提交小鱼','已提交'] as const;
export type DedaoAction=typeof DEDAO_ACTIONS[number];
export function positiveCount(n:unknown):number{if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1)throw new DedaoError('生成篇数必须是正整数');return n;}
export class DedaoError extends Error{}
export function dedaoPublicError(error:unknown){return error instanceof DedaoError?error.message:'任务状态未确认，请刷新核对同一批次；不要重复发送、上传或求助';}
export function dedaoInstructions(){return {
 conversation_url:DEDAO_URL,messages:DEDAO_MESSAGES,
 content_authority:'得到大脑决定选题、标题、框架和最终稿。Codex 只推进流程，不添加内容意见。沿用此已有对话与写作约定。',
 serial_rule:'每篇确认定稿后下载最新 Word，读取实际字节，上传本网站并确认小鱼提交，再开始下一篇。完成标准仅为提交给小鱼。',
 recovery_rule:'每条消息/下载前先 begin_dedao_action。只有 execute_action=true 允许动作；否则先检查同一对话/已有文件，confirm_dedao_action记录实际结果。生成、整理历史或发送不可用时等待。主动进入下一阶段则记录 auto_advanced，不重复确认。登录失效或无法核验时暂停。',
 evidence_rule:'观察记录是执行者的实际回执，不是服务器对对话语义的认证。保留真实会话、回应/正文版本、下载文件名/绝对路径/SHA256。已提交条目只读；未知提交先读取对应文章通知，不创建第二事件。',
 };}
