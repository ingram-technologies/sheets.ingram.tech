# WebMCP Challenge — what is new, and what was already here

Ingram Sheets existed before this hackathon. The Official Rules ask a
pre-existing project to distinguish prior work from new work and to evidence
the extension with timestamped commit history, so that is what this file is.

**First commit in this repository: 2026-07-14.** The submission period opened
**2026-08-25, 11:00 PT**. Everything below landed after that, and all of the
WebMCP work landed in one run beginning `12ad181` on 2026-08-31.

## Already here before the hackathon

The spreadsheet: IronCalc compiled to WebAssembly running in the browser, the
grid, the formula engine, `WorkbookController`, autosave with compare-and-swap,
the built-in chat agent and its twelve-tool surface, and an MCP endpoint for
terminal clients. None of that is offered as new work.

## Built during the submission period

Every commit below is in `git log`; the dates are the repository's own.

| When | Commit | What |
|---|---|---|
| 08-31 23:36 | `12ad181` | WebMCP: register the workbook's tools on `document.modelContext`, ambient types, tests, docs |
| 09-01 03:37 | `1ab2317` | Apache-2.0 |
| 09-01 03:38 | `28f9a10` | README, and the origin-trial variable |
| 09-01 04:50 | `9ba1276` | `/try` — a workbook with no account behind it, so a visiting agent needs no sign-in |
| 09-01 05:11 | `e0125a1` | Least privilege: ask for `runs:*`, not the tenant master key |
| 09-02 13:33 | `4313b76` | The call log: every tool the agent ran, with its delta echo |
| 09-02 15:10 | `8659e1c` | Say where the agent lives |
| 09-02 15:16 | `517218c` | Rebuild carrying the Chrome origin-trial token |
| 09-02 15:32 | `bf9fedb` | Collapse the guidance once an agent is driving |

Roughly 1,000 lines across 21 files, of which these are new:

```
src/lib/webmcp.ts                          registration + the agent-mode preference
src/types/webmcp.d.ts                      the API, which TypeScript does not ship yet
src/components/workbook/useWebMcpTools.ts  the twelve tools, schemas and annotations
src/components/workbook/webmcp-log.ts      the call log
src/components/workbook/ScratchAgentPanel.tsx
src/lib/local-workbook.ts                  the signed-out workbook
src/app/try/page.tsx                       the public entry point
src/lib/webmcp.test.ts, webmcp-log.test.ts
```

## Where the required call lives

`src/lib/webmcp.ts`:

```ts
context.registerTool(tool, { signal }).catch((error: unknown) => {
    console.error(`WebMCP: ${tool.name} was not registered`, error);
});
```

The descriptors — name, description, JSON Schema from the same Zod schemas the
in-app agent uses, and `annotations` — are built in
`src/components/workbook/useWebMcpTools.ts`.

## Notes for judging

- The live URL is **https://sheets.ingram.tech/try**. No account, no key.
- It needs the ChatGPT desktop app's built-in browser (or Chrome 149+ with
  `chrome://flags/#enable-webmcp-testing`). Site tools need GPT-5.6 Sol or
  Terra; Luna has them switched off.
- The page carries a Chrome origin-trial token, so the tools register without
  any local flag.
- The right-hand panel logs every call with the result, delta echo included.
