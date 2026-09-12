// HTTP-Helfer für die Pipeline: Zeitlimit, Wiederholung bei 429/5xx, keine Wiederholung bei 4xx.

export const UA = "Panta-Rey-BTC-Ampel/0.2 (+https://github.com/Panta-rey/Panta-Rey-BTC-Ampel)";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(status, url, body = "") {
    super(`HTTP ${status} bei ${new URL(url).host}${body ? ": " + body.slice(0, 160) : ""}`);
    this.status = status;
    this.retry = status === 429 || status >= 500;
  }
}

export async function get(url, { headers = {}, text = false, retries = 2, timeout = 30_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
      return text ? await res.text() : await res.json();
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && !e.retry) break;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}
