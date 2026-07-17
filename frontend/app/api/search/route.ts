export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8002";
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${backendUrl}/api/search?${qs}`, { signal: AbortSignal.timeout(20000) });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ filings: [], error: "Backend unavailable" }, { status: 503 });
  }
}
