# Phase6: explicit local article import

This CLI is stacked on `2e83203255f8f38c80e5ed32c8d275edc47141b6`. It adds local scripts only: no application route/UI/schema/storage/todo/notes changes, no deployment, credential setup, cron or real import. Development and tests use synthetic files and simulated HTTP services. The already verified Phase4 release does not depend on this tool.

## Default: fully offline dry-run

Node24 on Linux is required. In the repository root:

```sh
node scripts/article-import.mjs --config /ABS/selected-config.json --root /ABS/selected-source-root
```

`--dry-run` is optional because it is the default. No token is read and no HTTP request is made, even when an environment token happens to exist. The JSON output is the business import plan, not a database backup. Redirecting it to a file is an explicit caller action; the CLI does not silently persist it.

Configuration:

```json
{
  "format": "haoduoyu-article-import-config-v1",
  "entries": [{
    "directory": "tt/tt1_1024",
    "run_dir": "tt1_1024",
    "account_id": "toutiao-haoduoyu",
    "platform": "toutiao",
    "slot": "tt1",
    "run_date": "2026-10-24",
    "source_timezone": "Asia/Shanghai",
    "writer": "dedao",
    "illustrator": "codex"
  }]
}
```

The example is synthetic, not a statement about user files or a slot schedule. Account/platform/directory/identity are explicit. `directory` is local and is not emitted; `run_dir` is the separately configured business identity and preserves slashes. Neither MMDD nor the title supplies a year, platform or date. At most50 selected entries are read sequentially, with a64MiB batch read budget. Unknown configuration keys, security fields and prototype keys are refused.

Each selected directory reads only timelog.txt, check.md, title.txt and article.txt. Optional root-relative `used_topics` and `used_samples` paths must name their corresponding known files; there is no directory scan. UTF-8, regular-file, link, descriptor and before/after identity checks fail closed. Hard limits:1MiB/file,4MiB/entry,20,000 reader lines/file,256KiB configuration; the strict parser additionally caps each source at5,000 lines. Limits cannot be raised by configuration. All symlinks/hardlinks, traversal, unsafe paths and detected changes are rejected; unsupported platforms have no unsafe fallback.

## Recognized source grammar

- timelog: `YYYY-MM-DD HH:mm:ss 阶段 开始/结束：说明`. Known stages are 流水线、选题、写作、配图、导入. Explicit `Asia/Shanghai` or `UTC` is required for unzoned log times; stored timestamps are UTC. `run_date` compares the converted Beijing calendar date, including cross-midnight inputs. A unique full log date may establish it; ambiguous/conflicting dates fail, never take a year from the directory.
- A saved status requires a same-line explicit marker such as `2026-10-24 08:30:00 导入 结束：草稿已存 pgc_id=7699934907375567402`, or corresponding appmsgid/editor_url for the configured platform. An ID elsewhere is insufficient. An explicit valid configured non-published status is operator input, not an inferred success. If status remains unknown the entry cannot apply.
- check.md supports explicit labels such as `- 字数: 2236`, `- 小标题: 5`, `- 图数: 25`, `- watchdog 重跑次数: 1`, `series_no`, and `封面描述`. Counts must be valid nonnegative safe integers (series positive). `标题数` is not guessed to mean subheadings. Contradicting values fail the entry; identical duplicates retain their source references.
- title.txt must have exactly one nonempty title line. article.txt is hashed/measured only: its body is never copied to notes, the manifest or an HTTP payload. No character or heading count is invented from it.
- used_topics.txt / used_samples.txt: `YYYY-MM-DD | 作者 | 标题 | used for 第N篇`. Only an exact unambiguous match is attached as business evidence. Author labels do not silently select an account or writer enum.

Unsupported formats yield issue codes and source line references. Missing/unparsed values remain NULL in `record`; `proposal` includes only proven/configured values, so unknown NULLs do not clear existing remote fields. Raw log text, article body, absolute paths and credentials are absent from reports. IDs stay strings; editor_url is syntax-checked HTTP(S), never visited. Warnings and done-state semantics match Phase4. The complete synthetic result is in [the example JSON](examples/article-import-tt1_1024.synthetic.json).

## Plan and explicit apply

Offline `candidate` means **new/update candidate, target not contacted**; it does not claim a remote record is absent. `update_candidate` has an explicitly supplied baseline awaiting verification. Identical input identities are skipped; conflicting identities (including different accounts) fail before any network request. Other independent valid entries survive partial failure.

Apply requires all three explicit flags, plus `HAODUOYU_IMPORT_TOKEN` supplied through a safe environment, never an argument/configuration/file. Actual credential transfer and production apply require separate authorization; the following is a usage form, not an instruction to run it now:

```sh
node scripts/article-import.mjs --config /ABS/selected-config.json --root /ABS/selected-source-root --apply --confirm-apply --origin https://approved-target.example
```

Use a read/write API key for only the intended accounts. The tool never changes account authorization. HTTPS origin must be exact with no path/query/userinfo; redirects are not followed. `--allow-loopback-http` is an explicit local mock-test exception only. Default bounded transport: at most50 CLI entries,1000 requests,5000 rows,25 pages/cohort, response/request/time limits; a limit or incomplete read stops unsafe processing. It reads every page of all five status cohorts and then current detail/version. The lists are **not an atomic snapshot**; server CAS and unique identities remain the final guards.

An existing exact business match is skipped. Differences are never overwritten automatically: require per-entry `expected: {"id":"...","version":1,"fields":{"title":"confirmed old title"}}`, with complete old values for every changed top-level field (whole JSON value for a changed JSON field). The current ID/version and baseline must still match. CAS conflict stops that row without refresh-and-overwrite. New records use version0 and a stable Idempotency-Key. Unknown series numbers remain absent in the proposal; only the actual new-record/old-NULL request adds explicit series_no NULL to suppress the API's title default, never clear an existing non-NULL number.

After an uncertain PATCH, the tool makes **no automatic second write**: it reads back authorized state. A match is `verified_unknown` with delivery still unconfirmed; no match is pending, and unresolved outcome stops further writes. Exit1 indicates failed/conflicting/pending/not-attempted or unconfirmed delivery; exit0 means a valid offline plan or confirmed apply/skips. Raw HTTP errors and token values are not logged. Local `entries` remain the parse plan; `apply.results` is the separate transport outcome for attempted candidates.

## Verification and release

Run only changed-component checks during development:

```sh
node --test --test-concurrency=1 tests/article-import-*.test.mjs
```

Final complete regression, build and secret scan run once in CI. No real user papers or production writes were used. Apply is prepared and tested against simulated services, not a claim of a successful production import or real edge quota/CPU validation.
