# G10-OS / G10 Builder — Shared Handoff File

**Purpose:** Single source of truth for work shared between Muse and ChatGPT on the
`g10-os` repo. Either assistant may implement the fixes below; whoever implements
updates the Status Log at the bottom. The other assistant verifies before anything
is committed or pushed.

**Repo:** https://github.com/dave7854-creator/g10-os (branch: `main`, single squashed commit)
**Scope of this handoff:** Phase 0 only — bug repairs + secret/PII hygiene in `g10-builder/`
and two small hygiene fixes elsewhere. No architecture changes, no new features.

---

## Ground rules (both assistants)

1. Read-only except the files explicitly listed under a fix. Do not touch anything else.
   **Hands off `g10-builder/`** — the human is working on that directory separately.
   Fixes 1–3 (builder.js, g10-knowledge.json) are parked until he says otherwise.
2. Never read, print, or paste secret *values* (API keys, tokens). Env-var *names* are fine.
3. Never modify `.env` files, `package-lock.json`, or git history as part of these fixes.
4. After each fix, run its Verify step. All five fixes must verify before the batch is done.
5. Do not commit or push. The human reviews the diff first.

---

## Fix 1 — `fastLane` crash (P0, builder is broken on its success path)

**File:** `g10-builder/builder.js`

**Problem:** Line 1153 reads `if (fastLane) {`, but `fastLane` is never assigned anywhere.
`detectFastLane()` is defined at line 233 but never called. Result: `ReferenceError:
fastLane is not defined` — the builder crashes exactly when a proposal reaches READY
status, i.e. on the only path where it applies changes.

**Fix:** Compute it from the user's request right before the review step. Insert one line
after the `validateChanges(proposal.changes, selected);` block and before `let review;`
(~line 1151):

```js
const fastLane = detectFastLane(request);
```

So the block becomes:

```js
    validateChanges(
      proposal.changes,
      selected
    );

    const fastLane = detectFastLane(request);

    let review;

    if (fastLane) {
```

**Verify:** `node --check g10-builder/builder.js` passes. (Full runtime test needs
`OPENAI_API_KEY` and is out of scope for this handoff.)

---

## Fix 2 — `g10-knowledge.json` is malformed (P0, all project knowledge silently unloaded)

**File:** `g10-builder/g10-knowledge.json`

**Problem:** Lines 82–86 contain a bare object dangling after `"agentFindings": []` with no
comma and no key. `JSON.parse` throws (`Expecting ',' delimiter: line 83`). `builder.js`
catches the error and continues with empty knowledge, so every security decision and
project note in this file is silently ignored.

**Fix:** The dangling object has `{path, purpose}` shape — it belongs in the
`importantFiles` array. Move it there:
1. Add it as the last entry of the `importantFiles` array (add a comma after the
   current last entry, then the object).
2. Delete the dangling block (the lines after `"agentFindings": []`), leaving
   `"agentFindings": []` as the final key before the closing `}`.

**Verify:** `python3 -c "import json; json.load(open('g10-builder/g10-knowledge.json'))"`
exits 0 with no error, and `node -e "JSON.parse(require('fs').readFileSync('g10-builder/g10-knowledge.json','utf8')); console.log('ok')"` prints `ok`.

---

## Fix 3 — Dead agents: Investigator and Code Modification never run (P1)

**File:** `g10-builder/builder.js`, ~line 965

**Problem:** `AGENT_REGISTRY` defines `investigator` and `codeModification` as enabled,
and the Manager prompt may select them, but `main()` filters specialists to only
`["supabase", "frontend", "debugging"]` — so the two agents are silently dropped even
when selected.

**Fix:** Extend the allowlist so registry and pipeline agree:

```js
// before
const specialists = (manager.agents || []).filter(agent =>
  ["supabase", "frontend", "debugging"].includes(agent)
);
// after
const specialists = (manager.agents || []).filter(agent =>
  ["investigator", "supabase", "frontend", "debugging", "codeModification"].includes(agent)
);
```

(Alternative the human may prefer: remove the two agents from the registry. Do not do
this unilaterally — ask in the Status Log if unsure.)

**Verify:** `node --check g10-builder/builder.js` passes; `grep -n "codeModification" g10-builder/builder.js`
shows it in both the registry and the filter list.

---

## Fix 4 — Real customer PII committed in seed data (P0, public repo)

**Files:** `supabase/seed-data/Current-impounds.csv`, `supabase/seed-data/Current-impounds copy.csv`

**Problem:** Both files contain ~37 real impound records each (duplicated across the two
files): customer/account names, full VINs, license plate numbers, and balance-due dollar
amounts. The repo is public.

**Fix:** Replace every real value with obviously synthetic placeholders while keeping the
exact file structure, column layout, and row count:
- Names → `Sample Customer 1`, `Sample Customer 2`, …
- VINs → `SAMPLEVIN000000001`, … (17 chars, clearly fake)
- Plates → `SAMPLE1`, …
- Balances → keep the numeric format but use round sample values (e.g. `100.00`)

**Verify:** `grep -ri` for two or three of the original real names/VINs returns nothing;
row count unchanged (`wc -l` before/after).

**Caveat (human decision):** git history still contains the originals (single squashed
"Initial G10 OS import" commit). Fully purging history means rewriting that commit and
force-pushing. Flagged for the human — do not rewrite history in this handoff.

---

## Fix 5 — Hardcoded Supabase anon key (P1, hygiene)

**Files:** `src/public-site/ebayApi.ts` (lines 3–4), `public/find-a-part.html` (inline script)

**Problem:** Both files hardcode the real Supabase project URL and anon JWT instead of
using env vars like `src/supabaseClient.ts` already does.

**Fix (updated 2026-09-30 per Cloudflare Pages setup):**
- `src/public-site/ebayApi.ts`: reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  via `import.meta.env` (same pattern as `supabaseClient.ts`, with placeholder
  fallbacks). Cloudflare Pages already has both vars set, so the Pages build picks
  them up — no dashboard change needed.
- `public/find-a-part.html`: this file is served statically (Vite copies `public/`
  verbatim, no `import.meta.env` substitution). It now loads `/runtime-config.js`,
  generated at build time by `scripts/generate-runtime-config.js` (wired via the
  `prebuild` npm script, so plain `npm run build` on Pages refreshes it from the
  environment). The generated file is gitignored — secrets never land in the repo.
  If the config is missing, the page logs a clear console error instead of failing
  silently.

**Verify:** `grep -rn "eyJhbGciOi" src public` returns nothing; `node
scripts/generate-runtime-config.js` writes a valid `public/runtime-config.js`;
`git status` does not list the generated file (gitignored).

---

## Verification checklist (whole batch)

- [ ] `node --check g10-builder/builder.js` → syntax OK
- [ ] `g10-knowledge.json` parses as JSON (python3 + node)
- [ ] No `eyJhbGciOi` JWT literals remain in `src/` or `public/`
- [ ] Seed CSVs contain zero real names/VINs/plates; row counts unchanged
- [ ] `git diff --stat` shows only the five intended files changed

---

## Status Log (newest at top)

| Date | Who | What |
|---|---|---|
| 2026-09-30 | Muse | Handoff created. Fixes 1–5 specced from read-only analysis. Nothing modified yet. |
| 2026-09-30 | Muse | All 5 fixes implemented in local clone per David's approval ("if not make those changes"). Verified: node --check OK, JSON parses, no JWT literals remain, 27 impound records scrubbed per CSV file. NOT committed or pushed — awaiting David's review of diffs. |
| 2026-09-30 | Muse | Update: `g10-builder/` reverted to HEAD and marked off-limits (David working on it separately — Fixes 1–3 parked). Fix 5 reworked: find-a-part.html now loads build-generated `/runtime-config.js` (new `scripts/generate-runtime-config.js` + `prebuild` hook, output gitignored) instead of dead placeholders. Hosting confirmed: Cloudflare Pages ("G10 OS", https://g10-os.pages.dev), env vars already set. Still not committed/pushed. |
| | | |

---

## Open questions for the human (Phase 1+, not this handoff)

1. Where should the web builder API be hosted? (Options: Railway / Fly.io / VPS, or your
   own machine via Cloudflare Tunnel.)
2. ~~Where does the site build/deploy?~~ Answered 2026-09-30: Cloudflare Pages (project "G10 OS", https://g10-os.pages.dev, build `npm run build`, output `dist`). `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` already set in Pages env.
3. Purge the PII from git history (rewrite initial commit + force-push), or leave history
   as-is after the file-level scrub?
