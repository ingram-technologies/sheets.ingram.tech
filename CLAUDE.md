# sheets.ingram.tech

@./node_modules/@ingram-tech/nk-dev/guide.md

AI-native collaborative spreadsheet UI; the OSS engine side lives in the public
`sheetkit` repo. **Read [`docs/architecture.md`](./docs/architecture.md) before
structural changes** — it explains the in-browser engine model and where sheetd
will slot in later. [`docs/engine-constraints.md`](./docs/engine-constraints.md)
covers the IronCalc limits that force those choices; read it before "optimizing"
the delta echo, the engine pin, or presence.

## The short version

- The *interactive* spreadsheet engine is **IronCalc wasm running in the
  browser**; the server stores opaque engine bytes in Postgres
  (`workbook.bytes`) and holds no session, view state, or undo stack.
- **The server does have an engine, for one job.**
  `src/lib/sheetkit-server.ts` runs sheetkit-wasm in Node so an MCP client can
  work in a stored workbook with no tab open. It loads bytes, acts, persists,
  frees — never holding a live model between requests. This reverses an older
  rule; `docs/architecture.md` states the bound.
- **Every `bytes` write is a compare-and-swap** on `workbook.version` (ETag +
  `If-Match`), because the browser and the MCP endpoint both write the same
  whole blob. There is deliberately no unconditional save.
- `WorkbookController` (`src/components/workbook/controller.ts`) is the single
  owner of the model: every read/write from React, keyboard, and agent tools
  goes through it.
- The agent chats via `/api/chat` (AI SDK over Ingram Cloud) but its tools
  execute **client-side** against the same controller — that's what makes its
  activity visible live in the grid (presence overlays, pulses, highlights).
- **Sheets holds no inference key.** Each user links their own Ingram Cloud
  organization (one-click IC app grant via `src/lib/ic-oauth.ts`, or a pasted
  project token); the token is stored encrypted per user
  (`src/lib/inference.ts`) and the Sheets agent is provisioned in *their*
  project (`src/lib/ic-agent.ts`). `docs/architecture.md` has the flow.
- **The browser's own agent** (ChatGPT desktop's browser, Chrome) can drive
  the workbook over **WebMCP**: the page publishes the same client-side tools via
  `src/lib/webmcp.ts` + `useWebMcpTools`, and the model, the turn and the bill are
  all on their side — no Ingram Cloud link needed. Offered as the second option in
  the setup dialog, disabled where the browser lacks the API. Still an origin
  trial (Chrome 149-156): locally it needs
  `chrome://flags/#enable-webmcp-testing`, in production the token in
  `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL`.
- **Claude Code connects over MCP** at `POST /api/mcp` (`src/lib/mcp/`),
  authenticated by OAuth (Better Auth's `mcp` plugin), executing server-side
  against sheetkit-wasm. An open tab polls and shows those edits as they land.
- Google sign-in via Better Auth / `@ingram-tech/nk-auth` (`src/lib/auth.ts`,
  mounted at `/auth`). **Workbooks are per-owner**: `workbook.user_id` is NOT
  NULL and every function in `src/lib/workbooks.ts` takes the owner and folds
  it into the WHERE clause, so an unscoped query doesn't type-check. Routes get
  the owner from `requireApiUser()` (`src/lib/session.ts`), never from the
  request body. Someone else's workbook answers 404, not 403. There is still no
  *sharing* model — one owner per workbook, no membership table.

## Commands

```bash
bun run dev        # PGlite (no Docker) + migrations + next dev
bun run check      # oxlint + oxfmt + knip — run before pushing
bun run typecheck
bun run test
bun run db:generate && bun run db:migrate   # after schema changes
```

If port 5432 is busy locally: `PGLITE_PORT=5533 bun run dev`.

## Conventions

nextkit house rules (see the imported guide): tabs/width-4/88 via oxfmt, no
`as` casts on external input (Zod), no non-null `!`. Keep this file thin —
subsystem knowledge goes in `docs/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
