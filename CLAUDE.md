# sheets.ingram.tech

@./node_modules/@ingram-tech/nk-dev/guide.md

AI-native collaborative spreadsheet UI; the OSS engine side lives in the public
`sheetkit` repo. **Read [`docs/architecture.md`](./docs/architecture.md) before
structural changes** — it explains the in-browser engine model and where sheetd
will slot in later. [`docs/engine-constraints.md`](./docs/engine-constraints.md)
covers the IronCalc limits that force those choices; read it before "optimizing"
the delta echo, the engine pin, or presence.

## The short version

- The spreadsheet engine is **IronCalc wasm running in the browser**. The server
  never parses spreadsheet content — it stores opaque engine bytes in Postgres
  (`workbook.bytes`).
- `WorkbookController` (`src/components/workbook/controller.ts`) is the single
  owner of the model: every read/write from React, keyboard, and agent tools
  goes through it.
- The agent chats via `/api/chat` (AI SDK + direct Anthropic API) but its
  tools execute **client-side** against the same controller — that's what
  makes its activity visible live in the grid (presence overlays, pulses,
  highlights).
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
