import {legacyFixedWritingReferences,legacyFixedWritingVersion} from './writing-fixed-references';
import {rewritePrompt} from './writing-rewrite-v2';
import {writingPromptV22,writingPromptV22Version} from './writing-prompt-v22';
// Legacy supplement exports are retained for historical callers only. They are
// already integrated into V2.2 and must not be appended to new prompts.
export const writingSupplementVersion='表达补充·20261005-06';
export const writingSupplement='日期表达：当年近期事件，正文默认省略年份，例如“10月4日上午10点”，不要机械写成“2026年10月4日上午10点”。历史回顾、跨年对比、非当年事件或省略年份会产生歧义时，保留必要年份。以北京时间写作日期判断当年；不得删掉区分事件所必需的时间信息。资料来源、核验记录仍保留完整日期。这条仅用于生成和定稿前检查，不自动改写已经进入配图排版的冻结正文。';
export const sourceExpressionSupplement='出处表达：正文以自然叙述和作者判断推进，不机械、逐句重复“央视采访记录”“新华社则提到”“据某媒体报道”等报道腔，不写成论文。已核验的事实和数字可直接自然讲述，完整出处集中放在独立资料说明。直接引语、争议说法、不同消息版本或判断某一方责任确需归属时，保留必要且自然的出处交代；不能把采访转述改装成作者亲历、亲眼观剧或事实已获证实。事实仍须可追溯，此补充只改变行文方式，适用于定稿前。';
export const narrationSupplement='第一人称与叙事：删除跳出文章、解释写作过程或写作边界的自我说明，例如“顺带一句，我在这里只谈……”或“本文不打算……”。不要在文章中途突然用“我不喜欢”“我认为”“我看”等自我宣告打断分析；把判断自然融入人物、作品、事件的事实与逻辑。第一人称只用于真实的观点、判断或有根据的经历，不为凑“我”的统计次数硬插说明。直接围绕人物、作品、事件及其逻辑推进，不添加与内容无关的免责声明式插话，也不得编造亲历、观影或采访经历。只在写作和定稿前检查，冻结正文不据此自动改写。';
export const entertainmentSupplement='娱乐号文风：以自然口语推进，适当调侃和幽默，少生硬说理；笑点从有根据的事件、反差与围观现象中产生，不编段子或事实，不堆网络梗，不拿人物困境开玩笑。';
export const mobileReadingSupplement='手机阅读节奏：短句为主，多分段，通常1–2句一段，适合自媒体快速阅读；不机械硬切语义，不变成碎片口号。此条优先于旧的一般性“避免短句”“避免单句段”等默认要求。';
export const expressionPriority='以下表达补充是最新明确要求，适用于新生成和未冻结改稿；与旧的默认文风规则冲突时，以这些补充为准。完整范文、事实边界、正文2000–3000字和排版参数继续保留。不得自动回填旧快照或改写冻结正文。';
export const legacyEffectiveWritingPrompt=rewritePrompt+'\n\n'+legacyFixedWritingReferences+'\n\n'+expressionPriority+'\n\n'+sourceExpressionSupplement+'\n\n'+narrationSupplement+'\n\n'+entertainmentSupplement+'\n\n'+mobileReadingSupplement;
export const legacyEffectiveWritingStyleVersion=legacyFixedWritingVersion+'·'+writingSupplementVersion;
export const effectiveWritingPrompt=writingPromptV22;
export const effectiveWritingStyleVersion=writingPromptV22Version;
