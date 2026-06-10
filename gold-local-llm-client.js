"use strict";

const LOCAL_LLM_URL = process.env.GOLD_LOCAL_LLM_URL || "http://127.0.0.1:11434/api/generate";
const LOCAL_LLM_MODEL = process.env.GOLD_LOCAL_LLM_MODEL || "gold-ecologia";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function getLocalLlmUrl() {
  const url = new URL(LOCAL_LLM_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("GOLD_LOCAL_LLM_URL deve apontar para um runtime local.");
  }
  return url;
}

async function health() {
  try {
    const url = getLocalLlmUrl();
    const response = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return { available: false, status: "runtime_unavailable" };
    const payload = await response.json();
    const models = (payload.models || []).map((item) => item.name || item.model);
    return { available: models.some((model) => String(model).startsWith(LOCAL_LLM_MODEL)), status: "success", model: LOCAL_LLM_MODEL };
  } catch {
    return { available: false, status: "runtime_unavailable", model: LOCAL_LLM_MODEL };
  }
}

async function generate(prompt, options = {}) {
  const url = getLocalLlmUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(Number(options.timeoutMs || 60000)),
    body: JSON.stringify({
      model: LOCAL_LLM_MODEL,
      stream: false,
      prompt,
      options: {
        temperature: Number(options.temperature ?? 0.25),
        top_p: Number(options.topP ?? 0.9),
      },
    }),
  });
  if (!response.ok) throw new Error("gold_local_llm_unavailable");
  const payload = await response.json();
  return String(payload.response || "").trim();
}

module.exports = { LOCAL_LLM_MODEL, getLocalLlmUrl, health, generate };

