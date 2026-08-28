# sheets.ingram.tech

AI-native collaborative spreadsheets. The spreadsheet engine
([IronCalc](https://ironcalc.com)) runs as wasm in the browser; an agent works
in the same workbook through chat, and you watch it work — live cursor,
change pulses, highlights.

Private product UI of the Sheets project.

## Docs

- [`docs/architecture.md`](./docs/architecture.md) — how the system is shaped and
  why: the in-browser IronCalc engine, the `WorkbookController` model, the
  client-side agent loop, the Google Sheets bridge, and what is deliberately not
  built yet.
- [`docs/engine-constraints.md`](./docs/engine-constraints.md) — the IronCalc
  facts behind those choices: why the engine is vendored and pinned, why stored
  bytes are opaque and version-locked, why the delta echo is a brute-force
  snapshot diff, and why presence is our own protocol.
- [ingram-technologies/sheetkit](https://github.com/ingram-technologies/sheetkit)
  — the OSS engine half: sheetd, the MCP tool surface, and the
  `sheets.channel.v1` channel-protocol spec this app will speak.

## Develop

```bash
bun install
bun run dev     # PGlite (no Docker) + migrations + next dev on :3000
```

Google sign-in gates every page by default, so `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` are required to use the app at all; `ANTHROPIC_API_KEY`
is needed only for the agent chat. For local work without Google OAuth, set
`DEV_EMAIL_PASSWORD_SIGN_IN=true` before `bun run dev` and create an account on
the login page. This option is ignored outside development. Get the remaining
secrets from `vercel env pull`. Nothing else needs configuring locally — `bun
run dev` boots its own database.

## Env

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres (unset locally — `bun run dev` boots PGlite) |
| `ANTHROPIC_API_KEY` | Anthropic API key for the agent chat |
| `SHEETS_CHAT_MODEL` | Optional model override, default `claude-opus-4-8` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Shared Ingram Google OAuth client (from the infra `platform` stack) |
| `BETTER_AUTH_SECRET` | Session signing secret (dev falls back to a placeholder) |
| `BETTER_AUTH_URL` | Canonical origin, `https://sheets.ingram.tech` in prod |
| `DEV_EMAIL_PASSWORD_SIGN_IN` | Set to `true` to enable Better Auth email/password sign-in and local account creation in `NODE_ENV=development` only |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | Optional — API key (same Google project as the OAuth client) enabling "Browse Google Drive" via the Google Picker |
| `NEXT_PUBLIC_GOOGLE_PICKER_APP_ID` | Optional — that Google project's number (Picker `setAppId`) |
