import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Romanica — Infrastructure for autonomous AI agents",
  description:
    "AWS + Kubernetes + Datadog + Temporal for autonomous AI systems. Trace every agent run, replay any failure, see what it cost.",
  metadataBase: new URL("https://romanica.dev"),
  openGraph: {
    title: "Romanica — Infrastructure for autonomous AI agents",
    description:
      "Trace every agent run, replay any failure, see what it cost. The operations layer for long-running cognitive workers.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
