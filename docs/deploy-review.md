# Parameterized review release

This local command accepts a full commit SHA. It does not change the fixed-SHA GitHub workflow or deploy on a main push. Run it from a clean checkout of the requested commit after the normal release checks have passed. Node 24 and the lockfile dependencies must already be available.

```sh
npm run build
npm run check:artifacts
export CLOUDFLARE_ACCOUNT_ID='<existing-account-id>'
export CLOUDFLARE_WORKER_NAME='haoduoyu-prod'
sh scripts/deploy-review.sh <full-commit-sha> --expected-current-version <freshly-verified-active-version-uuid>
```

The default mode is `preflight`: GET requests and private local evidence only. It checks exact HEAD and a clean tracked/untracked checkout, runs `check:artifacts`, and compares `dist/server/index.js` with an in-memory build of the current Worker source. It never regenerates artifacts. Build and commit any generated source changes before using the command.

Use `CLOUDFLARE_API_TOKEN` from an existing authorized environment. If absent, the command reads an existing Wrangler OAuth login locally, including the Windows `%APPDATA%/xdg.config/.wrangler/config/default.toml` location. `WRANGLER_OAUTH_FILE` can select an existing login file. It never logs credentials, starts login, refreshes OAuth, writes credentials, or changes proxy environment variables. An expired login blocks the command.

After preflight, stop all other local and cloud upload/deploy paths and reconcile any previous uncertain writes. Then use the same commit and freshly verified expected version:

```sh
LOCAL_UPLOAD_STOPPED=true sh scripts/deploy-review.sh <full-commit-sha> \
  --expected-current-version <freshly-verified-active-version-uuid> --mode deploy
```

The shared publisher currently permits only the existing `haoduoyu-prod` Worker. It requires latest uploaded version and the sole 100% active version to equal the expected UUID, inherits existing bindings strictly, checks supported runtime/settings and absence of native assets, and rechecks state immediately before each write. It does not apply D1 migrations. A local exclusive lock prevents overlapping copies of this command; external deployment paths must remain stopped because Cloudflare's upload/deployment APIs do not offer a cross-request compare-and-swap.

Evidence defaults to a fresh directory under the current user's OS temporary directory, `haoduoyu-release/<timestamp>-<uuid>`. `--evidence-dir <new-directory>` selects another already-private destination outside every Git checkout. The backup contains current version metadata, the latest 100 version entries, deployment, script settings, and combined settings; these can contain private binding values. Keep it local. Console output is limited to status, commit, hashes, sizes, version/deployment IDs and the evidence path. On Windows, directories inherit existing local ACLs without changing permissions; on POSIX, directories/files use 0700/0600. Do not select a shared destination.

If the result is `uncertain` or `uploaded_not_deployed`, inspect the recorded observed IDs and read Cloudflare's actual versions/deployment before any further write. There is no automatic retry, cleanup, or rollback. A crash may leave `<os-temp>/haoduoyu-release/<account>-haoduoyu-prod.lock`; remove it only after confirming the original process has stopped and any write outcome has been reconciled.

## Code rollback

Retain the pre-release active version UUID from `release-input.json` and `cloudflare-before.json`. Before rollback, stop other deployment paths again and read the latest deployment with an already installed, supported Wrangler CLI:

```sh
wrangler deployments list --name haoduoyu-prod
```

Require its sole active 100% version to equal the new version you intend to replace (`<expected-active-version-uuid>`). If it differs, stop and reconcile; do not roll back someone else's release. With that guard confirmed immediately before the write, redeploy the retained version:

```sh
wrangler versions deploy <retained-pre-release-version-uuid>@100% --name haoduoyu-prod --yes
wrangler deployments list --name haoduoyu-prod
```

Confirm the retained version is now the sole 100% active version and perform the normal smoke checks. The Wrangler command itself has no expected-active CAS flag, so preserve the exclusive handoff throughout the guard and write. Review attribution adds four nullable columns compatible with the prior Worker: rollback code only; do not revert D1 schema, restore a database backup, or delete review data. These commands are instructions, not actions performed by the release script.
