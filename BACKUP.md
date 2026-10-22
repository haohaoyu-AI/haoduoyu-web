# Website runtime source backup

Destination: haohaoyu-AI/haoduoyu-web, branch codex/ui-refactor-20261021.
This branch exports the production website runtime sources and the sequential UI source changes, excluding screenshot evidence, runtime credentials, database contents, test/replay fixtures and local generated files. Original UI commit IDs are recorded in each commit message. Exported Git commit IDs differ because excluded evidence is not uploaded; existing repository history and main are unchanged. Exact original history remains in the local verified UI-HISTORY.bundle.

Build with Node24: npm ci --ignore-scripts --no-audit --no-fund; node scripts/build.mjs; node scripts/package.mjs. Local preview/test fixtures are deliberately excluded from this runtime-only backup. The existing npm dev/test entries therefore require the separate private evidence checkout.

This is a private code backup, not proof that all branches, past repository content, Actions logs or rulesets are safe to make public. Deployment project IDs and internal operational documentation remain configuration metadata; no runtime secrets or production rows are included.
