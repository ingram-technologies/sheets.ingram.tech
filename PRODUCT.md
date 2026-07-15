# Product

## Register

product

## Users

Technical evaluators of Ingram — founders, CTOs, and engineers who already
believe a spreadsheet is a solved problem — plus the Ingram team using it as a
daily driver. They arrive skeptical and spreadsheet-fluent: they have muscle
memory from Excel and Google Sheets, and they have seen a dozen "AI + chat"
demos that collapse on contact. Their context is a real task in a real
workbook, not a tour.

The job to be done: get work done in a spreadsheet *with* an agent as a
genuine collaborator — and, in doing so, come away convinced that Ingram
builds frontier AI that actually ships. Success is the moment a skeptical
user watches the agent work in the same document they are working in, sees
exactly what it touched and why, and trusts it enough to hand over the next
task.

## Product Purpose

sheets.ingram.tech is an AI-native collaborative spreadsheet and Ingram's
**proof artifact**: the demonstration that the lab deploys frontier AI, not
just publishes about it. The IronCalc engine runs as wasm in the browser and
the agent's tools execute client-side against the same model the human edits,
which is *why* its activity is visible live — cursor, pulses, highlights. That
visibility is the product, not decoration (see `docs/architecture.md`).

Because it is a proof artifact, the craft *is* the argument. A rough edge here
is not a rough edge in a side project; it is counter-evidence against the
claim ingram.tech makes.

## Brand Personality

Inherits ingram.tech: **precise · frontier · trustworthy**. In-product this
reads as an instrument, not a brochure — calm, dense where density serves the
task, and legible about what the agent is doing at every moment. Confidence
shows as tight execution, honest state, and never overclaiming (a status that
says "retrying" must actually retry). The agent is a peer with a visible hand,
never a mascot and never a black box.

## Anti-references

Inherits ingram.tech's (generic AI-startup SaaS; enterprise-consultancy beige;
over-minimal portfolio), plus three specific to this surface:

- **A chatbot bolted onto a grid.** The 2024 reflex: a generic chat sidebar
  stapled beside a spreadsheet, with no real binding to the document. The two
  principals share one model here — the UI must show that, not hide it behind
  a transcript.
- **Enterprise Excel gloom.** Ribbon overload, 90s density, grey-on-grey
  chrome, every feature shouted at once.
- **AI-startup spreadsheet.** Purple gradients, sparkle icons, "✨ AI-powered"
  labels, glassmorphism as texture.

## Design Principles

1. **Two principals, one document.** Human and agent are peers in the same
   model — neither is a guest. Presence, selection, and authorship are
   first-class UI, not an afterthought panel. When the two conflict for space
   or attention, neither wins by default; the *active* one does.
2. **Legible machine.** The agent's every action is attributable and visible:
   what range, what changed, what rippled. Never a spinner where a fact would
   do. If the user cannot tell what the agent just did, the feature is
   unfinished.
3. **Honest state.** The UI never claims more than the code does. Saving,
   retrying, failing, importing — each label must be true, and each must reach
   assistive tech. Silent data loss is the worst bug this product can have.
4. **Earned familiarity.** Spreadsheet muscle memory is a feature. Standard
   affordances (Tab/Enter/Shift, blur-commits, F2, sheet tabs) work exactly as
   a fluent user expects. Spend novelty only on the agent — never on
   reinventing a text cursor.
5. **One brand, one system.** ingram.tech is the canonical source; coral-on-
   charcoal is the identity. Prefer the shared registry component over a local
   fork — and when this product genuinely needs more, push it upstream rather
   than drifting.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**. Dark-first charcoal is the shipped surface, so verify
body text and coral both clear 4.5:1 against it (muted-on-muted text and
low-opacity icons are the recurring failure). Every state change the agent
drives needs an `aria-live` path — an agent working invisibly is invisible to
a screen reader user by default. Honor `prefers-reduced-motion` for pulses,
spinners, and dialog transitions. Do not let color alone carry
human-vs-agent authorship: pair it with label, icon, or text. Hit targets
≥24px minimum (WCAG 2.2 target size), and every interactive control needs a
visible `focus-visible` ring.
