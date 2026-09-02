# WebMCP Challenge: prior work and hackathon work

Ingram Sheets is a pre-existing project. This file separates what shipped
before the submission period from what was built during it.

Repository's first commit: 2026-07-14. Submission period opened 2026-08-25,
11:00 PT. The WebMCP work starts at `12ad181`, 2026-08-31.

## Before the hackathon

IronCalc compiled to WebAssembly in the browser, the grid, the formula engine,
`WorkbookController`, autosave with compare-and-swap, the in-app chat agent and
its twelve tools, and an MCP endpoint for terminal clients.

## During the submission period

| When | Commit | What |
|---|---|---|
| 08-31 23:36 | `12ad181` | Register the workbook's tools on `document.modelContext`; ambient types, tests, docs |
| 09-01 03:37 | `1ab2317` | Apache-2.0 |
| 09-01 03:38 | `28f9a10` | README, and the origin-trial variable |
| 09-01 04:50 | `9ba1276` | `/try`: a workbook with no account behind it, so a visiting agent needs no sign-in |
| 09-01 05:11 | `e0125a1` | Least privilege: ask for `runs:*`, not the tenant master key |
| 09-02 13:33 | `4313b76` | The call log: every tool the agent ran, with its delta echo |
| 09-02 15:10 | `8659e1c` | Say where the agent lives |
| 09-02 15:16 | `517218c` | Rebuild carrying the Chrome origin-trial token |
| 09-02 15:32 | `bf9fedb` | Collapse the guidance once an agent is driving |

New files:

```
src/lib/webmcp.ts                          registration, and the agent-mode preference
src/types/webmcp.d.ts                      the API, which TypeScript does not ship yet
src/components/workbook/useWebMcpTools.ts  the twelve tools, schemas and annotations
src/components/workbook/webmcp-log.ts      the call log
src/components/workbook/ScratchAgentPanel.tsx
src/lib/local-workbook.ts                  the signed-out workbook
src/app/try/page.tsx                       the public entry point
src/lib/webmcp.test.ts, webmcp-log.test.ts
```

21 files changed in total.

## The registration call

`src/lib/webmcp.ts`:

```ts
context.registerTool(tool, { signal }).catch((error: unknown) => {
	console.error(`WebMCP: ${tool.name} was not registered`, error);
});
```

`src/components/workbook/useWebMcpTools.ts` builds the descriptors: name,
description, `annotations`, and JSON Schema derived from the same Zod schemas
the in-app agent uses.

## Notes for judging

- Live at https://sheets.ingram.tech/try. No sign-in.
- Use the ChatGPT desktop app's built-in browser. That is where an agent
  exists to call the tools; a plain Chrome tab exposes the API but has nothing
  attached to it.
- The page carries a Chrome origin-trial token, so no local flag is needed.
  `chrome://flags/#enable-webmcp-testing` is only for running a local build,
  which has no token.
- Site tools require GPT-5.6 Sol or Terra. Luna has them off.
- If the agent starts clicking the page instead of calling tools, tell it to
  use the site tools.
- The right-hand panel logs every call, its result, and the delta echo.
