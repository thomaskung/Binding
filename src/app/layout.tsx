import type { Metadata } from "next";
import "./globals.css";
import { Geist, Newsreader } from "next/font/google";
import { Toaster, cn } from "@jumponboard/ui";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const newsreader = Newsreader({subsets:['latin'],weight:['400','500','600'],variable:'--font-serif'});

export const metadata: Metadata = {
  title: "JumpOnBoard",
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
