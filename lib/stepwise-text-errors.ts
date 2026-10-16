import {writingOutlineError} from './writing-outline-template';

export const stepwiseErrors = {
 invalid: '逐步文字测试参数无效',
 confirm: '本步骤需要明确 confirm: true；请等待用户确认后执行',
 missing: '未找到本人的这次逐步文字测试',
 changed: '本次资料已经冻结，不能更换输入或新建额度',
 model: '当前启用模型与冻结模型不一致；已停止',
 version: '固定提示词版本已变化，请先读取当前版本',
 claim: '本次作者、原稿标识或认领凭证不一致',
 expired: '本次认领已过期，不能生成或首次保存',
 body: '原稿须为标题与正文段落，正文严格为2000–3000字',
 frozen: '原稿已经冻结，只能原样只读回放',
 unknown: '结果未确认，请只读恢复；不能再次调用模型',
 tooLarge: '提交资料过长',
 credentials: '资料或结果含凭证，已停止',
} as const;
const allowed = new Set<string>([...Object.values(stepwiseErrors), writingOutlineError,
 '待补框架：请先完成标题方向、开头、分节论证和结尾，再开始写文',
 '来源格式无效', '待补材料：需保留2–12个公开真实来源', '待补材料：事实来源不能重复',
 '待补材料：选题或事实资料仍不完整',
]);
export function stepwisePublicError(error: unknown, fallback: string = stepwiseErrors.unknown) {
 const message = error && typeof error === 'object' && 'message' in error ? error.message : '';
 return typeof message === 'string' && allowed.has(message) ? message : fallback;
}
