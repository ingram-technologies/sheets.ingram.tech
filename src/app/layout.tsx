import type { Metadata } from "next";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
	title: { default: "Ingram Sheets", template: "%s · Ingram Sheets" },
	description: "AI-native spreadsheets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="bg-background text-foreground antialiased">
				<TooltipProvider delay={400}>{children}</TooltipProvider>
				<Toaster />
			</body>
		</html>
	);
}
