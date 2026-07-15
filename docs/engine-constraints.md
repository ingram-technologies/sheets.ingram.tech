# Engine constraints

Why the IronCalc integration is shaped the way it is. Each section below is a
constraint the engine imposes and the workaround we own because of it — read
this before "simplifying" any of them, because the obvious simpler version is
usually the thing IronCalc doesn't expose.

[`architecture.md`](./architecture.md) describes the system; this file explains
the engine facts underneath it.

## The engine is vendored, not installed

`@ironcalc/wasm` is vendored at `vendor/ironcalc-wasm/` as a `file:`
dependency — a `wasm-pack` build of upstream IronCalc at git rev **`9ee7e066`**
(the vendored `package.json` version, `0.7.1-git.9ee7e066`, is the source of
truth; sheetkit pins the same rev via git dependency, keeping both sides on one
engine).

The published npm release predates ~150 functions — SUMPRODUCT, FILTER, SORT,
UNIQUE, SEQUENCE, LET, LAMBDA, TEXTSPLIT, XMATCH, the financial set — and the
dynamic-array engine behind them. Users reach for those immediately, so the
release is not a viable pin. Vendoring a build of the rev is the cheap answer;
forking is the fallback only if a needed function is missing from upstream main
*and* a PR stalls.

To rebuild: check out the rev in the IronCalc repo, `make all` in
`bindings/wasm` (needs `wasm-pack`, and a TypeScript for the `types.ts` step),
copy `pkg/` here, delete its `.gitignore`, set the rev-suffixed version.
`scripts/copy-wasm.ts` (predev/prebuild) copies the binary to `public/ironcalc/`,
where the browser fetches it once per page.

The vendored `README.md` is upstream's own and describes the npm package, not
this build — its `new Model('en', 'UTC')` example doesn't even match the pinned
signature. Don't treat it as authoritative.

## Stored bytes are opaque and version-locked

IronCalc's `Diff` enum is `pub(crate)` and bitcode-encoded. Nothing outside the
crate can inspect, migrate, or version-negotiate a serialized model — which is
why `workbook.bytes` is a `bytea` the server never parses, and why the engine
version *is* the format version.

So an engine bump is a protocol break, not a dependency upgrade: bytes written
by another rev fail to decode. The loader catches this and surfaces "saved by an
older engine version" rather than raw wasm noise
(`src/components/workbook/Workbook.tsx` matches on `"parsing workbook"`).
Migrate through xlsx before bumping if the stored workbooks matter.

The upside of the same constraint: the wasm binding wraps the *same* `UserModel`
as the Rust crate, so a browser replica and a server-side sheetd built from one
pinned rev speak the same bitcode diff format with no translation layer. That is
the collab transport — and the reason `flushSendQueue` / `applyExternalDiffs` are
carried unused today (see architecture.md, "What is deliberately NOT here yet").

## The delta echo is computed by brute force

`Model.support` — the dependency graph — is `pub(crate)`, and `evaluate()`
rebuilds it on every recalc. There is no "what changed?" API to ask.

So `WorkbookController.mutate()` snapshots every non-empty computed value in the
sheet before and after the change and diffs the two, bounded by
`SNAPSHOT_CELL_CAP` (50 000). The cap is not a tuning knob — it is the point
where an O(non-empty cells) walk stops being free. The cost is acceptable only
because `evaluate()` is a full recalc anyway; if upstream ever exposes a
dependents API, this whole mechanism deletes.

That delta echo is what lets the agent mutate and learn the ripple in one
round-trip instead of re-reading the range. It is the core thesis in miniature
(architecture.md, "Why this shape"), so it is worth the brute force.

## Presence is our protocol, not the engine's

Selections and view state never enter IronCalc's diff stream — upstream marks it
`// FIXME: we are missing SetViewDiffs`. The engine will not tell another replica
where a cursor is.

So presence (agent status, highlights, cell pulses) lives in the controller as
our own state, and `sheets.channel.v1` carries it as our own frames. This is not
a workaround waiting to be undone: presence is a product surface with agent
colors, notes, and pulses that no general-purpose engine protocol would model.
Upstream landing view diffs would not replace it.

The channel's wire format is specified in
[`docs/channel-protocol.md`](https://github.com/ingram-technologies/sheetkit/blob/main/docs/channel-protocol.md)
in the sheetkit repo. That spec is the contract; don't restate it here.
