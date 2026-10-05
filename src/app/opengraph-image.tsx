import { ImageResponse } from "next/og";

// The card a link to the site unfurls as. It lives at the app root so it
// serves at a stable `/opengraph-image` and every page below inherits it.

export const alt = "Ingram Sheets — a spreadsheet the agent operates directly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// DESIGN.md's charcoal chrome, as hex: satori does not read oklch.
const CHARCOAL_BASE = "#1c1c1c";
const INK = "#f5f5f5";
const MUTED_INK = "#a3a3a3";

// app/icon.svg, the SheetsMark with the brand red baked in.
const MARK = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF5757">' +
		'<rect x="1.5" y="1.5" width="9.5" height="9.5" rx="1.6"/>' +
		'<rect x="13" y="1.5" width="9.5" height="9.5" rx="1.6"/>' +
		'<rect x="13" y="13" width="9.5" height="9.5" rx="1.6"/>' +
		'<path d="M6.25 13 11 22.5 1.5 22.5Z"/></svg>',
)}`;

export default function Image() {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: 80,
				background: CHARCOAL_BASE,
				color: INK,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				{/* oxlint-disable-next-line nextjs/no-img-element -- satori renders <img>, not next/image */}
				<img src={MARK} width={72} height={72} alt="" />
				<div style={{ display: "flex", fontSize: 44, fontWeight: 600 }}>
					Ingram Sheets
				</div>
			</div>
			<div
				style={{
					display: "flex",
					fontSize: 76,
					fontWeight: 600,
					lineHeight: 1.1,
				}}
			>
				A spreadsheet the agent operates directly.
			</div>
			<div style={{ display: "flex", fontSize: 30, color: MUTED_INK }}>
				sheets.ingram.tech
			</div>
		</div>,
		size,
	);
}
