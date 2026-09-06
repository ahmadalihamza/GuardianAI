import type { Metadata, Viewport } from "next";

import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

import "./globals.css";

export const metadata: Metadata = {
  title: "GuardianAI — Surveillance Monitoring",
  description:
    "Intelligent emergency detection platform for computer vision surveillance: restricted-zone intrusion and fall detection with human verification.",
  applicationName: "GuardianAI",
  other: {
    "darkreader-lock": "",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f19",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="min-h-screen bg-canvas text-ink antialiased"
        suppressHydrationWarning
      >
        <Sidebar />
        <div className="lg:pl-64 flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1 px-4 py-6 sm:px-8 lg:py-8 max-w-[1600px] w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
