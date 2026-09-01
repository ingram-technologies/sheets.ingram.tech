import type { Metadata } from "next";

import { Workbook } from "@/components/workbook/Workbook";

export const metadata: Metadata = {
	title: "Scratch sheet",
	description:
		"A spreadsheet with no account behind it. The engine runs in your browser and publishes its tools to whichever agent is driving it.",
};

/**
 * The signed-out workbook.
 *
 * Everything that makes this app worth showing — the wasm engine, the tool
 * surface, the recalculation delta, the presence overlay — runs with no server
 * at all. An account only ever bought persistence. So this page hands the whole
 * thing to someone who has not signed in, keeps their sheet in their own
 * browser, and lets their own agent drive it.
 */
export default function ScratchPage() {
	return <Workbook id={null} name="Scratch sheet" googleSpreadsheetId={null} />;
}
