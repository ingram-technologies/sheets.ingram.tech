"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Type-to-confirm delete dialog for destructive actions (delete project,
 * delete organization). The user must type `confirmText` verbatim before the
 * delete button enables, so a destructive action is never one stray click
 * away. `onConfirm` returns an error string to show inline, or
 * `null`/`undefined` on success (the parent unmounts this on
 * navigation/refresh).
 */
export function DeleteConfirmDialog({
	title,
	confirmText,
	confirmLabel,
	description,
	onClose,
	onConfirm,
}: {
	title: string;
	confirmText: string;
	confirmLabel: string;
	description: React.ReactNode;
	onClose: () => void;
	onConfirm: () => Promise<string | null | undefined>;
}) {
	const [typed, setTyped] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const matches = typed.trim() === confirmText;

	async function confirm() {
		if (!matches || pending) return;
		setPending(true);
		setError(null);
		const err = await onConfirm();
		if (err) {
			setError(err);
			setPending(false);
			return;
		}
		// Success: the parent unmounts this dialog on refresh/navigation.
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription render={<div />}>
						{description}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<label
						htmlFor="delete-confirm-input"
						className="text-muted-foreground text-xs"
					>
						Type{" "}
						<span className="text-foreground font-mono font-medium">
							{confirmText}
						</span>{" "}
						to confirm.
					</label>
					<Input
						id="delete-confirm-input"
						autoFocus
						placeholder={confirmText}
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") confirm();
						}}
						autoComplete="off"
						disabled={pending}
					/>

					{error ? <p className="text-destructive text-sm">{error}</p> : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={confirm}
						disabled={!matches || pending}
					>
						{pending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Trash2 className="size-4" />
						)}
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
