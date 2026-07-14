"use client";

import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	ChevronDown,
	Italic,
	PaintBucket,
	Redo2,
	Strikethrough,
	Type,
	Underline,
	Undo2,
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

import type { WorkbookController } from "./controller";

const NUMBER_FORMATS: { label: string; example: string; fmt: string }[] = [
	{ label: "Automatic", example: "1000.12", fmt: "general" },
	{ label: "Number", example: "1,000.12", fmt: "#,##0.00" },
	{ label: "Percent", example: "10.12%", fmt: "0.00%" },
	{ label: "Euro", example: "€1,000.12", fmt: "[$€-x-euro2]#,##0.00" },
	{ label: "Dollar", example: "$1,000.12", fmt: "$#,##0.00" },
	{ label: "Date", example: "2026-07-14", fmt: "yyyy-mm-dd" },
	{ label: "Time", example: "14:05", fmt: "hh:mm" },
];

const SWATCHES = [
	"#111827",
	"#6b7280",
	"#b91c1c",
	"#c2410c",
	"#a16207",
	"#15803d",
	"#0e7490",
	"#1d4ed8",
	"#6d28d9",
	"#be185d",
	"#ffffff",
	"#f3f4f6",
	"#fecaca",
	"#fed7aa",
	"#fef08a",
	"#bbf7d0",
	"#a5f3fc",
	"#bfdbfe",
	"#ddd6fe",
	"#fbcfe8",
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
		<div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border bg-background px-2">
			<IconButton
				label="Undo (Ctrl+Z)"
				disabled={!model.canUndo()}
				onClick={() => controller.mutate((m) => m.undo())}
			>
				<Undo2 className="size-4" />
			</IconButton>
			<IconButton
				label="Redo (Ctrl+Y)"
				disabled={!model.canRedo()}
				onClick={() => controller.mutate((m) => m.redo())}
			>
				<Redo2 className="size-4" />
			</IconButton>

			<Separator orientation="vertical" className="mx-1 h-5" />

			<IconButton
				label="Bold (Ctrl+B)"
				active={style.font.b}
				onClick={() => toggle("font.b", style.font.b)}
			>
				<Bold className="size-4" />
			</IconButton>
			<IconButton
				label="Italic (Ctrl+I)"
				active={style.font.i}
				onClick={() => toggle("font.i", style.font.i)}
			>
				<Italic className="size-4" />
			</IconButton>
			<IconButton
				label="Underline (Ctrl+U)"
				active={style.font.u}
				onClick={() => toggle("font.u", style.font.u)}
			>
				<Underline className="size-4" />
			</IconButton>
			<IconButton
				label="Strikethrough"
				active={style.font.strike}
				onClick={() => toggle("font.strike", style.font.strike)}
			>
				<Strikethrough className="size-4" />
			</IconButton>

			<ColorMenu
				label="Text color"
				icon={<Type className="size-4" />}
				onPick={(color) => setStyle("font.color", color)}
			/>
			<ColorMenu
				label="Fill color"
				icon={<PaintBucket className="size-4" />}
				onPick={(color) => setStyle("fill.fg_color", color)}
			/>

			<Separator orientation="vertical" className="mx-1 h-5" />

			<IconButton
				label="Align left"
				active={style.alignment?.horizontal === "left"}
				onClick={() => setStyle("alignment.horizontal", "left")}
			>
				<AlignLeft className="size-4" />
			</IconButton>
			<IconButton
				label="Align center"
				active={style.alignment?.horizontal === "center"}
				onClick={() => setStyle("alignment.horizontal", "center")}
			>
				<AlignCenter className="size-4" />
			</IconButton>
			<IconButton
				label="Align right"
				active={style.alignment?.horizontal === "right"}
				onClick={() => setStyle("alignment.horizontal", "right")}
			>
				<AlignRight className="size-4" />
			</IconButton>

			<Separator orientation="vertical" className="mx-1 h-5" />

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
						>
							123
							<ChevronDown className="size-3" />
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					{NUMBER_FORMATS.map((format) => (
						<DropdownMenuItem
							key={format.label}
							onClick={() => setStyle("num_fmt", format.fmt)}
						>
							<span className="w-24">{format.label}</span>
							<span className="text-muted-foreground text-xs">
								{format.example}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function IconButton({
	label,
	active,
	disabled,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						disabled={disabled}
						aria-label={label}
						aria-pressed={active}
						className={
							active
								? "size-7 bg-accent text-accent-foreground"
								: "size-7 text-muted-foreground"
						}
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
	icon,
	onPick,
}: {
	label: string;
	icon: React.ReactNode;
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
						className="size-7 text-muted-foreground"
					>
						{icon}
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="w-40">
				<div className="grid grid-cols-5 gap-1 p-1">
					{SWATCHES.map((color) => (
						<button
							key={color}
							type="button"
							aria-label={`${label} ${color}`}
							className="size-6 rounded-sm border border-border"
							style={{ backgroundColor: color }}
							onClick={() => onPick(color)}
						/>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
