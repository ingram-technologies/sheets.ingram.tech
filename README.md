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

Chat needs an AI Gateway credential locally (`AI_GATEWAY_API_KEY`, e.g. via
`vercel env pull`); everything else works without env. See
[`docs/architecture.md`](./docs/architecture.md).

## Env

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres (unset locally — `bun run dev` boots PGlite) |
| `AI_GATEWAY_API_KEY` | AI Gateway auth for local dev (on Vercel, OIDC is automatic) |
| `SHEETS_CHAT_MODEL` | Optional model override, default `anthropic/claude-opus-4.8` |
