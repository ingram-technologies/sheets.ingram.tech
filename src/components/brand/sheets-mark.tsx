/**
 * The Ingram Sheets mark: a grid of cells whose bottom-left one is the Ingram
 * triangle — the red shape sitting in the counter of the wordmark's "N". It's
 * a sibling to ingram-hub's plain 2x2 grid of rounded squares; the triangle is
 * what makes this one Sheets. The triangle stays sharp-cornered against the
 * rounded cells on purpose: that contrast is what reads as Ingram rather than
 * as a generic grid glyph.
 *
 * Fills with `currentColor` so callers pick the colour — `text-primary` is the
 * brand red (#FF5757). `app/icon.svg` repeats this geometry with the red
 * hardcoded, since a favicon has no cascade to inherit from; keep the two in
 * sync.
 */
export function SheetsMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<rect x="1.5" y="1.5" width="9.5" height="9.5" rx="1.6" />
			<rect x="13" y="1.5" width="9.5" height="9.5" rx="1.6" />
			<rect x="13" y="13" width="9.5" height="9.5" rx="1.6" />
			<path d="M6.25 13 11 22.5 1.5 22.5Z" />
		</svg>
	);
}
