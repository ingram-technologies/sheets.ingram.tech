import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Inter is the brand family, loaded exactly as ingram.tech loads it so the
// surfaces resolve to the same face. `variable` feeds --font-inter, which
// globals.css maps onto Tailwind's --font-sans (and onto --sheet-font, so the
// canvas renderer draws cells in Inter too).
const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

export const metadata: Metadata = {
	title: { default: "Ingram Sheets", template: "%s · Ingram Sheets" },
	description: "AI-native spreadsheets",
};

export const viewport: Viewport = {
	// Charcoal base — stops mobile browser chrome flashing white against a
	// dark-first surface.
	themeColor: "#1c1c1c",
	colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body
				className={`${inter.variable} bg-background font-sans text-foreground antialiased`}
			>
				<TooltipProvider delay={400}>{children}</TooltipProvider>
				<Toaster />
			</body>
		</html>
	);
}
