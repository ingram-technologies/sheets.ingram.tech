"use client";

import { useEffect, useState } from "react";

/**
 * "⌘" on Apple platforms, "Ctrl" everywhere else.
 *
 * Resolved in an effect rather than during render: the server has no
 * `navigator`, so reading it inline would emit "Ctrl" on the server and "⌘" on
 * a Mac client, and React would flag the mismatch. Starting from "Ctrl" and
 * correcting after mount keeps the markup identical on both sides.
 */
export function useModKeyLabel(): string {
	const [label, setLabel] = useState("Ctrl");

	useEffect(() => {
		// userAgent, not the deprecated navigator.platform.
		if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) setLabel("⌘");
	}, []);

	return label;
}
