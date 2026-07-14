# Architecture

sheets.ingram.tech is the private product UI from the Sheets plan
(`~/src/sheets-plan.md` §6): an AI-native collaborative spreadsheet. This
initial version is **browser-engine only** — no sheetd, no auth — but is
shaped so the sheetd/channel wiring (plan §8) slots in without rework.

## The engine runs in the browser

`@ironcalc/wasm` provides the full IronCalc `UserModel`: formula evaluation,
undo/redo, styles, number formats, fills, clipboard, and per-sheet view state
(selection, scroll anchor). The wasm binary is copied to `public/ironcalc/`
by `scripts/copy-wasm.ts` (predev / prebuild) and fetched once per page.

The package is **vendored at `vendor/ironcalc-wasm/`** (a `file:` dependency),
built from the same pinned git revision of upstream IronCalc that sheetkit
uses — see the rev in the vendored `package.json` version and sheetkit's
workspace `Cargo.toml`. The published npm release lags main by ~150 functions
(SUMPRODUCT, FILTER, SORT, UNIQUE, LET, LAMBDA, …) and the dynamic-array
engine, which users hit immediately. To rebuild: check out the rev in the
IronCalc repo, `make all` in `bindings/wasm` (needs `wasm-pack` and a
TypeScript for the `types.ts` step), copy `pkg/` here, delete its
`.gitignore`, and set the rev-suffixed version.

The server stores workbooks as **opaque engine bytes** (`Model.toBytes()`,
IronCalc's bitcode format) in a Postgres `bytea` column. Creating a workbook
happens client-side too: the browser builds an empty model and uploads its
bytes. Consequences:

- the server has no spreadsheet logic and no wasm dependency;
- the bytes format is version-locked to the pinned `@ironcalc/wasm` — bump it
  deliberately. This is NOT theoretical: the 0.7.0 → git-main bump broke
  decoding (verified — "invalid packing"), and the UI shows a clear
  "saved by an older engine" error for such blobs. Migrate through xlsx
  before bumping if the stored workbooks matter;
- when sheetd (the server-side engine, from the public sheetkit repo) arrives,
  it speaks the same format, and the blob store moves behind it.

## WorkbookController — the one door to the model

`src/components/workbook/controller.ts`. Everything goes through it:

- `mutate(fn, pulse?)` — content changes. Snapshots the sheet's computed
  values before/after (bounded by `SNAPSHOT_CELL_CAP`) and returns the **delta
  echo**: every cell whose computed value changed, including formula ripple.
  Bumps the version (→ `useSyncExternalStore` subscribers redraw), fires
  dirty listeners (→ autosave), pulses changed cells on the canvas.
- `view(fn)` — selection/scroll/sheet-switch; no autosave, no snapshot.
- geometry cache — prefix-summed row/col offsets per sheet for O(log n)
  pixel↔cell mapping; invalidated on every mutation; virtual extent grows as
  you scroll (`extendExtent`).
- presence — agent status, highlights (range + note), and cell pulses live
  here, so grid overlays and the chat panel share one source of truth. This
  is the client-side twin of the `sheets.channel.v1` presence frames; when
  the websocket channel lands, these fields get fed from it instead.

The grid (`Grid.tsx` + `renderer.ts`) is a custom canvas renderer — we chose
it over `@ironcalc/workbook` because the published widget pins an old engine
(0.5.x), drags in MUI/Emotion, and we need to own the overlay layer (agent
presence) anyway. The model's own view state is authoritative: keyboard nav
uses `onArrow*`/`onExpandSelectedRange`/`onNavigateToEdgeInDirection`, and the
renderer reads `getSelectedView()` each frame.

## The agent loop

- `/api/chat` (`src/app/api/chat/route.ts`): AI SDK `streamText` against the
  Anthropic API directly (`ANTHROPIC_API_KEY`; `SHEETS_CHAT_MODEL`, default
  `claude-opus-4-8`). Tools are declared **without `execute`** — the SDK
  forwards calls to the browser.
- `ChatPanel.tsx` runs `onToolCall` → `AgentExecutor`
  (`agent-executor.ts`), which executes against the controller and returns a
  text result via `addToolOutput`;
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`
  continues the loop.
- Tool surface (`src/lib/agent-tools.ts`, zod schemas shared by route and
  executor): overview / read_range / set_cells / fill_range / clear_range /
  format_range / modify_structure / add_sheet / rename_sheet / undo /
  highlight_cells. Every mutation answers with the delta echo, so the agent
  never re-reads ranges to learn state — this is the plan's core thesis in
  miniature.
- Presence choreography lives in the executor: it focuses the target range
  (dashed violet outline), switches the visible sheet to where it works,
  pulses changed cells in the agent color, and `highlight_cells` is the
  agent→user pointing finger.

This chat is a stopgap for the eventual Ingram Cloud smith binding (plan
§6.4); the tool surface deliberately mirrors the sheetkit MCP DSL verbs so the
swap is a transport change, not a redesign.

## Persistence & autosave

`Workbook.tsx`: debounced (1.2 s) `PUT /api/workbooks/:id/bytes` after any
dirty mutation, immediate flush on tab-hide, `beforeunload` warning while
dirty. API routes are thin Drizzle queries (`src/lib/workbooks.ts`); the dev
database is PGlite over a local socket (`bun run dev`), prod is the shared
Ingram RDS instance (see the `sheets` stack in the infra repo).

## Google Sheets bridge

A workbook links **1:1** to a Google spreadsheet (`workbook.
google_spreadsheet_id`). "Save to Google Sheets" (File menu) creates the
spreadsheet on first save and **full-replaces** the same one after — this app
is the source of truth for linked workbooks. "Open from Google Sheets"
(home page) searches spreadsheets reachable under the `drive.file` grant
(created by this app or previously picked), accepts a pasted URL/id, and —
when the Picker env vars are set — offers "Browse Google Drive" through the
Google Picker (Google's own UI; picking a file grants this app access to
just that file). Importing establishes the link, so saving writes back.

The split follows the engine split: the browser builds/consumes a neutral
snapshot — values, formulas, number formats (`src/lib/gsheets-transfer.ts`
schema, `google-snapshot.ts` builder) — and the server
(`src/lib/gsheets.ts`) exchanges it with the Sheets v4 API using the OAuth
token from Better Auth's `account` table (`auth.api.getAccessToken`
refreshes it). If the user declined the optional spreadsheets scope at
sign-in, routes answer `google_scope_missing` and the client offers
incremental consent via `linkSocial`. Full-Drive *listing* scopes are
restricted (heavy verification for the shared OAuth client), which is why
browse goes through the Picker + non-sensitive `drive.file` instead. Richer
style transfer is a follow-up.

## What is deliberately NOT here yet

- **Membership / per-user workspaces** — sign-in exists (Better Auth via
  `@ingram-tech/nk-auth`, Google-only, mounted at `/auth`; see `src/lib/auth.ts`)
  but every signed-in user still shares ONE workspace — no ownership columns,
  no sharing model. Sign-in also (optionally, via Google's granular consent)
  requests the `spreadsheets` scope and stores a refresh token in the
  `account` table — the Google Sheets bridge above runs on it.
- **sheetd + realtime channel** — single-client editing only; the engine diff
  queue (`flushSendQueue`/`applyExternalDiffs`) is unused until then.
- **csv + xlsx import** — xlsx *export* and the Google Sheets bridge exist
  client-side; file imports arrive with sheetd (server-side import keeps the
  client thin).
- **Frozen panes, merged cells, borders UI, wrap text** — engine supports
  them; renderer/toolbar don't yet.
