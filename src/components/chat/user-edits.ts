import type { CellChange } from "../workbook/controller";

/**
 * The user-delta echo: the log of cells the *user* changed by hand, kept by
 * the chat panel. It serves two consumers —
 *
 * - the transcript, which shows each burst of edits as a passive chip
 *   anchored after the message it followed (visible history, never a turn);
 * - the next chat request, which attaches the accumulated pending edits as a
 *   <user_edits_since_last_turn> block, giving the agent the same
 *   act→observe symmetry for the user's hand that the delta echo gives it
 *   for its own.
 *
 * Edits merge per cell: the first-seen old value is kept, the latest new
 * value wins, and a cell edited back to its original value drops out (a
 * net no-op is not an edit).
 */

export interface UserEdit {
	sheet: string;
	cell: string;
	old: string;
	new: string;
}

/** One contiguous run of user edits, anchored after a chat message. */
export interface UserEditBurst {
	id: number;
	/** Message id this burst happened after; null = before any message. */
	afterMessageId: string | null;
	edits: UserEdit[];
}

const CELL_CAP = 200;
const ATTACHMENT_LINE_CAP = 40;
const CHIP_EDIT_CAP = 3;
const VALUE_DISPLAY_CAP = 20;

export class UserEditLog {
	private pending = new Map<string, UserEdit>();
	private pendingOverflow = 0;
	private bursts: UserEditBurst[] = [];
	private seq = 0;
	private listeners = new Set<() => void>();

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	/** Stable snapshot for useSyncExternalStore; a new array per change. */
	getBursts = (): UserEditBurst[] => this.bursts;

	record(
		changes: CellChange[],
		sheetNameOf: (index: number) => string,
		afterMessageId: string | null,
	): void {
		if (changes.length === 0) return;
		this.mergeInto(this.pending, changes, sheetNameOf, () => {
			this.pendingOverflow += 1;
		});

		// Mirror into the display log: extend the live burst when the anchor
		// hasn't moved, otherwise start a new one.
		const last = this.bursts[this.bursts.length - 1];
		const target = last && last.afterMessageId === afterMessageId ? last : null;
		const burstEdits = new Map<string, UserEdit>();
		if (target) {
			for (const edit of target.edits) {
				burstEdits.set(`${edit.sheet}!${edit.cell}`, edit);
			}
		}
		this.mergeInto(burstEdits, changes, sheetNameOf, () => undefined);
		const edits = [...burstEdits.values()];
		if (target) {
			this.bursts =
				edits.length === 0
					? this.bursts.slice(0, -1)
					: [...this.bursts.slice(0, -1), { ...target, edits }];
		} else if (edits.length > 0) {
			this.seq += 1;
			this.bursts = [...this.bursts, { id: this.seq, afterMessageId, edits }];
		} else {
			return;
		}
		for (const listener of this.listeners) listener();
	}

	/**
	 * Render the pending edits for the outgoing request and clear them —
	 * they're consumed by the turn. Undefined when the user changed nothing.
	 */
	takePendingText(): string | undefined {
		if (this.pending.size === 0 && this.pendingOverflow === 0) return undefined;
		const edits = [...this.pending.values()];
		const lines = edits
			.slice(0, ATTACHMENT_LINE_CAP)
			.map(
				(edit) =>
					`${edit.sheet}!${edit.cell}: ${display(edit.old)} ⇒ ${display(edit.new)}`,
			);
		const extra =
			Math.max(0, edits.length - ATTACHMENT_LINE_CAP) + this.pendingOverflow;
		if (extra > 0) lines.push(`… and ${extra} more cell(s)`);
		this.pending.clear();
		this.pendingOverflow = 0;
		return lines.join("\n");
	}

	private mergeInto(
		map: Map<string, UserEdit>,
		changes: CellChange[],
		sheetNameOf: (index: number) => string,
		onOverflow: () => void,
	): void {
		for (const change of changes) {
			const sheet = sheetNameOf(change.sheet);
			const key = `${sheet}!${change.cell}`;
			const existing = map.get(key);
			if (!existing && map.size >= CELL_CAP) {
				onOverflow();
				continue;
			}
			const old = existing ? existing.old : change.old;
			if (old === change.new) map.delete(key);
			else map.set(key, { sheet, cell: change.cell, old, new: change.new });
		}
	}
}

/** Compact transcript line: "You edited C3 29 ⇒ 35 · D5 … · 2 more". */
export function burstChipText(burst: UserEditBurst, multiSheet: boolean): string {
	const parts = burst.edits
		.slice(0, CHIP_EDIT_CAP)
		.map(
			(edit) =>
				`${multiSheet ? `${edit.sheet}!` : ""}${edit.cell} ${display(edit.old)} ⇒ ${display(edit.new)}`,
		);
	const extra = burst.edits.length - CHIP_EDIT_CAP;
	if (extra > 0) parts.push(`${extra} more`);
	return `You edited ${parts.join(" · ")}`;
}

function display(value: string): string {
	const text = value === "" ? "(empty)" : value;
	return text.length > VALUE_DISPLAY_CAP
		? `${text.slice(0, VALUE_DISPLAY_CAP - 1)}…`
		: text;
}
