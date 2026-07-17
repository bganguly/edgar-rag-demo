export async function DELETE() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8002";
  try {
    const res = await fetch(`${backendUrl}/api/reset`, { method: "DELETE", signal: AbortSignal.timeout(10000) });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ detail: "Backend unavailable" }, { status: 503 });
  }
}
