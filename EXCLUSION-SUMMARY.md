# Exclusion summary

Not copied into this review stage:

- Git metadata/history (the source tree had no `.git`), virtual environments,
  bytecode, caches, temporary files, and logs.
- Runtime `data`, `state`, and `config`, including authentication, model
  settings, service records, and other local configuration; browser profiles
  and session state; credentials, tokens, certificates, and private keys.
- User manuscript/topic directories, Word files, generated previews, article
  images, published/archive outputs, and personal materials. The only copied
  binary asset is the console-referenced favicon.
- Phase evidence, review directories, candidate package builds, and release
  archives.
- Fixed-path Windows start/stop/package scripts. They target the original
  development tree and are not portable to this stage. The separate candidate
  launcher change and automated LAN restart launcher were also not integrated.

Necessary Python/CJS test source and non-sensitive fixtures were retained.
Two test-only non-reserved email domains were replaced with the reserved
`example.invalid` domain. Personal absolute paths in staged documentation were
made generic; the CLI platform paths now resolve from the project root.

Targeted offline validation ran 62 console/auth unit tests: 60 passed, one
failed, and one errored in the unrelated image-clear fixture cases. No LAN
service, external API, model, image search, or platform posting was run. The
four-file syntax/origin/allowlist smoke checks passed. See `REVIEW-REPORT.md`
and `SOURCE-MANIFEST.json` for evidence and final hashes.
