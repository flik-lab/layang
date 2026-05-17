import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Layang",
  description:
    "Open-source, local-first API workbench starting with gRPC/proto testing, docs, examples, benchmarks, and workspace folders.",
  icons: {
    icon: "./layang-logo.png",
    apple: "./layang-logo.png",
  },
};

/**
 * Renders the application HTML shell and shared metadata.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
