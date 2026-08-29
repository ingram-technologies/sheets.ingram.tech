# Architecture

sheets.ingram.tech is the private product UI: an AI-native collaborative
spreadsheet. The engine runs in the browser and there is no sheetd yet — single
-client editing only — but the app is shaped so the sheetd/channel wiring slots
in without rework.

The OSS engine half (sheetd, the MCP tool surface, the channel protocol spec)
lives in the public [sheetkit](https://github.com/ingram-technologies/sheetkit)
repo. [`engine-constraints.md`](./engine-constraints.md) explains the IronCalc
facts that force several of the choices below.

## Why this shape

Every existing spreadsheet interface for an LLM loses the three things that make
a spreadsheet usable for a human: random-access vision, instant recalc feedback,
and spatial addressing. This product rebuilds them as text:

- a **compressed, structure-aware read encoding** — the agent gets a sketch of
  regions, headers, dtypes and fills, not a cell dump;
- a **dependency-aware delta echo** after every mutation — the agent learns the
  full ripple, including formula recalc, from the write itself;
- **range-level verbs** (fill, sort, format) instead of cell-by-cell APIs.

The delta echo is the load-bearing one: it is why the agent never re-reads a
range to learn what its own edit did. Everything below serves that.

The same engine model also powers a human UI where the agent's activity is
*visible* — live highlights, selections, and per-cell pointing between user and
agent. That visibility is the product, not decoration.

## The engine runs in the browser

`@ironcalc/wasm` provides the full IronCalc `UserModel`: formula evaluation,
undo/redo, styles, number formats, fills, clipboard, and per-sheet view state
(selection, scroll anchor). It is vendored and pinned to a specific upstream git
rev — see [`engine-constraints.md`](./engine-constraints.md) for the rev, the
rebuild recipe, and why the published npm release isn't usable.

The server stores workbooks as **opaque engine bytes** (`Model.toBytes()`,
IronCalc's bitcode format) in a Postgres `bytea` column. Creating a workbook
happens client-side too: the browser builds an empty model and uploads its
bytes. Consequences:

- the *interactive* engine is the browser's; the server holds no session, no
  undo stack, and no view state;
- the bytes format is version-locked to the pinned engine — bumping it is a
  protocol break, not an upgrade (see `engine-constraints.md`);
- when sheetd arrives it speaks the same format, and the blob store moves behind
  it.

This document used to say the server has *no spreadsheet logic and no wasm
dependency*. That is no longer true, and the exception is deliberate and
bounded — see the next section.

## The server-side engine (and why it exists)

`src/lib/sheetkit-server.ts` runs **sheetkit-wasm in the Node runtime**: the
sketch, the budgeted views, the command language, the delta echo — the same
tool surface the browser uses for `get_workbook_overview`, over the same bytes.

It exists for one reason: an MCP client should be able to work in a stored
workbook *without a browser tab open*. Everything else about the product
follows from workbooks being hosted rather than local files, and that only pays
off if they are reachable when nobody is looking at them.

The bound on the exception, precisely:

- the server never holds a live model between requests — every call loads bytes,
  acts, persists, and frees;
- it owns no view state, no undo stack, no presence;
- the browser remains the interactive source of truth, and the only thing the
  two share is the opaque blob.

sheetkit-wasm is built against the **same pinned IronCalc rev** as
`@ironcalc/wasm`, so bytes written by either side load in the other with no
translation. Bumping one without the other is a protocol break, not an upgrade.

The wasm binary is located from the working directory against an ordered
candidate list rather than with `require.resolve` — under Turbopack the latter
returns a virtual `[project]/…` path that no filesystem call can open — and
`next.config.ts` traces `vendor/sheetkit-wasm` into the MCP route's bundle.

## Two writers, one blob

`workbook.bytes` is replaced whole on every save, and a workbook now has two
writers: the browser's autosave and the MCP endpoint. An unconditional write
therefore *silently discards* whatever the other did since it read.

So every write is a compare-and-swap on `workbook.version`:

- the version travels as an **ETag** on `GET /api/workbooks/:id/bytes`, and a
  PUT must carry it in `If-Match`. No `If-Match` is a `428`, not a blind write —
  a client that cannot participate should fail loudly rather than quietly
  overwrite;
- a losing write gets `412` plus the current meta, so it can re-read rather than
  guess;
- the browser stops retrying on `412` and asks. Both sides of a conflict are
  real work and nothing here can merge them, so "Load theirs / Keep mine" is the
  user's call, never a silent default.

`sheet_exec` is additionally **atomic**, which sheetkit's own REPL deliberately
is not. A script that fails partway leaves the session half-applied, and in a
REPL that is right — you can see the partial state and fix it. Here the workbook
may be open in front of someone, so a failed script writes nothing at all; the
agent still gets the full echo naming the failing line and what the discarded
attempt would have done.

sheetd makes all of this moot by serializing commands server-side. Until then
this is the guard, and it is why `saveWorkbookBytes` has no unconditional
variant.

## WorkbookController — the one door to the model

`src/components/workbook/controller.ts`. Everything goes through it:

- `mutate(fn, pulse?)` — content changes. Snapshots the sheet's computed values
  before/after (bounded by `SNAPSHOT_CELL_CAP`) and returns the **delta echo**:
  every cell whose computed value changed, including formula ripple. Bumps the
  version (→ `useSyncExternalStore` subscribers redraw), fires dirty listeners
  (→ autosave), pulses changed cells on the canvas. The snapshot-diff is brute
  force because IronCalc exposes no dependents API — see
  [`engine-constraints.md`](./engine-constraints.md) before touching the cap.
- `view(fn)` — selection/scroll/sheet-switch; no autosave, no snapshot.
- geometry cache — prefix-summed row/col offsets per sheet for O(log n)
  pixel↔cell mapping; invalidated on every mutation; virtual extent grows as
  you scroll (`extendExtent`).
- presence — agent status, highlights (range + note), and cell pulses live here,
  so grid overlays and the chat panel share one source of truth. Presence is our
  own protocol, not engine state (`engine-constraints.md` explains why); it is
  the client-side twin of the `sheets.channel.v1` frames, and gets fed from the
  websocket channel when that lands.

The grid (`src/components/workbook/Grid.tsx` + `renderer.ts`) is a custom canvas
renderer. We chose it over `@ironcalc/workbook` because the published widget
pins an older engine than we need, drags in MUI/Emotion, and we need to own the
overlay layer (agent presence) anyway. The model's own view state is
authoritative: keyboard nav uses
`onArrow*`/`onExpandSelectedRange`/`onNavigateToEdgeInDirection`, and the
renderer reads `getSelectedView()` each frame.

## The MCP endpoint — the agent in your terminal

`POST /api/mcp` (`src/app/api/mcp/route.ts`) lets an external MCP client —
Claude Code — work in these workbooks:

```sh
claude mcp add --transport http sheets https://sheets.ingram.tech/api/mcp
```

Under `/api` because that is what it is: the app's public API, consumed by an
external client. (Contrast `/internal`, for callers the public never is.)

**Transport.** Stateless streamable-HTTP: one JSON-RPC request per POST, one
JSON response, no server-held session. What would normally be protocol state —
which workbook is open — rides in each call's `workbook_id`, so concurrent
clients and retries need no coordination. Hand-rolled (`src/lib/mcp/`) rather
than taken from the SDK: the stateless case is a few dozen lines, and the SDK's
HTTP transport wants Node `req`/`res` objects a route handler does not have.
Server-initiated messages (sampling, progress) would flip that trade.

**Tools.** `sheet_list` / `sheet_open` / `sheet_view` / `sheet_exec` /
`sheet_create` (`src/lib/mcp/tools.ts`). Shaped after sheetkit's own MCP server,
with the difference that drives the rest: these workbooks are hosted and shared
with a live tab, not local files, so there is no open/save/close lifecycle —
every call loads current bytes, acts, persists. An agent cannot leave a workbook
dirty or hold a stale session. The verbs stay inside `sheet_exec`'s command
language, which is what keeps the surface small enough to hold in view.

**Auth is OAuth**, via Better Auth's `mcp` plugin (`src/lib/auth.ts`), not an
API-key table. An MCP client is a third-party program acting for the user, which
is the case OAuth exists for: revocation is per-client, and there is no
permanent key to leak. Claude Code registers itself dynamically, so nothing is
configured per client. Discovery documents are re-exposed at the **origin root**
(`src/app/.well-known/…`) because that is where clients look — our Better Auth
mounts at `/auth`, not the root. The protected-resource route is an optional
catch-all so both RFC 9728 path forms resolve.

The user id comes from the OAuth grant and never from the request body, so the
type-level ownership model in `src/lib/workbooks.ts` applies unchanged: someone
else's workbook is *missing*, not forbidden.

**Edits are visible.** A tab open on the workbook polls
(`REMOTE_POLL_MS`, `Workbook.tsx`), adopts the server's copy, flashes the cells
the echo named in the agent's violet, and shows the script and full echo above
the grid (`src/lib/activity.ts`, `workbook.last_activity`). The pulses are
explicitly best-effort — parsed from the echo's `REF ⇒ value` form, which elides
long change lists — so the authoritative account stays the text. Polling is
skipped while the tab is hidden *or the document is dirty*: adopting the
server's copy discards unsaved local edits, so the poller never takes anything
from someone mid-edit; their next save hits the CAS instead.

`last_activity` is deliberately latest-only rather than an append-only journal —
one read, no join, no unbounded growth. sheetd's exec journal is the real
version and will replace it.

## The agent loop (in-app chat)

- `/api/chat` (`src/app/api/chat/route.ts`): AI SDK `streamText` against
  **Ingram Cloud** (`@ingram-cloud/ai-sdk`; tenant token + `IC-Agent-Id`, model
  from the IC agent config, `SHEETS_CHAT_MODEL` overrides). IC lazily
  provisions one smith per user (`user:<better-auth-id>`); per-user BYOK
  attaches the user's provider key to that smith so their inference bills to
  them (`src/lib/ingram-cloud.ts`, cloud.ingram.tech#170). A temporary SSE
  shim (`src/lib/ic-stream-shim.ts`) normalizes the stream until
  cloud.ingram.tech#165 lands. Tools are declared **without `execute`** — the
  SDK forwards calls to the browser. `stopWhen: stepCountIs(24)` caps a single
  turn's tool loop.
- `src/components/chat/ChatPanel.tsx` runs `onToolCall` → `AgentExecutor`
  (`src/components/workbook/agent-executor.ts`), which executes against the
  controller and returns a text result via `addToolOutput`;
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`
  continues the loop.
- Tool surface (`src/lib/agent-tools.ts`, zod schemas shared by route and
  executor): get_workbook_overview / read_range / set_cells / fill_range /
  clear_range / format_range / modify_structure / add_sheet / rename_sheet /
  undo / highlight_cells. Every mutation answers with the delta echo, so the
  agent never re-reads ranges to learn state.
- **Workbook state is injected per request, never persisted into history.** Each
  user turn gets a fresh `<current_workbook_state>` sketch appended to the last
  user message. It rides the *last* message rather than the system prompt so the
  cacheable prompt prefix stays byte-stable across turns; keeping it out of
  stored history stops stale sketches from accumulating and contradicting each
  other. The user can edit cells between turns, so the attached state outranks
  anything older in the conversation.
- Presence choreography lives in the executor: it focuses the target range
  (dashed violet outline), switches the visible sheet to where it works, pulses
  changed cells in the agent color, and `highlight_cells` is the agent→user
  pointing finger.
- **Errors are deliberately unmasked.** `toUIMessageStreamResponse({ onError })`
  surfaces the real gateway error instead of the SDK's generic default, because
  there are no third-party users yet and a masked error costs more debugging time
  than it buys safety. Revisit when the app has external users — provider errors
  can carry internal detail.

This chat is a stopgap. The eventual binding is an Ingram Cloud smith per
workbook: an agent binding maps a smith's external id to a workbook, sheetd
resolves `X-IC-Smith-External-Id → workbook`, and the chat panel renders IC run
streams. The tool surface deliberately mirrors the sheetkit MCP DSL verbs so
that swap is a transport change, not a redesign.

## Persistence & autosave

`src/components/workbook/Workbook.tsx`: debounced (1.2 s)
`PUT /api/workbooks/:id/bytes` after any dirty mutation, immediate flush on
tab-hide, `beforeunload` warning while dirty. API routes are thin Drizzle
queries (`src/lib/workbooks.ts`); the dev database is PGlite over a local socket
(`bun run dev`), prod is the shared `ingram-labs` RDS instance (the `sheets`
stack in the infra repo owns the wiring).

`workbook.id` is a DB-minted `uuidv7()`, exposed publicly only as `wb_<base58>`
via `src/lib/ids.ts` — raw UUIDs never leave the server (a nextkit house rule;
see the nk-dev guide).

## Ownership

Every workbook has exactly one owner: `workbook.user_id`, NOT NULL, FK to Better
Auth's `user` table with `ON DELETE cascade` (so deleting an account takes its
workbooks with it — which is also what erasure requests need). Better Auth's
tables are raw SQL with deny-all RLS and are deliberately absent from the
drizzle schema, so that FK is hand-written in `drizzle/0004_workbook_owner.sql`
rather than emitted by drizzle-kit.

The isolation model is a type-level one, not a convention:

- Every function in `src/lib/workbooks.ts` takes the owning `userId` as a
  required argument and folds it into the WHERE clause. There is no unscoped
  read or write to forget to scope — a route that omits the owner fails to
  compile.
- Routes take the owner from `requireApiUser()` (`src/lib/session.ts`), which
  returns either a 401 response or the user id. Never from the request body.
- A workbook owned by someone else is reported **missing** (404), never
  forbidden (403). A 403 would confirm that the id exists.

This replaced a shared-workspace model in which the gate only asked "is anyone
signed in", so every signed-in user could list, open, overwrite and delete every
workbook in the database. Do not reintroduce an unscoped query helper.

## Google Sheets bridge

A workbook links **1:1** to a Google spreadsheet
(`workbook.google_spreadsheet_id`). "Save to Google Sheets" (File menu) creates
the spreadsheet on first save and **full-replaces** the same one after — this app
is the source of truth for linked workbooks. "Open from Google Sheets" (home
page) searches spreadsheets reachable under the `drive.file` grant (created by
this app or previously picked), accepts a pasted URL/id, and — when the Picker
env vars are set — offers "Browse Google Drive" through the Google Picker
(Google's own UI; picking a file grants this app access to just that file).
Importing establishes the link, so saving writes back.

The split follows the engine split: the browser builds/consumes a neutral
snapshot — values, formulas, number formats (`src/lib/gsheets-transfer.ts`
schema, `src/components/workbook/google-snapshot.ts` builder) — and the server
(`src/lib/gsheets.ts`) exchanges it with the Sheets v4 API using the OAuth token
from Better Auth's `account` table (`auth.api.getAccessToken` refreshes it).

Scopes are chosen around Google's verification tiers, because the shared OAuth
client is unverified and any *sensitive* scope in the sign-in request puts the
"Google hasn't verified this app" interstitial in front of every new user:

- Sign-in requests only the non-sensitive `drive.file`. The Sheets API honours
  it for spreadsheets this app created or the user picked via the Picker, so
  save / open / search all work with no extra grant.
- The sensitive `spreadsheets` scope is never requested at sign-in. Opening a
  foreign sheet by pasted URL is the one case that needs it: Google answers
  403 insufficient-scope, the route maps that to `google_scope_missing`, and
  the client offers on-demand consent via `linkSocial` — after telling the user
  to expect the unverified-app warning (`SPREADSHEETS_ACCESS_EXPLAINER`).
- Full-Drive *listing* scopes are restricted (heavy verification), which is
  why browse-all goes through the Picker instead.

Richer style transfer is a follow-up.

## What is deliberately NOT here yet

- **Sharing / membership** — workbooks now have exactly one owner (see
  "Ownership" below), so there is no *sharing*: no membership table, no roles,
  no per-range ACL. A workbook is reachable by its owner or by nobody.
  Sign-in also requests the non-sensitive `drive.file` scope and stores a
  refresh token in the `account` table — the Google Sheets bridge runs on it.
- **sheetd + realtime channel** — no live channel; a tab learns about outside
  edits by polling, and the engine diff queue
  (`flushSendQueue`/`applyExternalDiffs`) is carried unused until then. Two
  writers are now real (browser + MCP) but they are serialized by a
  compare-and-swap on `workbook.version`, not by an ordered command log.

  The end state it slots into: one authoritative `UserModel` per workbook in
  sheetd. Every principal (human or agent) submits *commands*; the server
  serializes them, applies, and broadcasts engine diff blobs + presence with a
  monotonic per-workbook sequence number. Clients are replicas. No CRDT or OT —
  the ordered log is the truth, which is exactly the shape IronCalc's own diff
  queue anticipates. Whether human typing needs an optimistic local echo or can
  just round-trip is unmeasured; measure before building the optimism.
- **Highlights as data** — `controller.highlights` is in-memory only, with a
  local `hl-N` sequence. The intended end state is first-class rows (range,
  author, color, note, resolved) so highlights thread into per-range discussions
  and the agent reads user highlights as input. The schema has exactly one table
  (`workbook`) today.
- **xlsx import** — xlsx *export*, CSV/TSV *import* (`src/lib/csv.ts` →
  `modelFromSnapshot`, fully client-side), and the Google Sheets bridge exist;
  xlsx import arrives with sheetd (server-side import keeps the client thin).
- **Frozen panes, merged cells, borders UI, wrap text** — engine supports them;
  renderer/toolbar don't yet.
