# OpenAI API frontend

The V字 content review overview contains its own analysis panel outside the article disclosure. Existing metric filters, rows, fullscreen and collapse controls are unchanged. The entry is also available when no articles have been registered; the backend rejects an empty initial input before any provider call.

## Private access and truthful status

Public business mode shows an administrator login link. Private configuration and analysis records are requested only for a signed-in non-public session. The backend's owner check is authoritative; a non-owner session cannot load the configuration or enable a paid action. Configuration availability means key plus explicit model are configured, not that connectivity has been tested. No key input or credential value appears in the UI.

All OpenAI operations use apiNetwork with local auth redirect suppression. None uses the offline mutation queue. Server owner/CSRF checks remain required. Other public business permissions are unchanged.

## Request recovery

A run UUID is persisted under the owner ID and V字 before POST. A storage failure prevents submission. While an identity is unresolved, another click cannot POST a new run. Reload, timeout, and network failures reconcile with GET only. The paid analysis POST timeout is 210 seconds, allowing four 45-second provider rounds plus 30 seconds of overhead. Reads, configuration and explicit release retain a 75-second timeout. A timeout does not mean the provider did not run. Active runs are read every five seconds while the review page remains visible. Read errors and uncertain status stop automatic polling and retain a manual check action.

An existing in-flight run returned by the server is adopted. An explicit known preflight rejection may clear the local request because the backend guarantees no reservation/provider dispatch occurred. Unknown outcomes never silently clear the request. Local state and async rendering are isolated by owner, public-session status, and session epoch. Backend uniqueness remains the authority across browser tabs/devices.

An uncertain run or a missing request ID can be explicitly ended only after a warning that the API may already have charged. The release endpoint must return a persisted server receipt before local state unlocks. For a missing ID, backend cancellation prevents a delayed original POST from dispatching. Releasing never automatically starts another analysis.

## Instructions

Settings has a separate OpenAI API tab, including a public login-only entry. Editing is local until explicit Save. PATCH sends the saved version, and a conflict keeps the user's exact text. Reading the latest server version shows it beside the local edit. The user must explicitly accept the new base version before saving their edited text. Unconfirmed edits are retained per owner in localStorage and beforeunload warns; failed storage additionally guards click navigation. No private draft is restored for anonymous visitors or a different owner.

## Diary

AI 日报 has the third module named OpenAI API. It uses the existing calendar, but its date is the actual run creation day in Asia/Shanghai. Multiple same-day runs remain separate, newest first, with visible seconds and model/instruction version when supplied. The report uses the existing allowlisted safe Markdown renderer. Internal summaries and pending-verification objects are never rendered. Existing AI汇报 keeps its prior-work-day semantics. A full run with an explicit null `baseline_run_id` is labeled 首次全量分析; a full run with a previous successful baseline is labeled 全量重查. Missing baseline metadata uses the neutral 全量分析 label.

Deep link: `?page=ai-reports&ai_tab=openai&date=YYYY-MM-DD&openai_run=UUID`. Tab/date remain selected through calendar navigation. History is fetched separately from `/openai-review/runs`, never mixed into author reports.

## Validation

`node --test tests/openai-review-ui.test.mjs` covers same-day/date boundaries, safe Markdown/metadata, owner/public UI, article disclosure placement, duplicate clicks, persistence before POST, reload/404 recovery, cross-tab guards, storage failure, stale session results, deterministic rejections, acknowledged release, prompt error/conflict/version retention, and deep-link normalization. Existing diary/Markdown/mobile-disclosure regression tests remain applicable. Browser QA and the final unified build are performed by the parent task. No paid provider calls or production mutations are part of these tests.
