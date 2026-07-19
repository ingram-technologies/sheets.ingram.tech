import { ArrowUpRightIcon } from "lucide-react";

import { SheetsMark } from "@/components/brand/sheets-mark";
import { DemoWorkbook } from "@/components/landing/DemoWorkbook";
import { LandingCta } from "@/components/landing/LandingCta";

const SHEETKIT_URL = "https://github.com/ingram-technologies/sheetkit";

/**
 * The public front door. Everything here is server-rendered and needs no
 * session — the only interactive island is <LandingCta>, which either signs the
 * visitor in with Google or links them into /spreadsheets. Framing: this is a
 * research project, not a product launch. The copy stays at the level of what a
 * visitor can see and try; implementation detail belongs in the blog post.
 */
export function Landing({ signedIn }: { signedIn: boolean }) {
	return (
		<div className="min-h-dvh bg-background text-foreground">
			<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
				<a
					href="/"
					className="flex items-center gap-2.5"
					aria-label="Ingram Sheets"
				>
					<span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
						<SheetsMark className="size-4" />
					</span>
					<span className="text-sm font-semibold tracking-tight">
						Ingram Sheets
					</span>
				</a>
				<nav className="flex items-center gap-5 text-sm">
					<a
						href="#how"
						className="hidden text-muted-foreground underline-offset-4 transition-colors hover:text-foreground sm:inline"
					>
						How it works
					</a>
					<a
						href={SHEETKIT_URL}
						target="_blank"
						rel="noreferrer"
						className="hidden items-center gap-1 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground sm:inline-flex"
					>
						sheetkit
						<ArrowUpRightIcon className="size-3.5" />
					</a>
					<LandingCta signedIn={signedIn} size="sm">
						{signedIn ? "Open" : "Sign in"}
					</LandingCta>
				</nav>
			</header>

			{/* ── Hero ─────────────────────────────────────────────────────── */}
			<section className="relative overflow-hidden">
				<GridBackdrop />
				<div className="mx-auto grid w-full max-w-5xl gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pt-24 lg:pb-28">
					<div className="max-w-xl">
						<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
							Give the agent the spreadsheet, not a chat box beside it.
						</h1>
						<p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty">
							The engine is IronCalc, a full spreadsheet engine compiled
							to WebAssembly and{" "}
							<span className="font-medium text-foreground">
								running in your browser
							</span>
							. The agent&apos;s tools run there too, against the same
							document you&apos;re editing. Ask it to build something and
							watch the cursor move and the cells fill in.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<LandingCta signedIn={signedIn} size="lg" />
							<a
								href="#how"
								className="inline-flex h-11 items-center rounded-md px-5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
							>
								See how it works
							</a>
						</div>
						<p className="mt-6 text-sm text-muted-foreground">
							Early, single-player, and more experiment than product. The
							parts we built around the engine are{" "}
							<a
								href={SHEETKIT_URL}
								target="_blank"
								rel="noreferrer"
								className="text-foreground underline-offset-4 hover:underline"
							>
								open source
							</a>
							.
						</p>
					</div>

					<HeroSheet />
				</div>
			</section>

			{/* ── Live demo ────────────────────────────────────────────────── */}
			<section
				id="demo"
				className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 pb-8"
			>
				<div className="mb-6 max-w-2xl">
					<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
						Watch the agent work
					</h2>
					<p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
						The grid and engine below are the real thing, running in your
						browser right now. A recorded script drives the same tools the
						live agent uses — no account, no inference. When it finishes,
						the sheet is yours to edit.
					</p>
				</div>
				<DemoWorkbook />
			</section>

			{/* ── Thesis ───────────────────────────────────────────────────── */}
			<Section>
				<h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
					Why not just add AI to a spreadsheet?
				</h2>
				<div className="mt-6 max-w-2xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
					<p>
						Most attempts bolt a chat panel onto a grid, or wire the model
						in from outside over MCP. The hard part isn&apos;t the
						transport, it&apos;s what the model gets back: it reads one
						range, writes another, and to see what the write did, it reads
						again. On a sheet full of formulas, that round-trip is most of
						the work.
					</p>
					<p className="text-foreground">
						So the tools are built around what the agent gets back.
					</p>
				</div>
				<dl className="mt-10 grid max-w-3xl gap-x-8 gap-y-8 sm:grid-cols-3">
					<Rebuild
						term="A structure-aware read"
						desc="Instead of a cell-by-cell dump, the agent gets a compact sketch — regions, headers, types, fills — enough to see the layout of a sheet without reading every cell."
					/>
					<Rebuild
						term="A delta echo on every write"
						desc="Every write comes back with what it changed on that sheet, recalculated formulas included, so the agent usually doesn't have to read back after an edit."
					/>
					<Rebuild
						term="Range-level verbs"
						desc="Fill, sort, and format each take a whole region in one call, instead of a loop of single-cell edits that fan out into round-trips."
					/>
				</dl>
			</Section>

			<Divider />

			{/* ── How it works ─────────────────────────────────────────────── */}
			<Section id="how">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					How it works
				</h2>
				<div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
					<Beat title="The engine runs in your browser">
						<Mono>IronCalc</Mono> handles formulas, dynamic arrays, undo,
						styles, and number formats, all client-side. The server never
						parses a spreadsheet — it stores the engine&apos;s own bytes and
						hands them back.
					</Beat>
					<Beat title="The agent’s tools run there too">
						Chat streams from the Anthropic API, but the tool calls the
						model makes execute in your browser, against the same document
						you&apos;re editing.
					</Beat>
					<Beat title="You watch it happen">
						The agent focuses a range, switches to the sheet it&apos;s
						working on, writes, and the changed cells pulse. Your cursor is
						blue, the agent&apos;s is violet, so you can always tell whose
						cursor is whose.
					</Beat>
				</div>
			</Section>

			<Divider />

			{/* ── Limits ───────────────────────────────────────────────────── */}
			<Section id="limits">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					What it isn&rsquo;t, yet
				</h2>
				<p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
					It&apos;s an early proof of an idea, and we use it ourselves.
				</p>
				<ul className="mt-8 max-w-2xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
					<Limit term="Single-player.">
						No realtime collaboration yet — one client edits a workbook at a
						time.
					</Limit>
					<Limit term="One owner per workbook.">
						No sharing, no roles, no view links. A workbook is reachable by
						its owner or by nobody.
					</Limit>
					<Limit term="Imports are thin.">
						xlsx export and Google Sheets import work today; CSV and xlsx
						import don&apos;t yet.
					</Limit>
					<Limit term="Some engine features aren&rsquo;t wired up.">
						Frozen panes, merged cells, and borders exist in the engine but
						aren&apos;t wired into the UI yet.
					</Limit>
				</ul>
			</Section>

			<Divider />

			{/* ── Open source ──────────────────────────────────────────────── */}
			<Section>
				<div className="flex flex-col gap-6 rounded-xl border border-border bg-card/40 p-8 sm:flex-row sm:items-center sm:justify-between">
					<div className="max-w-xl">
						<h2 className="text-xl font-semibold tracking-tight">
							What we built is open source
						</h2>
						<p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
							The engine is IronCalc, an open-source project we build on
							but didn&apos;t write. Our parts — the server daemon, the
							agent&apos;s tool definitions, and the sync protocol — live
							in <Mono>sheetkit</Mono>. This app is the UI on top.
						</p>
					</div>
					<a
						href={SHEETKIT_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent"
					>
						View sheetkit
						<ArrowUpRightIcon className="size-4" />
					</a>
				</div>
			</Section>

			{/* ── Final CTA ────────────────────────────────────────────────── */}
			<section className="mx-auto w-full max-w-5xl px-6 pt-8 pb-24">
				<div className="flex flex-col items-start gap-6">
					<h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
						Open a blank sheet and ask the agent to build something in it.
					</h2>
					<LandingCta signedIn={signedIn} size="lg" />
				</div>
			</section>

			<footer className="mx-auto w-full max-w-5xl px-6 pb-10">
				<div className="flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
					<p>
						© {new Date().getFullYear()}{" "}
						<a
							href="https://ingram.tech"
							target="_blank"
							rel="noreferrer"
							className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
						>
							Ingram Technologies
						</a>
					</p>
					<div className="flex items-center gap-5">
						<a
							href={SHEETKIT_URL}
							target="_blank"
							rel="noreferrer"
							className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
						>
							sheetkit
						</a>
						<a
							href="https://ingram.tech/privacy"
							target="_blank"
							rel="noreferrer"
							className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
						>
							Privacy
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
	return (
		<section
			id={id}
			className="mx-auto w-full max-w-5xl scroll-mt-20 px-6 py-16 sm:py-20"
		>
			{children}
		</section>
	);
}

function Divider() {
	return (
		<div className="mx-auto w-full max-w-5xl px-6">
			<hr className="border-border" />
		</div>
	);
}

function Mono({ children }: { children: React.ReactNode }) {
	return (
		<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
			{children}
		</code>
	);
}

function Rebuild({ term, desc }: { term: string; desc: string }) {
	return (
		<div>
			<dt className="text-sm font-semibold text-foreground">{term}</dt>
			<dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
				{desc}
			</dd>
		</div>
	);
}

function Beat({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 className="text-base font-semibold tracking-tight">{title}</h3>
			<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
				{children}
			</p>
		</div>
	);
}

function Limit({ term, children }: { term: string; children: React.ReactNode }) {
	return (
		<li className="flex gap-3">
			<span
				aria-hidden
				className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
			/>
			<span>
				<span className="font-medium text-foreground">{term}</span> {children}
			</span>
		</li>
	);
}

/** Faint blueprint grid behind the hero — the product's own motif (a sheet is a
 *  grid), masked so it fades before it competes with the copy. */
function GridBackdrop() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10"
			style={{
				backgroundImage:
					"linear-gradient(oklch(1 0 0 / 0.035) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.035) 1px, transparent 1px)",
				backgroundSize: "48px 48px",
				maskImage:
					"radial-gradient(ellipse 90% 70% at 30% 20%, black, transparent 75%)",
				WebkitMaskImage:
					"radial-gradient(ellipse 90% 70% at 30% 20%, black, transparent 75%)",
			}}
		/>
	);
}

/**
 * The thesis in one glance: a real-looking sheet (white paper, like the actual
 * canvas) where the human holds a blue selection and the agent is mid-write in
 * violet, formula still showing, its cell pulsing. Static, decorative, and a
 * faithful miniature of what the product does.
 */
function HeroSheet() {
	return (
		<div className="w-full">
			<div
				className="overflow-hidden rounded-xl border border-border shadow-2xl shadow-black/40"
				style={{
					backgroundColor: "var(--sheet-cell-bg)",
					color: "var(--sheet-cell-fg)",
					fontFamily: "var(--sheet-font)",
				}}
			>
				{/* Faux window bar so it reads as the app, not a bare table. */}
				<div
					className="flex items-center gap-2 border-b px-3 py-2"
					style={{ borderColor: "var(--sheet-grid-line)" }}
				>
					<span className="flex gap-1.5" aria-hidden>
						<span className="size-2.5 rounded-full bg-black/15" />
						<span className="size-2.5 rounded-full bg-black/15" />
						<span className="size-2.5 rounded-full bg-black/15" />
					</span>
					<span
						className="ml-1 font-mono text-[11px]"
						style={{ color: "var(--sheet-header-fg)" }}
					>
						pricing.sheet
					</span>
				</div>

				<div
					className="grid text-[13px]"
					style={{ gridTemplateColumns: "2rem repeat(3, minmax(0, 1fr))" }}
				>
					<HeadCell />
					<HeadCell>A</HeadCell>
					<HeadCell>B</HeadCell>
					<HeadCell>C</HeadCell>

					<SheetRow n="1" a="Plan" b="Seats" c="MRR" header />
					<SheetRow n="2" a="Free" b="0" c="$0" />
					<SheetRow n="3" a="Pro" b="24" c="=B3*29" bSelected cAgent />
					<SheetRow n="4" a="Scale" b="8" c="$792" />
					<SheetRow n="5" a="" b="" c="" />
				</div>
			</div>

			<div className="mt-4 flex items-center gap-5 text-xs text-muted-foreground">
				<Legend color="var(--sheet-selection)" label="You" />
				<Legend color="var(--sheet-agent)" label="Agent" />
				<span className="ml-auto hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">
					C3 ← =B3*29
				</span>
			</div>
		</div>
	);
}

function HeadCell({ children }: { children?: React.ReactNode }) {
	return (
		<div
			className="flex h-8 items-center justify-center border-r border-b text-[11px] font-medium"
			style={{
				backgroundColor: "var(--sheet-header-bg)",
				color: "var(--sheet-header-fg)",
				borderColor: "var(--sheet-grid-line)",
			}}
		>
			{children}
		</div>
	);
}

function SheetRow({
	n,
	a,
	b,
	c,
	header,
	bSelected,
	cAgent,
}: {
	n: string;
	a: string;
	b: string;
	c: string;
	header?: boolean;
	bSelected?: boolean;
	cAgent?: boolean;
}) {
	return (
		<>
			<div
				className="flex h-9 items-center justify-center border-r border-b text-[11px]"
				style={{
					backgroundColor: "var(--sheet-header-bg)",
					color: "var(--sheet-header-fg)",
					borderColor: "var(--sheet-grid-line)",
				}}
			>
				{n}
			</div>
			<DataCell value={a} header={header} />
			<DataCell value={b} header={header} selected={bSelected} align="right" />
			<DataCell
				value={c}
				header={header}
				agent={cAgent}
				align="right"
				formula={cAgent}
			/>
		</>
	);
}

function DataCell({
	value,
	header,
	selected,
	agent,
	align = "left",
	formula,
}: {
	value: string;
	header?: boolean;
	selected?: boolean;
	agent?: boolean;
	align?: "left" | "right";
	formula?: boolean;
}) {
	return (
		<div
			className="relative flex h-9 items-center border-r border-b px-2.5"
			style={{
				borderColor: "var(--sheet-grid-line)",
				justifyContent: align === "right" ? "flex-end" : "flex-start",
				fontWeight: header ? 600 : 400,
				fontFamily: formula ? "var(--font-mono, monospace)" : undefined,
				color: header ? "var(--sheet-cell-fg)" : undefined,
			}}
		>
			<span className="truncate">{value}</span>
			{selected ? (
				<span
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{
						boxShadow: "inset 0 0 0 2px var(--sheet-selection)",
						backgroundColor: "var(--sheet-selection-bg)",
					}}
				/>
			) : null}
			{agent ? (
				<>
					<span
						aria-hidden
						className="pointer-events-none absolute inset-0"
						style={{
							outline: "2px dashed var(--sheet-agent)",
							outlineOffset: "-2px",
							backgroundColor: "var(--sheet-agent-bg)",
						}}
					/>
					<span
						aria-hidden
						className="absolute -top-1 -right-1 size-2 rounded-full motion-safe:animate-pulse"
						style={{ backgroundColor: "var(--sheet-agent)" }}
					/>
				</>
			) : null}
		</div>
	);
}

function Legend({ color, label }: { color: string; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span
				aria-hidden
				className="size-2.5 rounded-[3px]"
				style={{ backgroundColor: color }}
			/>
			{label}
		</span>
	);
}
