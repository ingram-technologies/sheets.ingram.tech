# sheets.ingram.tech

AI-native collaborative spreadsheets. The spreadsheet engine
([IronCalc](https://ironcalc.com)) runs as wasm in the browser; an agent works
in the same workbook through chat, and you watch it work — live cursor,
change pulses, highlights.

The product UI half; Apache-2.0, like the engine.

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

Google sign-in gates every page, so `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
are required to use the app at all. The agent chat needs no platform key: each
user links their own Ingram Cloud organization from the app (one click, or a
pasted project token), which needs `SHEETS_CREDENTIALS_KEY` to store it and
`SHEETS_OAUTH_PRIVATE_KEY` for the one-click path. Get them from
`vercel env pull`. Nothing else needs configuring locally — `bun run dev` boots
its own database.

## Env

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres (unset locally — `bun run dev` boots PGlite) |
| `SHEETS_CREDENTIALS_KEY` | Encrypts users' Ingram Cloud tokens at rest (any string ≥ 32 chars; `openssl rand -hex 32`). Rotating it means every user re-links |
| `SHEETS_OAUTH_PRIVATE_KEY` | One-click "Link Ingram Cloud": an RSA PKCS8 private key (PEM, base64 accepted) behind `/oauth/jwks.json`. Unset → only the paste-a-token path is offered. `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \| base64 -w0` |
| `INGRAM_CLOUD_API_BASE` / `INGRAM_CLOUD_CONSOLE_URL` | Optional — a self-hosted Ingram Cloud (defaults `https://api.cloud.ingram.tech` / `https://cloud.ingram.tech`) |
| `SHEETS_CHAT_MODEL` | Optional model override, default `claude-opus-4-8` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Shared Ingram Google OAuth client (from the infra `platform` stack) |
| `BETTER_AUTH_SECRET` | Session signing secret (dev falls back to a placeholder) |
| `BETTER_AUTH_URL` | Canonical origin, `https://sheets.ingram.tech` in prod |
| `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL` | Optional — Chrome origin-trial token for WebMCP (trial runs Chrome 149-156). Unset → the browser's agent is never offered; locally use `chrome://flags/#enable-webmcp-testing` instead |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | Optional — API key (same Google project as the OAuth client) enabling "Browse Google Drive" via the Google Picker |
| `NEXT_PUBLIC_GOOGLE_PICKER_APP_ID` | Optional — that Google project's number (Picker `setAppId`) |
