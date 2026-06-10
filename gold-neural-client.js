"use strict";

const BASE_URL = process.env.GOLD_NEURAL_URL || "http://127.0.0.1:8791";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function localUrl(pathname, query = {}) {
  const url = new URL(pathname, BASE_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error("GOLD_NEURAL_URL deve apontar para localhost.");
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

async function health() {
  try {
    const response = await fetch(localUrl("/health"), { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { available: false, status: "neural_runtime_unavailable" };
    return { ...(await response.json()), status: "success" };
  } catch {
    return { available: false, status: "neural_runtime_unavailable" };
  }
}

async function search(query, options = {}) {
  const response = await fetch(localUrl("/search", {
    q: String(query || "").slice(0, 500),
    limit: Math.min(Math.max(Number(options.limit || 4), 1), 8),
  }), { signal: AbortSignal.timeout(Number(options.timeoutMs || 10000)) });
  if (!response.ok) throw new Error("gold_neural_search_failed");
  return response.json();
}

module.exports = { BASE_URL, localUrl, health, search };

