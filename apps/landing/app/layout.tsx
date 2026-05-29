import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Romanica",
  description: "Imagine a space between vision & impact. That's where we thrive.",
  metadataBase: new URL("https://romanica.dev"),
  openGraph: {
    title: "Romanica",
    description: "Imagine a space between vision & impact. That's where we thrive.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
