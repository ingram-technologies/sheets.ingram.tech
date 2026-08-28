"use client";

import {
	AlignCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	BanIcon,
	BoldIcon,
	CheckIcon,
	ChevronDownIcon,
	ItalicIcon,
	PaintBucketIcon,
	PercentIcon,
	Redo2Icon,
	StrikethroughIcon,
	TypeIcon,
	UnderlineIcon,
	Undo2Icon,
} from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellRange } from "@/lib/a1";
import { cn } from "@/lib/utils";

import type { WorkbookController } from "./controller";
import type { Color } from "./ironcalc";
import { isPercent, stepDecimals, togglePercent } from "./number-format";
import { AUTOMATIC_COLOR, SWATCHES } from "./palette";
import { ScrollStrip } from "./ScrollStrip";

const NUMBER_FORMATS: { label: string; example: string; fmt: string }[] = [
	{ label: "Automatic", example: "1000.12", fmt: "general" },
	{ label: "Number", example: "1,000.12", fmt: "#,##0.00" },
	{ label: "Percent", example: "10.12%", fmt: "0.00%" },
	{ label: "Euro", example: "€1,000.12", fmt: "[$€-x-euro2]#,##0.00" },
	{ label: "Dollar", example: "$1,000.12", fmt: "$#,##0.00" },
	{ label: "Date", example: "2026-07-14", fmt: "yyyy-mm-dd" },
	{ label: "Time", example: "14:05", fmt: "hh:mm" },
];

function selectionRange(controller: WorkbookController): CellRange {
	const view = controller.selectedView();
	return {
		startRow: Math.min(view.range[0], view.range[2]),
		startCol: Math.min(view.range[1], view.range[3]),
		endRow: Math.max(view.range[0], view.range[2]),
		endCol: Math.max(view.range[1], view.range[3]),
	};
}

export function Toolbar({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);

	const view = controller.selectedView();
	const style = controller.cellStyle(view.sheet, view.row, view.column);
	const model = controller.model;
	// Normalised once: an unset format reads back as "" from an imported
	// workbook, and every consumer below would otherwise repeat the check.
	const currentFormat = style.num_fmt || "general";

	// A cell colour can be a literal hex or a [themeIndex, tint] pair; only the
	// engine can flatten the latter. Resolve before comparing against a swatch.
	// Note the asymmetry: fill READS back as `fill.color` but is WRITTEN via
	// the `fill.fg_color` style path.
	const resolve = (color: Color): string =>
		color ? controller.resolveColor(color) : "";
	const currentInk = resolve(style.font.color);
	const currentTint = resolve(style.fill?.color);

	// Null from stepDecimals means "this format has no decimals" — a date or a
	// time — which is a disabled button, never a silently ignored click.
	const percent = isPercent(currentFormat);
	const fewerDecimals = stepDecimals(currentFormat, -1);
	const moreDecimals = stepDecimals(currentFormat, 1);

	const setStyle = (path: string, value: string) => {
		const range = selectionRange(controller);
		controller.mutate((m) =>
			m.updateRangeStyle(controller.area(view.sheet, range), path, value),
		);
	};

	const toggle = (path: string, current: boolean) => {
		setStyle(path, current ? "false" : "true");
	};

	return (
		// The row can't wrap without changing the chrome's height, so a narrow
		// viewport scrolls it — inside a ScrollStrip, which is what tells the
		// user the rest of the row exists and gives a mouse a way to reach it.
		<ScrollStrip
			role="toolbar"
			aria-label="Formatting"
			aria-orientation="horizontal"
			className="h-10 w-full shrink-0 border-b border-border bg-background px-2"
			contentClassName="gap-0.5"
		>
			<IconButton
				label="Undo (Ctrl+Z)"
				disabled={!model.canUndo()}
				onClick={() => controller.mutate((m) => m.undo())}
			>
				<Undo2Icon className="size-4" />
			</IconButton>
			<IconButton
				label="Redo (Ctrl+Y)"
				disabled={!model.canRedo()}
				onClick={() => controller.mutate((m) => m.redo())}
			>
				<Redo2Icon className="size-4" />
			</IconButton>

			<Separator orientation="vertical" className="mx-1 h-5" />

			<IconButton
				label="Bold (Ctrl+B)"
				active={style.font.b}
				onClick={() => toggle("font.b", style.font.b)}
			>
				<BoldIcon className="size-4" />
			</IconButton>
			<IconButton
				label="Italic (Ctrl+I)"
				active={style.font.i}
				onClick={() => toggle("font.i", style.font.i)}
			>
				<ItalicIcon className="size-4" />
			</IconButton>
			<IconButton
				label="Underline (Ctrl+U)"
				active={style.font.u}
				onClick={() => toggle("font.u", style.font.u)}
			>
				<UnderlineIcon className="size-4" />
			</IconButton>
			<IconButton
				label="Strikethrough"
				active={style.font.strike}
				onClick={() => toggle("font.strike", style.font.strike)}
			>
				<StrikethroughIcon className="size-4" />
			</IconButton>

			<ColorMenu
				label="Text colour"
				tone="ink"
				icon={<TypeIcon className="size-4" />}
				current={currentInk}
				onPick={(color) => setStyle("font.color", color)}
			/>
			<ColorMenu
				label="Fill colour"
				tone="tint"
				icon={<PaintBucketIcon className="size-4" />}
				current={currentTint}
				onPick={(color) => setStyle("fill.fg_color", color)}
			/>

			<Separator orientation="vertical" className="mx-1 h-5" />

			<IconButton
				label="Align left"
				active={style.alignment?.horizontal === "left"}
				onClick={() => setStyle("alignment.horizontal", "left")}
			>
				<AlignLeftIcon className="size-4" />
			</IconButton>
			<IconButton
				label="Align centre"
				active={style.alignment?.horizontal === "center"}
				onClick={() => setStyle("alignment.horizontal", "center")}
			>
				<AlignCenterIcon className="size-4" />
			</IconButton>
			<IconButton
				label="Align right"
				active={style.alignment?.horizontal === "right"}
				onClick={() => setStyle("alignment.horizontal", "right")}
			>
				<AlignRightIcon className="size-4" />
			</IconButton>

			<Separator orientation="vertical" className="mx-1 h-5" />

			{/*
			 * The three number-format actions that carry the traffic. They were
			 * reachable only two clicks deep in the menu beside them, which put
			 * the most repeated formatting gesture in a spreadsheet behind the
			 * slowest control in the toolbar.
			 */}
			<IconButton
				label="Format as percent"
				active={percent}
				onClick={() => setStyle("num_fmt", togglePercent(currentFormat))}
			>
				<PercentIcon className="size-4" />
			</IconButton>
			<IconButton
				wide
				label="Decrease decimal places"
				// A date or a time has no decimals to step, and rewriting one
				// into a number format would relabel every cell in the range.
				disabled={fewerDecimals === null}
				onClick={() => fewerDecimals && setStyle("num_fmt", fewerDecimals)}
			>
				<span className="tabular-nums">&minus;.0</span>
			</IconButton>
			<IconButton
				wide
				label="Increase decimal places"
				disabled={moreDecimals === null}
				onClick={() => moreDecimals && setStyle("num_fmt", moreDecimals)}
			>
				<span className="tabular-nums">+.0</span>
			</IconButton>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							aria-label="Number format"
							className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
						>
							123
							<ChevronDownIcon className="size-3" />
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					{NUMBER_FORMATS.map((format) => {
						const active = currentFormat === format.fmt;
						return (
							<DropdownMenuItem
								key={format.label}
								onClick={() => setStyle("num_fmt", format.fmt)}
							>
								{/* A tick, not just a highlight — the menu has to
								    answer "what format is this cell?" */}
								<CheckIcon
									className={cn(
										"size-3.5 shrink-0",
										active ? "opacity-100" : "opacity-0",
									)}
								/>
								<span className="min-w-24 flex-1">{format.label}</span>
								<span className="text-muted-foreground text-xs">
									{format.example}
								</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</ScrollStrip>
	);
}

function IconButton({
	label,
	active,
	disabled,
	wide,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	disabled?: boolean;
	/** For a short typographic label (−.0) rather than a 16px glyph. */
	wide?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size={wide ? "sm" : "icon"}
						disabled={disabled}
						aria-label={label}
						aria-pressed={active}
						className={cn(
							"shrink-0 text-xs",
							wide ? "h-7 px-1.5" : "size-7",
							active
								? // Coral is the brand's "active/shipped state"
									// signal. The old `bg-accent` was charcoal on
									// charcoal — a 1.35:1 step, so Bold-on and
									// Bold-off looked identical.
									"bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary"
								: "text-muted-foreground",
						)}
						onClick={onClick}
					>
						{children}
					</Button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function ColorMenu({
	label,
	tone,
	icon,
	current,
	onPick,
}: {
	label: string;
	tone: "ink" | "tint";
	icon: React.ReactNode;
	current?: string;
	onPick: (color: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={label}
						className="size-7 shrink-0 text-muted-foreground"
					>
						{icon}
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="w-auto">
				<button
					type="button"
					onClick={() => onPick(AUTOMATIC_COLOR)}
					className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
					<BanIcon className="size-3.5 text-muted-foreground" />
					Automatic
				</button>
				<div className="grid grid-cols-5 gap-1 p-1">
					{SWATCHES.map((swatch) => {
						const color = swatch[tone];
						const active = current?.toUpperCase() === color.toUpperCase();
						return (
							<button
								key={swatch.name}
								type="button"
								// Named, not hex: "Text colour: Red", never
								// "Text colour #b91c1c".
								aria-label={`${label}: ${swatch.name}`}
								aria-pressed={active}
								title={swatch.name}
								className={cn(
									"size-6 rounded-sm ring-offset-2 ring-offset-popover",
									// A hairline that works on both a near-black
									// and a near-white swatch.
									"border border-black/20",
									active && "ring-2 ring-ring",
								)}
								style={{ backgroundColor: color }}
								onClick={() => onPick(color)}
							/>
						);
					})}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
