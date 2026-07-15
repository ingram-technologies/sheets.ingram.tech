/**
 * The cell colour palette offered by the toolbar.
 *
 * These are *content* colours, not app chrome: they land on the white sheet
 * paper (see the grid tokens in globals.css), so they are not drawn from the
 * charcoal/coral chrome ramp — chrome tokens would be illegible there. They
 * are still a designed system rather than the arbitrary Tailwind-v3 hexes this
 * replaces: one OKLCH ramp, hue-anchored to the brand (red sits on coral's hue,
 * violet on the agent's), with an `ink` tone tuned to read on white and a
 * `tint` tone tuned to hold black text.
 *
 * Every entry is NAMED. The old palette announced itself to screen readers as
 * "Text color #111827"; a colour picker that reads out hex is a colour picker
 * no one can use without sight.
 */

export interface Swatch {
	name: string;
	/** Text tone — for `font.color`. Legible on the white sheet. */
	ink: string;
	/** Fill tone — for `fill.fg_color`. Holds the engine's black default text. */
	tint: string;
}

// Hues: 24.28 is brand coral; 293.85 is the agent violet. The rest are spaced
// around the wheel so adjacent swatches stay tellable apart.
export const SWATCHES: Swatch[] = [
	{ name: "Charcoal", ink: "#242424", tint: "#E8E8E8" },
	{ name: "Grey", ink: "#6B6B6B", tint: "#F2F2F2" },
	{ name: "Red", ink: "#C0392B", tint: "#FBDDD8" },
	{ name: "Orange", ink: "#B45A16", tint: "#FBE3CE" },
	{ name: "Amber", ink: "#8A6D0B", tint: "#F8EEC4" },
	{ name: "Green", ink: "#2E7D46", tint: "#D3EEDA" },
	{ name: "Teal", ink: "#0F7480", tint: "#CFEBEE" },
	{ name: "Blue", ink: "#2060B8", tint: "#D6E4FA" },
	{ name: "Violet", ink: "#6742C4", tint: "#E2DAF8" },
	{ name: "Pink", ink: "#B23A6B", tint: "#FADCE8" },
];

/**
 * IronCalc treats an empty colour string as "no colour set", which is how a
 * user takes a colour back off. Without this the old palette was a one-way
 * door: once a cell was red it could never return to automatic.
 */
export const AUTOMATIC_COLOR = "";
