import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/Sidebar.tsx";
import { Topbar } from "../components/Topbar.tsx";

export const metadata: Metadata = {
  title: "Romanica — AgentOps",
  description:
    "Observability for AI agents — trace every run, replay any failure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-7xl px-5 py-6">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
