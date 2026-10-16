import {createHotArticleBatch,readHotArticleBatch,claimHotArticleBatch,claimHotArticleCollection,saveHotArticleCollection,failHotArticleCollection,saveHotArticleResearch,startHotArticleEditorial,finalizeHotArticleEditorial,failHotArticleResearch,listPendingHotArticleWork,closeStaleHotArticleCollection,dispatchHotArticleBatch,hotArticleExecutionInstruction} from './hot-article-imitation';
import {createImitationAuthorityV3,readImitationAuthorityPreview,editorialAuthorityV3PublicError,imitationAuthorityV3Scope,editorialAuthorityV3Tools} from './editorial-authority-v3';
import {HotArticleError} from './hot-article-imitation';
import {acceptImitationClaudeTransport} from './hot-article-claude';
const id={type:'string',format:'uuid'},text={type:'string'},sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const list=(items:Record<string,unknown>,minItems=0,maxItems=100)=>({type:'array',items,minItems,maxItems});
const actor=object({actor_id:id,model:text});
const source=object({id:text,title:text,url:text,published:text,event_date:text,accessed:text,context:text});
const fact=object({id:text,text,source_ids:list(text,1,20),context:text});
const result=object({proposals:list(object({reference_id:text,body_sha256:sha,topic:text,angle:text,novelty_basis:text,structure:object({opening:text,progression:list(text,2,6),evidence_method:text,ending:text}),materials:text,sources:list(source,0,20),facts:list(fact,0,40),source_origins:list(object({source_id:text,origin_url:text,relationship_context:text}),0,20),eligible:{type:'boolean'},blocker:{type:['string','null']}}),0,5),participants:object({writer:actor,outline_reviewer:actor,structure_reviewer:actor,fact_checker:actor,verifier:actor}),research:object({actor_id:id,model:text,execution_id:id}),full_text_read:{type:'boolean',enum:[true]},reference_conclusions_used_as_facts:{type:'boolean',enum:[false]},notice:text});
const tool=(name:string,description:string,properties:Record<string,unknown>,required=Object.keys(properties),readOnlyHint=false)=>({name,description,inputSchema:object(properties,required),annotations:{readOnlyHint,destructiveHint:false,openWorldHint:false}});
const authoritySchema=editorialAuthorityV3Tools[0].inputSchema;
const nullableText={type:['string','null']};
const acquisitionRead=object({url:text,title:text,published_at:nullableText,category:nullableText,method:{type:'string',enum:['indexed_search','public_web_read','public_browser']},observed_at:text,visible_text:text,body:nullableText,full_text_read:{type:'boolean'},metric_html:text},['url','title','published_at','category','method','observed_at','visible_text','body','full_text_read']);
const acquisitionResult=object({queries:list(text,0,4),reads:list(acquisitionRead,0,12),notice:text});
const paidEvidence=object({confirmed_scope:{type:'string',enum:['haoduoyu_hot_article_imitation_paid_model_calls']},cost_permission:{type:'string',enum:['explicit_owner_unbounded_within_hot_article_imitation_only']},source_message_id:text,quoted_evidence:text,quoted_evidence_sha256:sha,confirm:{type:'boolean',enum:[true]}});
export const hotArticleTools=[
 {...tool('read_hot_article_imitation_start_preview','本人只读热文新scope授权预查：复用现有readClaudeOutputCapability读取当前实际配置模型的正常relay metadata，返回输出cap及来源证据、当前完整规则hash；不返回密钥、不调用/messages、不创建grant或收费。预查不是授权，创建时服务器重读当前配置/cap并冻结。不要用read_claude_config旧固定14000猜值。',{},[],true),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
 {...editorialAuthorityV3Tools[0],name:'create_hot_article_imitation_authority',description:'记录用户已明确同意的热文模仿完整链常规授权。必须使用真实owner消息和精确SHA证据，冻结现有两作者模型及完整三个固定参考。独立scope，旧daily/test/continuation授权不扩权。没有单独paid_model_calls本人支出证据时冻结为0付费；不得从产品scope或旧无限费用推导支出权限。不会收费、写文、恢复计划或创建订阅。',inputSchema:{...authoritySchema,properties:{...authoritySchema.properties,confirmed_scope:{type:'string',enum:[imitationAuthorityV3Scope]},paid_model_calls:paidEvidence}}},
 tool('create_hot_article_batch','仅在本人刷新请求后正常采集今日头条文娱文章，不限今天发表。静态页面需补充时用同batch正常原生公开搜索/阅读，articles与未核验leads合计最多5篇，缺指标null，不把线索冒称热榜。无写作授权可免费采集线索；完整正文、本篇可核验阅读至少100000及独立授权有效才开始写作。稳定request_key回读同意图。',{request_key:id,writer:{type:'string',enum:['xiaoyu_agent0YYLX','claude_provider']},authority_id:id},['request_key','writer']),
 tool('read_hot_article_batch','只读指定精确batch_id或request_key；未指定时列出本人批次。不返原文长全文或凭证，不派送不收费。',{batch_id:id,request_key:id},[],true),
 tool('list_pending_hot_article_work','payload缺失时只读持久队列返回的明确batch_id并逐项回读；不猜最新ID、不建新run、不重复收费或重建订阅。',{},[],true),
 tool('close_stale_hot_article_collection','按原batch_id安全关闭超过三分钟仍collecting的失联意图，不重新采集、派送、写文或收费；未到窗口则拒绝关闭。',{batch_id:id}),
 tool('claim_hot_article_collection','认领本人明确刷新下的同batch公开采集，不需要写作grant、不授予或使用付费权限。只返回公开来源输入与挥发token，不向搜索提交私密稿；collection_queued或过期collecting_public原子赢家才执行。',{batch_id:id}),
 tool('save_hot_article_collection','保存实际正常公开web搜索/阅读的同batch结果。严格原始可见证据/标题/正文绑定、时间、URL、100000B限制；indexed_search只能leads、指标null、不当全文。public read须完整正文及本篇可核验阅读至少100000才可推荐；metric_html只能提交正常公开读取的原始HTML，通过文章身份绑定JSON-LD取数，不从整页文字借用旁栏指标；拿不到则null；日期不限今天，缺指标仍显示真实线索。真实执行者审计不是平台签名。完成同hash幂等、旧claim/input晚到不可覆盖；不收费。',{batch_id:id,claim_token:text,input_sha256:sha,result:acquisitionResult}),
 tool('fail_hot_article_collection','保存同公开采集认领的真实阻塞，保留原批次和证据；不重建、不付费、不伪装成功。',{batch_id:id,claim_token:text,input_sha256:sha,message:text}),
 tool('claim_hot_article_research','原子认领真实热文研究；仅赢家获得内存claim_token与内部全文供实际阅读。逐篇抽象结构并另查独立素材，结果由系统自动选择。'+hotArticleExecutionInstruction,{batch_id:id}),
 tool('save_hot_article_research','保存真实完整阅读、抽象结构、独立研究材料、来源、事实及实际参与者身份。服务器按充分证据/近期去重/新角度自动选择一篇，不让用户填框架；终态同hash幂等，不同内容不能覆盖。',{batch_id:id,claim_token:text,input_sha256:sha,result}),
 tool('start_hot_article_editorial','按原批次唯一稳定owner/batch/writer链接创建并初始化V3原全链；保存不确定只能回读同批次。不会在此调用付费模型。',{batch_id:id}),
 tool('finalize_hot_article_editorial','仅在独立最终全文复核通过和当前完整正文hash吻合后，原创性检查→同article一次冻结保存为本站text_saved文字稿，流程结束；不配图、不生成Word、不投递平台。重复调用只读同一文章与hash。',{batch_id:id,expected_final_sha256:sha}),
 tool('fail_hot_article_research','记录当前认领的真实阻塞原因，不伪装完成或空结果为合格。',{batch_id:id,claim_token:text,message:text}),
 tool('dispatch_hot_article_research','仅首次派送尚未尝试的独立热文事件。callback已接受/不确定均不得重派，可由正常云端执行者按精确队列ID认领。',{batch_id:id}),
 tool('probe_hot_article_claude_transport','可选新scope正规MCP SSE零收费330秒诊断；用同正式入口运输，不消费provider、不调用历史continuation、不把server送出当client收到。收到完整最终probe_id后由本人实际证据记录验收。',{authority_id:id}),
 tool('accept_hot_article_claude_transport','可选：本人真实确认收到该授权330秒零收费探测最终响应后记录诊断。不借历史测试许可，不扩大scope，不立即收费。',{authority_id:id,probe_id:id,source_message_id:text,quoted_evidence:text,quoted_evidence_sha256:sha,confirmed_scope:{type:'string',enum:['hot_article_imitation_transport_acceptance']},confirm:{type:'boolean',enum:[true]}}),
 tool('execute_hot_article_claude_stage','只在新scope常规授权、批次冻结绑定、真实stage claim都有效时，通过正规服务器MCP SSE执行Claude outline/body/必要revision一次。唯一V3 receipt已存在则缓存回读；unknown/failed只能读原run/stage/receipt，不收费重试。',{run_id:id,stage_id:id,token:text,expected_model:text,expected_input_sha256:sha,confirm:{type:'boolean',enum:[true]}}),
];
export const hotArticleEvent={name:'hot_article.research_requested',description:hotArticleExecutionInstruction,delivery:['webhook'],inputSchema:object({}),payloadSchema:object({batch_id:id})};
export async function hotArticleCall(owner:string,name:string,args:Record<string,unknown>){
 if(name==='read_hot_article_imitation_start_preview'){try{return await readImitationAuthorityPreview(owner,args);}catch(error){throw new HotArticleError(editorialAuthorityV3PublicError(error));}}
 if(name==='create_hot_article_imitation_authority')return createImitationAuthorityV3(owner,args);
 if(name==='create_hot_article_batch')return createHotArticleBatch(owner,args);
 if(name==='read_hot_article_batch')return readHotArticleBatch(owner,args);
 if(name==='list_pending_hot_article_work')return listPendingHotArticleWork(owner);
 if(name==='close_stale_hot_article_collection')return closeStaleHotArticleCollection(owner,args);
 if(name==='claim_hot_article_collection')return claimHotArticleCollection(owner,args);
 if(name==='save_hot_article_collection')return saveHotArticleCollection(owner,args);
 if(name==='fail_hot_article_collection')return failHotArticleCollection(owner,args);
 if(name==='claim_hot_article_research')return claimHotArticleBatch(owner,args);
 if(name==='save_hot_article_research')return saveHotArticleResearch(owner,args);
 if(name==='start_hot_article_editorial')return startHotArticleEditorial(owner,args);
 if(name==='finalize_hot_article_editorial')return finalizeHotArticleEditorial(owner,args);
 if(name==='fail_hot_article_research')return failHotArticleResearch(owner,args);
 if(name==='dispatch_hot_article_research')return dispatchHotArticleBatch(owner,args);
 if(name==='accept_hot_article_claude_transport')return acceptImitationClaudeTransport(owner,args);
 throw Error('热文操作无效');
}
