import { getPi5Config } from "./config";

export async function checkPi5Health(): Promise<{ok: boolean; latency?: number}> {
  const { pi5TailnetIp, httpPort } = getPi5Config();
  const t0 = Date.now();
  try {
    const r = await fetch(`http://${pi5TailnetIp}:${httpPort}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { ok: r.ok, latency: Date.now() - t0 };
  } catch {
    return { ok: false };
  }
}