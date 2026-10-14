// This contract describes the supported executor, never a submission permit.
export const articleUploadRuntimeVersion='2026-10-10-private-draft-executor-8';
export const articleUploadProtocol="Read read_article_handoff once. The runner is the independent createPrivateDraftExecutor normal-first-import state machine; the rejected legacy 109KB runner is not its implementation or a fallback. Verify current full SHA/size/runtimeVersion for the new runner and authenticated bridge in healthy matching host sessions before any picker or permit. Source pagination and downloads transport data only. Load each complete readable definition program once through the documented host JS entry after checking the entire actual call budget and normal host acceptance. Never execute source pages separately, encode rejected source, invent a large local-module loader or switch tools after review rejection. The budget is not host approval. Reuse the same final Word without generating images and verify its actual bytes in the SAME importing executor. Toutiao uses Codex 法 (codex/browser): register the official filechooser wait before clicking the observed real file control, obtain that chooser and call setFiles once under the fresh permit. Zhihu uses 坐标法 (coordinate/native): the actual supported host locates current screenshots, single-clicks each import menu/dialog/file control with stable-page waits, confirms the exact Word selection and single-clicks native Open once under the fresh permit. Relocate after window changes, never default to double-click or use TinyFish. Named methods remain platform-bound; an explicit picker without a method preserves only its original host contract and authorization. Missing host capability stops without fallback. The small executor supports normal new_import and explicitly bridge-approved owner_confirmed_first_import; reimport, unconsumed continuation, restored checkpoint authority and draft editing/repair stop read-only with history preserved. Prepare the actual picker before reserve/consume. Only fresh execute_import=true authorizes ONE file submission after the saving acknowledgement. Unknown outcomes are read-only; failed or unknown responses never replay a consumed grant. Save privately, independently reopen the same draft, verify full title/body/captions/images/order/anchors and Zhihu cover, record the actual saved/failure/unknown result and finish only the truly stopped and settled execution. Never publicly or later publish or change/delete user drafts.";

export const articleUploadRuntime={
 version:articleUploadRuntimeVersion,
 contract_version:7,
 read_only:true,
 execute_import:false,
 source_format:'standalone_js',
 execution_contract:{
  implementation:'independent_normal_private_draft_fsm_v1',
  supported_import_modes:['new_import','owner_confirmed_first_import'],
  unsupported_actions:['reimport','unconsumed_continuation','restore_checkpoint_authority','edit_or_repair_draft'],
  unsupported_result:'Stop read-only before a picker or permit; retain the exact Word, current platform state and all history. No fallback to the rejected legacy runner.',
  loading:'One complete readable definition program per independent runner or authenticated bridge, submitted normally to the documented host JavaScript entry. Source pagination is transport only, never separate execution. No encoded source, undocumented local-file loader, dynamic import of the rejected runner or alternate-tool retry.',
  observed_host_error:'JavaScript execution exceeds the 64000-byte strict auto-review limit',
  project_budget:{max_source_utf8_bytes:61000,max_json_quoted_utf8_bytes:62000,reserved_call_utf8_bytes:2000},
  approval:'The project budget is an offline engineering check. Check the entire actual JS call and obtain normal host acceptance before any action; size, SHA and source reads do not prove approval or browser/native capability.',
  session_requirement:'The actual documented host must retain the same healthy private session across awaited calls. Never infer persistence from a source read, restore a chooser/grant from checkpoint or let an unawaited action run across calls. Missing persistence or supported browser/native capability stops before a picker or permit.',
  acceptance_evidence:'Real CUA acceptance and real platform save are separate tests; neither is asserted by this descriptor.',
 },
 modules:{
  runner:{read_tool:'read_article_upload_runtime',module:'runner',download_path:'/api/articles/upload-runtime?module=runner',entrypoint:'createPrivateDraftExecutor',implementation:'independent_normal_private_draft_fsm_v1',execution_environment:'documented_host_javascript_session'},
  bridge:{read_tool:'read_article_upload_runtime',module:'bridge',download_path:'/api/articles/upload-runtime?module=bridge',entrypoint:'createArticleUploadBridge',includes:'createUploadToolCall, createArticleUploadHost and fixed public errors',execution_environment:'authenticated_tool_host'},
 },
 source_transport:{preferred:'authenticated_mcp',tool:'read_article_upload_runtime',request:'Handoff already includes full SHA/size for both modules. Verify an existing download directly. Otherwise pass article_id/module/expected_version/offset=0 to read source, retaining sha256 on continuations. metadata_only=true returns only the expected digest for existing downloaded bytes',assembly:'Concatenate exact source_text in offset order and verify each chunk_sha256 and the full UTF-8 SHA256/size/version as data. The complete independent program, with the entire actual call, must pass normal host review. Never execute transport pages separately or disguise rejected source.',browser_alternative:'A supported download event can transport source bytes only; it does not provide a large-module execution entry. Inspect actual download evidence. Do not disable protection or restore/reset the browser to fetch or load source.'},
 source_verification:{handoff_fields:['modules.runner.sha256','modules.runner.size','modules.bridge.sha256','modules.bridge.size'],mcp_fields:['version','sha256','size','chunk_sha256','offset','next_offset'],version_header:'X-Haoduoyu-Upload-Runtime-Version',sha256_header:'X-Haoduoyu-Upload-Source-SHA256',entrypoint_property:'runtimeVersion'},
 adoption:'Reuse only normally accepted definitions with matching full SHA/runtimeVersion in healthy corresponding host sessions. Source verification is not execution approval. Read missing/different definitions before a picker or permit and normally load the complete independent changed pair in fresh supported sessions. Never hot-replace an active closure or restore permits, choosers or checkpoint authority; the small first-import executor refuses restored workflow checkpoints.',
 normal_flow:{automatic:true,per_step_user_confirmation:false,handoff_reads:1,runtime_downloads:'Only when absent or the verified source SHA/runtimeVersion differs; prefer authenticated MCP source reads without browser download',steps:['Read handoff and reuse the matching runtime','Reuse the exact final Word without new images; check its named file fingerprint in the importing executor once','Use Toutiao Codex 法 or Zhihu 坐标法; prepare one picker, reserve/consume and submit once','Wait for private saved state; images already loaded require no scrolling','Independently reopen once, verify full content/cover, write back the actual result and finish the settled execution'],exceptions:'Diagnostics and linked recovery only for actual failures; normal uploads need no recovery probes'},
 picker_selection:{
  default_by_platform:{toutiao:'browser',zhihu:'native'},
  method_by_platform:{toutiao:'codex',zhihu:'coordinate'},
  session_field:'picker_mode',
  method_field:'upload_method',
  values:['native','browser'],
  selection:'Default by platform, independent of which other tools the host has. Named upload_method must match its platform and picker mode. An explicitly supplied picker_mode without upload_method preserves the original independent-test route without a fixed method name or new authority.',
  explicit_picker_mode_compatibility:{values:['native','browser'],requires_explicit_mode:true,named_method:false,automatic_fallback:false,authorization:'Preserves only existing independent-test authorization and the original host contract. Website uploads still require normal reserve/consume, exact Word/platform/account scope and one submission; standalone test exemptions never become website bypasses.'},
  immutable_after_session_creation:true,
  on_missing_host_tools:'Stop with blocked/picker_failure or account_read_failure; retain the Word and attempt without claiming a chooser/window opened or switching methods',
  on_timeout:'Stop and read the same attempt. Never register a second picker, switch channels or replay a consumed grant in this session.',
 },
 browser_file_picker:{
  platform:'toutiao',method:'codex',method_name:'Codex 法',
  implementation:'Use the official importing browser documented filechooser event and actual observed webpage file control. No invented locator upload API or native capability fallback.',
  prepare:'Register the filechooser wait first, click the actual file control once, and await the chooser. Do not submit during preparation.',
  submit:'After the fresh single-use consume response and saving state, invoke that same chooser.setFiles once with the exact final Word path.',
 },
 native_file_picker:{
  platform:'zhihu',method:'coordinate',method_name:'坐标法',
  runtime_option:'nativeFilePicker',
  methods:['prepare','inspect','submit'],
  coordinate_contract:'screenshot-single-click-open-v1',
  capability_declaration:'This is the project adapter contract, not an official tool API or proof of actual screenshots/actions. The real supported tool host supplies the adapter and truthful scoped observations.',
  explicit_native_compatibility:'Existing explicitly selected native mode without a named method may use the original prepare/inspect/submit host contract. It is not the named website coordinate route and does not require a new coordinate_contract declaration.',
  implementation:'Supplied by the actual tool host using supported real screen/mouse controls. This website supplies the protocol and source, not a cloud computer or an invented tool API.',
  prepare:'Use coordinate_actions for the current menu/dialog/file bindings. Locate each control on the current screenshot, single-click with the real mouse and wait for the page to stabilize between steps. Observe exactly one actual Open File window; do not select a file or click Open yet. No browser filechooser waiter or DOM locator.click for these import actions. Relocate after any window position or size change; never blindly reuse old coordinates, default to double-click, or use TinyFish.',
  inspect:'Read the same still-open window and exact article/platform/account/browser/executor/tab/editor/purpose scope before submitting; require fresh evidence and no selected/submitted file.',
  submit:'For document import, locate and single-click the approved exact Word row in the same real window, wait for stability and confirm the selected filename/path, then single-click native Open once. Relocate after window position or size changes. Document submission requires the new single-use consume response and recorded saving state; cover/image actions select only the approved existing image and retain their separate owned-draft guards.',
  handles_and_grants:'Volatile only. Native window handles may occur in immediate correlated host receipts held in memory, never in downloads, durable receipts, checkpoints or audit events. Grants stay private. Neither can be restored from persisted evidence.',
  execution_boundary:'Await every actual tool action to settlement in its current supported call. A screenshot requiring a later model judgement must return explicit native_pending state, not leave an unawaited browser/native Promise running across calls.',
  continuation:'Resume only the retained private operation with its exact correlation, unchanged scope/window and fresh actual observation time. Preparation, inspection and submission each continue after their own boundary; never reopen a picker, reconsume a grant or replay Open. Wrong, duplicate, stale or cancelled continuation is refused. Unknown action or cancellation retains ownership until actual settled/closed evidence.',
  continuation_api:{pending_status:'native_pending',resume:'resumeNative',settle_closed:'settleNative',correlation_fields:['runtimeVersion','request_id','request_version','method'],scope_fields:['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'],actual_observation:'The host has awaited all issued actions before returning pending. Resume evidence comes from that observation or a new actual same-window read; observed_at is never callback time.',closure:'A correlated fresh settled/closed-window receipt releases ownership only. It never restores a grant, clears a readonly fence or submits a file.'},
 },
 account_reader:{
  runtime_option:'accountReader',methods:['inspect'],helper:'createZhihuAccountReader',
  when:'Zhihu authenticated profile link disappears or becomes hidden when its avatar menu closes. Static visible account checks remain authoritative; only a missing or hidden Zhihu binding uses this reader.',
  setup:'Observe the real avatar-menu control and authenticated own-profile link on https://www.zhihu.com/ in a separate tab of the SAME supported browser/executor. Pass that verificationTab, menu and accountLink to createZhihuAccountReader; pass the returned accountReader to createPrivateDraftExecutor together with nativeFilePicker.',
  freshness:'Every missing-link check freshly navigates that independent account tab and opens its observed avatar menu. No stored ID, screenshot, checkpoint, cookie or guessed API is an identity source. The response must match the exact task/browser/executor/current-tab/URL/request scope and fresh timestamps.',
  on_failure:'Stop before reserve or submission. Never disable account checks, reopen the avatar menu over the import dialog, or infer identity from an arbitrary profile link.',
  readiness:'One fresh navigation followed by bounded checks for the exact unique visible enabled observed avatar and own-profile link. Ambiguity, changed identity, login/captcha or account mismatch stop immediately. Delayed readiness uses a verified awaitable waitForReadiness adapter or available standard JavaScript timer; in a timerless host, await the documented locator.waitFor visible condition once per control with an explicit positive remaining timeoutMs, then reread actual readiness and identity before clicking. Unknown wait errors stop without retry or cancellation assumptions; a visible disabled control stops when no enabled-condition wait is supported.',
 },
 safe_runner_diagnostics:{method:'diagnostic',original_errors:'Never serialize raw exceptions, stacks or causes; diagnostics expose only fixed non-secret fields',public_fields:'Fixed error names/summaries and exact substeps; count/visibility/enabled fields are not_checked until actually read',persistence:'No raw exceptions, stack, causes, credentials, native handles or grants in checkpoints, bridge requests or audit events'},
 destinations:{
  toutiao:{account:'61556093362',upload_method:'codex',method_name:'Codex 法',picker_mode:'browser',picker_control:'The observed actual Select document/file control',title_policy:'Keep the exact frozen title. A length hint alone does not fail a private draft; actual save failures or missing saved evidence do. Publication and title edits remain outside this flow.',completion:'Private saved indication and independent full title/body/image readback'},
  zhihu:{account:'ren-zhe-ai-chi-yu-52',upload_method:'coordinate',method_name:'坐标法',picker_mode:'native',import_stages:['menu','dialog','file'],picker_control:'Only the import dialog control 点击选择本地文档, never the toolbar or 导入文档 dialog opener',completion:'Independent private draft readback of full body, loaded images/order/anchors and a saved loaded cover verified against the Word'},
 },
 shared_backend:{consume_predicate:'Balanced snapshot comparisons within the D1 expression depth limit; all prior scope/lease/history/file checks retained',word_inspection:'Finalization verifies full frozen text/images once. Upload checks still read and hash actual Word bytes, then reuse the server finalized receipt only when the Word SHA and exact current original/layout digests and image count all match. Missing/changed/legacy/cleaned text falls back to full inspection; no untrusted receipt or process cache'},
};

export function uploadRuntimeSource(module:'runner'|'bridge',sources:{runner:string;bridge:string;host:string;errors:string}){
 const source=module==='runner'
  ? sources.runner.replace(/^export (?=(?:async )?(?:function|const))/gm,'')
  : [sources.errors,sources.host,sources.bridge].map(text=>text.replace(/^import .*;\r?\n/gm,'').replace(/^export (?=(?:async )?(?:function|const))/gm,'')).join('\n');
 const entrypoints=module==='runner'?['createPrivateDraftExecutor','createZhihuAccountReader']:['createUploadToolCall','createArticleUploadHost','createArticleUploadBridge'];
 const complete=source+'\n'+entrypoints.map(name=>`Object.defineProperty(${name},'runtimeVersion',{value:${JSON.stringify(articleUploadRuntimeVersion)}});`).join('\n')+'\n';
 // A project budget fails closed before handoff; it is never host approval.
 if(new TextEncoder().encode(complete).length>61000||new TextEncoder().encode(JSON.stringify(complete)).length>62000)throw Error('Upload definition exceeds the complete-call source budget; no picker or permit is allowed');
 return complete;
}
