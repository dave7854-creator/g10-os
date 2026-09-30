# G10 Builder

Local AI dev tool for the G10 OS repo. The AI pipeline (`builder.js`) proposes
code changes; a human approves the exact diff before anything is applied.

## Phase 1: hardened API + web approval

- **Authentication:** every `/api/*` route requires
  `Authorization: Bearer <BUILDER_API_TOKEN>` (401 otherwise). The server
  refuses to start without `BUILDER_API_TOKEN` set.
- **CORS:** restricted to `BUILDER_ALLOWED_ORIGINS` (comma-separated). Unset =
  cross-origin disabled. `*` is rejected at startup.
- **Bind:** `127.0.0.1` by default (`BUILDER_HOST` to override).
- **Secrets stay server-side:** the OpenAI key and any other credentials are
  only read from server env. Job logs and streamed output are redacted before
  they reach the browser. The web UI never sees secrets.
- **Safety controls (unchanged):** protected-files list (`.env`,
  `package-lock.json`, `g10-knowledge.json`, `g10-builder/backups/`), path
  guard, backup before apply, rollback on build failure, `npm run build`
  verification.

## Setup

```bash
cd g10-builder
npm install
cp .env.example .env   # then set BUILDER_API_TOKEN (and OPENAI_API_KEY)
npm start              # or: node server.js
```

Open http://127.0.0.1:3001 — the web UI is served by the API itself.

## Web approval flow

1. Paste the API token into the UI (kept in `sessionStorage`, never stored in
   the repo).
2. Describe the change and click **Propose change** (`POST /api/jobs`).
3. The pipeline runs and the job moves to `awaiting_approval` with the exact
   diff per file.
4. Click **Approve** (`POST /api/jobs/:id/approve`): originals are backed up,
   changes applied, `npm run build` runs. Build failure restores the backup
   (`rolled_back`). Click **Reject** to discard (`POST /api/jobs/:id/reject`).

Job states: `running` → `awaiting_approval` → `applying` →
`applied` | `rolled_back`; `running` → `done` (no changes proposed) |
`failed`; `awaiting_approval` → `rejected`.

## API reference (all require Bearer auth)

| Method | Path | Purpose |
|---|---|---|
| GET | /api/status | Online flag, active job |
| POST | /api/jobs | Start a pipeline run: `{ "request": "..." }` → 201 `{ job }` |
| GET | /api/jobs | Job summaries (newest first) |
| GET | /api/jobs/:id | Full job: proposal diffs, logs, result |
| POST | /api/jobs/:id/approve | Backup → apply → build → result |
| POST | /api/jobs/:id/reject | Discard proposal: `{ "reason": "..." }` |
| POST | /api/builder/run | Legacy terminal-driven run (streams output) |
| POST | /api/builder/respond | Feed a line to the legacy run's stdin |

The legacy `/api/builder/run` + `/api/builder/respond` pair preserves the old
terminal approval flow (`Type YES...` over stdin) for operators who prefer it;
it is authenticated and its output is redacted like everything else.

## Environment variables

| Variable | Purpose |
|---|---|
| `BUILDER_API_TOKEN` | **Required.** Bearer token for `/api/*` |
| `BUILDER_ALLOWED_ORIGINS` | CORS allowlist, comma-separated; empty = disabled |
| `BUILDER_HOST` / `BUILDER_PORT` | Bind address / port (default `127.0.0.1:3001`) |
| `OPENAI_API_KEY` | Pipeline model access (server-side only) |
| `BUILDER_PROJECT_ROOT` | Override target repo (tests); default: parent of `g10-builder/` |
| `BUILDER_APPROVAL_MODE` / `BUILDER_PROPOSAL_OUT` / `BUILDER_JOB_REQUEST` | Internal job protocol between `server.js` and `builder.js` |

## Files

- `server.js` — hardened Express API + static UI
- `jobs.js` — job store, pipeline runner, approve/reject, secret redaction
- `safety.js` — safety controls shared by the pipeline and the API
- `builder.js` — AI pipeline (proposes only, in both terminal and web mode)
- `ui/index.html` — approval web UI (no build step)
- `builder-v4-backup.js` — untouched legacy backup
