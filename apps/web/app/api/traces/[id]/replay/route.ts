import { NextResponse } from "next/server";

// Server-side proxy so the browser never holds the Romanica API key.
const API_URL = process.env.API_URL ?? "http://localhost:4000";
const API_KEY = process.env.ROMANICA_API_KEY ?? "rom_dev_key";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.text().catch(() => "{}");

  const res = await fetch(`${API_URL}/v1/traces/${id}/replay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
    },
    body: body || "{}",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
