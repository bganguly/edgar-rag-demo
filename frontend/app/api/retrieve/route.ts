export async function POST(req: Request) {
  const body = await req.json();
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8002";
  try {
    const res = await fetch(`${backendUrl}/api/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ chunks: [], error: "Backend unavailable" }, { status: 503 });
  }
}
