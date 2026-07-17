export async function GET() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8002";
  try {
    const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
