---
name: Ingram Sheets
description: The Ingram blueprint as an instrument — charcoal chrome around white spreadsheet paper, one coral signal, and a violet second hand for the agent.
colors:
  coral: "oklch(0.6846 0.2042 24.2803)"
  coral-deep: "oklch(0.4400 0.1400 27.0000)"
  destructive-ink: "oklch(0.6650 0.1900 12.0000)"
  charcoal-base: "oklch(0.2264 0 0)"
  charcoal-surface: "oklch(0.2686 0 0)"
  charcoal-raised: "oklch(0.3211 0 0)"
  ink: "oklch(0.9702 0 0)"
  muted-ink: "oklch(0.7155 0 0)"
  paper: "oklch(1 0 0)"
  sheet-selection: "oklch(0.5461 0.1530 253.7100)"
  sheet-agent: "oklch(0.5575 0.2000 293.8500)"
  agent-ink: "oklch(0.6600 0.1600 293.8500)"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  chrome:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1
  formula:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.charcoal-base}"
    rounded: "{rounded.md}"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.coral-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "40px"
  toolbar-toggle-active:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.coral}"
    rounded: "{rounded.md}"
    height: "28px"
---

# Design System: Ingram Sheets

## 1. Overview

**Creative North Star: "The Instrument"**

Sheets inherits ingram.tech's blueprint wholesale — charcoal ground, one coral
signal, Inter across weights, chroma-0 neutrals — and puts it around a piece of
white paper. That inversion is the whole idea: the chrome is the dark
instrument, the grid is the lit worksurface, and coral marks what is live. The
brand's "exposed structure" motif needs no decoration here, because a
spreadsheet *is* a grid; the ruled linework the marketing site draws by hand is
the product's actual content.

The second idea is that this instrument has **two hands**. A human and an agent
work the same model at the same time, so the system carries a second signal
colour — violet — used only for the machine. Human blue, agent violet, brand
coral: three roles that must never be confusable, because the product's core
claim is that you can see what the agent did.

Read [`PRODUCT.md`](./PRODUCT.md) first — it owns the register, users, and the
anti-references this document serves.

**Key characteristics**
- Dark-first charcoal chrome; the shipped surface is `.dark`, hardcoded.
- White sheet paper, always — the canvas never inverts (cell content carries
  explicit user/engine colours, and IronCalc's default font colour is black, so
  a dark canvas would render black-on-grey).
- One brand signal (coral), one machine signal (violet), one human signal (blue).
- Dense, keyboard-first chrome. This is a tool, not a page.

## 2. Colours

### Chrome (charcoal ramp — inherited unchanged)
- **Charcoal Base** `oklch(0.2264 0 0)` — the ground behind all chrome.
- **Charcoal Surface** `oklch(0.2686 0 0)` — popovers, dialogs, dropdowns.
- **Charcoal Raised** `oklch(0.3211 0 0)` — hairlines, borders, inputs.
- **Ink** `oklch(0.9702 0 0)` — primary text (15.64:1 on base).
- **Muted Ink** `oklch(0.7155 0 0)` — secondary text (6.76:1). The floor; never
  lighter for body copy.

### Signals
- **Signal Coral** `oklch(0.6846 0.2042 24.2803)` — the brand's one voice.
  Primary actions, the active/pressed toolbar state, the selected sheet tab,
  focus rings. 5.48:1 as text on charcoal.
- **Coral Deep** `oklch(0.44 0.14 27)` — destructive FILLS only.
- **Destructive Ink** `oklch(0.665 0.19 12)` — destructive/error TEXT only.
- **Selection Blue** `oklch(0.5461 0.153 253.71)` — the human's selection on the
  white canvas (4.97:1 on paper).
- **Agent Violet** `oklch(0.5575 0.2 293.85)` — the agent's presence on the
  white canvas.
- **Agent Ink** `oklch(0.66 0.16 293.85)` — the agent's colour on charcoal
  chrome.

### Named rules

**The Two-Grounds Rule.** This app has two backgrounds — charcoal chrome and
white paper — and a colour tuned for one fails on the other. The agent violet is
split for exactly this reason (`--sheet-agent` on paper, `--agent-ink` on
chrome; the canvas tone measures 3.32:1 as chrome text and fails AA). Never
reuse a paper colour in the chrome, or vice versa, without re-measuring.

**The Destructive Split Rule.** On a dark ground no single red can be both a
fill that is unmistakably not the coral CTA *and* legible as text. So
`--destructive` is a fill (oxblood, white text 7.99:1) and `--destructive-ink`
is text (rose, 4.52:1). `text-destructive` is never correct in this app — it
measures 1.81:1.

**The Three-Signal Rule.** Coral = brand/active. Violet = the agent. Blue = the
human. A UI element gets exactly one of these, and never borrows another's. If
the agent ever renders coral, the "who did this?" question the product exists to
answer becomes unanswerable.

**The Chroma-0 Rule** (inherited). The chrome neutrals carry zero chroma. Never
tint the charcoal.

**Content colour is not chrome colour.** The toolbar's cell palette
(`src/components/workbook/palette.ts`) lands on white paper and is deliberately
outside the chrome ramp. It is still a designed OKLCH system with named entries,
hue-anchored to the brand — not ad-hoc hexes, and never announced to screen
readers as a hex code.

## 3. Typography

**One family: Inter**, loaded via `next/font/google` exactly as ingram.tech
loads it, feeding `--font-inter` → `--font-sans` → `--sheet-font` (so the canvas
renderer draws cells in Inter too). Hierarchy comes from weight and scale, never
a second family — the Weight-Not-Family Rule, inherited.

**Fixed rem scale, not fluid.** This is product register: `clamp()` display type
belongs on the marketing site. Chrome sits at 11–14px because the tool is dense.

**Mono is for code, not for decoration.** Formulas, cell references, and the
selection range use `--font-mono`. Formulas are code; a proportional face makes
`=SUM(B2:B10)` needlessly hard to scan. The brand's tiny tracked mono *label* —
the blueprint annotation — has no place in here; it is a marketing device, and
this surface has no sections to annotate.

## 4. Elevation & motion

Flat. Depth appears only for genuinely floating surfaces (dialogs, dropdowns,
the agent panel when it overlays a narrow viewport). No glassmorphism: the
brand retains it for surfaces floating over scrollable content, and this app has
none worth the blur.

Motion conveys state and nothing else — cell pulses after a mutation, the chat
spinner, dialog entrances. 150–250ms. No orchestrated load sequences; the app
loads into a task. `prefers-reduced-motion` collapses durations rather than
removing transitions, because dialogs rely on `animate-in` to become visible at
all.

**Z-index is a semantic scale** (`--z-grid-overlay` → `--z-tooltip` in
globals.css). Never an arbitrary number.

## 5. Components

The shared registry (`@ingram/*`, `~/src/registry`) is the source; prefer
`npx shadcn@latest add @ingram/<name>` over a local component. Three files carry
a deliberate local delta, each commented in place and each an upstream
candidate:

- `page-header.tsx` — widened icon type + `iconClassName` (pre-existing).
- `dropdown-menu.tsx` / `delete-confirm-dialog.tsx` — use `--destructive-ink`
  for text, because the registry's single-token assumption is unreadable on a
  dark ground.
- `dialog.tsx` — `max-h` + scroll; the registry sets none, and a centred popup
  taller than the viewport overflows both edges at once.

Every interactive control needs: default, hover, **focus-visible**, active,
disabled, and — where it does work — loading. A base `:focus-visible` ring is
defined in globals.css so hand-rolled controls can't regress silently.

## 6. Do's and Don'ts

### Do
- Keep coral rare — it marks the active state and the primary action, nothing else.
- Measure contrast before shipping a colour. Muted-on-muted and low-opacity
  icons are this codebase's recurring failure.
- Give the agent an `aria-live` path for anything it does. An agent working
  invisibly is invisible to a screen reader by default.
- Tell the truth in state labels. "Retrying" must retry.

### Don't
- **Don't** use `text-destructive` — it's the oxblood fill (1.81:1). Use
  `text-destructive-ink`.
- **Don't** use `bg-accent` to mean *active* or *selected*. It's charcoal on
  charcoal: 1.35:1, effectively invisible. That's coral's job.
- **Don't** render the agent in coral, or the human in violet.
- **Don't** hardcode a hex in chrome. The one legitimate exception is Google's
  four brand colours on the sign-in button, which Google mandates.
- **Don't** parse a formatted cell string to recover a number — see
  `cell-stats.ts` and `docs/engine-constraints.md`.
- **Don't** add gradient text, side-stripe borders, or an eyebrow above every
  section (inherited absolute bans).
