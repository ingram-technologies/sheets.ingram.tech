import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { getUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
	"A spreadsheet where the agent works in the grid itself. Its tools run in your browser, against the document you're editing, so you watch it work instead of reading a transcript.";

export const metadata: Metadata = {
	title: "A spreadsheet the agent operates directly",
	description: DESCRIPTION,
	openGraph: {
		title: "Ingram Sheets — a spreadsheet the agent operates directly",
		description: DESCRIPTION,
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Ingram Sheets — a spreadsheet the agent operates directly",
		description: DESCRIPTION,
	},
};

export default async function HomePage() {
	// Public page: use getUser (never requireUser — this must not redirect) so the
	// CTA can adapt to whether the visitor is already signed in.
	const user = await getUser();
	return <Landing signedIn={user !== null} />;
}
