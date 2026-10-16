// Never forward parser, database, provider or stack-trace messages to a browser/MCP caller.
import {writingOutlineError} from './writing-outline-template';
const publicErrors=new Set([
 writingOutlineError,
 '待补框架：请先完成标题方向、开头、分节论证和结尾，再开始写文','文章框架需120–8000字，包含标题方向、开头、分节和结尾，写清素材、判断推进和字数安排',
 '仅能续认领本批次已完成的Claude原文，不能再次生成','手动批次参数无效','来源数量需为2–12条','来源格式无效','手动批次编号无效','没有找到本人的本次手动批次',
 '需明确确认本次小鱼和Claude各一篇；Claude最多调用一次，不重试，仅私人草稿','需先核验并完整填写两位作者各自的选题和资料，再创建本次批次','双作者需分别冻结不同选题',
 '写作提示词已变化，请重新读取完整写作要求','Claude配置未启用或模型不一致；不会更换模型或密钥','本次唯一手动批次已冻结；不能换资料、换编号或再建批次',
 '需确认仅本批次Claude一次YYLX调用，14000输出、300秒、不重试，仅私人草稿','文章认领信息无效','模型与本批次冻结配置不一致','没有本批次的有效本人Claude认领',
 '手动Claude认领已过期，不能发起模型调用','Claude配置已变化或未启用，本次停止','已有请求与本批次冻结资料不一致，不会再次调用',
 '手动Claude文章认领不一致','仅能保存本批次已完成的真实Claude结果，不会重新调用','已完成结果与本批次不一致','请求状态待核验，不会再次调用',
 '手动批次只允许小鱼与Claude','手动批次文章认领不一致','本批次文章已冻结，只能原样保存','手动稿必须使用冻结的选题和来源','手动稿与冻结生成记录不一致','手动批次正文须为2000–3000字',
 '提交资料过长','缺少提交资料','文章格式无效','至少保留两个事实来源','Claude结果不是可保存的文章JSON','Claude文章必须与实际生成结果一致','没有已完成的Claude生成结果','保存结果待核对，请先读取任务','文章尚未完成','配图连接不可用，文章已保存','写文认领已失效'
]);
export function manualPublicError(error:unknown,fallback='手动批次未完成；请读取状态，不要重新调用'){
 const message=error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'';
 return publicErrors.has(message)?message:fallback;
}
