# Windows API adapter

This library calls the existing `https://haoduoyu.xyz` service from the native client.
It does not render a remote website, deploy a Worker, install a browser, or migrate data.
The production constructor fixes HTTPS, origin, allowed routes and methods, cookie handling,
25-second timeout, no redirects, and a 1 MiB decompressed JSON response limit by default.
Only the fixed-page `GET /ai-reports` route permits up to 4 MiB: 100 valid 16 KiB records
can exceed 3 MiB after JSON escaping. Oversized responses are rejected whole. Tests replace
the HTTP handler with an in-memory fake; they cannot change the service origin.

The implementation was checked against source `c30a8a956715b6ea809db4b87c0f4fcddf8f61de`,
whose static OpenAPI matched the production static asset during the parent's audit. This
does not claim that all production code or business data was read. No production business
request is part of these tests.

`LoginAsync` takes a password only for the login request; it is never added to an outbox.
`SessionInfo` supplies the actual `auth/me` user ID. `SessionMaterial` contains a session
cookie and must only be handed to a Windows DPAPI-protected vault; its `ToString` redacts
the cookie. The first client may keep sessions in memory and require login after restart.

The caller must obtain `ReadScopeIdAsync()` and call `BindScope(scopeId)` before a business
write. Every write re-reads the complete v2 index and compares `scope_id`. Missing, changed
or unverified scope raises `RequestNotSentException`, so the durable engine can block it
without treating the business write as sent. These two HTTP requests are not atomic:
production write APIs have no expected-scope precondition. Scope changes in between the
preflight read and write remain a server protocol limitation.

`ReconcileAsync` is read-only. Notes and memos require the original save ID's receipt,
same ID/kind/version/deletion state/change sequence, matching canonical entity hash, and
matching original PUT content. A missing receipt never authorizes automatic replay. Other
interfaces currently return `Unconfirmed`; the UI must read their existing entity/list
and let the user explicitly resolve the original intent. The adapter never retries writes.
Business write responses must also match the original entity ID, expected version or
documented no-op version, requested content and delete/restore state before a 2xx result
can reach the durable engine as confirmed. An incomplete or mismatched success remains
unknown; it does not clear the original intent. Timestamp, URL and text normalization
follow the existing server contract where applicable.

Successful business GETs pass `BusinessReadSchema` before reaching cache callers. It
requires the route's explicit envelope, collection and identity/date/version fields;
review entities must include their complete current contract fields. A partial 2xx,
wrong collection type, unsafe version, or invalid identifier/date raises an IOException
and cannot replace a previous cache. Valid empty collections remain valid. Unknown
root, nested and pagination fields remain byte-for-byte in `ApiResult.Json`.

Run the synthetic console suite:

```sh
dotnet run --project desktop/windows/Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj
```

The Chinese/newline note-hash fixture in `Program.cs` was independently generated with
the existing server's `stable` and `digest` functions over the exact fixture object.
It catches differences in key sorting and JSON escaping. This suite verifies transport,
scope checks and representative request shapes; it does not replace Windows UI, DPAPI,
real TLS/cookie or production end-to-end acceptance.

`Api.Tests` also links the same WPF-free `ReviewFormLogic.cs` that the native controls
call. Captured fixtures in `Api.Tests/Fixtures` rebuild all eight review forms and check
their real current-source Worker responses. See that directory's README for isolated
generation and network-free replay commands.

AI work reports use the existing append-only API: a user supplies the author and actual
content, and a stable UUID identifies the immutable record. Same UUID and canonical body
replays safely; different content conflicts. PUT responses are checked against the ID,
author, content and creation timestamp without requiring the hash that this endpoint
does not return on PUT. List reads require complete items and hashes. No provider or
writing-model call, report editing, permanent deletion or invented detail GET is added.
