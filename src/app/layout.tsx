import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Toaster, cn } from "@binding/ui";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Binding",
  description:
    "Privacy-first hiring for APAC — match on skills and fit before identities are revealed.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
