# sheets.ingram.tech

AI-native collaborative spreadsheets. The spreadsheet engine
([IronCalc](https://ironcalc.com)) runs as wasm in the browser; an agent works
in the same workbook through chat, and you watch it work — live cursor,
change pulses, highlights.

Private product UI of the Sheets project; the open-source engine toolkit
lives at [ingram-technologies/sheetkit](https://github.com/ingram-technologies/sheetkit).

## Develop

```bash
bun install
bun run dev     # PGlite (no Docker) + migrations + next dev on :3000
```

Chat needs `ANTHROPIC_API_KEY` and Google sign-in needs
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` locally (e.g. via `vercel env pull`);
everything else works without env. See
[`docs/architecture.md`](./docs/architecture.md).

## Env

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres (unset locally — `bun run dev` boots PGlite) |
| `ANTHROPIC_API_KEY` | Anthropic API key for the agent chat |
| `SHEETS_CHAT_MODEL` | Optional model override, default `claude-opus-4-8` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Shared Ingram Google OAuth client (from the infra `platform` stack) |
| `BETTER_AUTH_SECRET` | Session signing secret (dev falls back to a placeholder) |
| `BETTER_AUTH_URL` | Canonical origin, `https://sheets.ingram.tech` in prod |
