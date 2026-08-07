import type { Metadata } from "next";
import "./globals.css";
import { Geist, Newsreader } from "next/font/google";
import { Toaster, cn } from "@binding/ui";

// Self-hosted at build time by next/font (no runtime CDN — protects
// e2e/no-third-party). Exposed as the CSS vars the kit theme consumes.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: "Binding",
  description:
    "Privacy-first hiring for APAC — match on skills and fit before identities are revealed.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, newsreader.variable)}>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
