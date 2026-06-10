const http = require("http");
const fs = require("fs");
const path = require("path");

function loadLocalBackendEnvironment() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) return;
      const name = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (name && value && !process.env[name]) process.env[name] = value;
    });
}

loadLocalBackendEnvironment();

const municipalityConfig = require("./municipalities.js");
const apiClient = require("./specieslink-api-client.js");
const pdfKnowledge = require("./knowledge-pdf-index.js");
const localLlm = require("./gold-local-llm-client.js");
const neuralKnowledge = require("./gold-neural-client.js");
const biodiversityStore = require("./backend-biodiversity-store.js");
const biodiversityRefresh = require("./backend-biodiversity-refresh.js");
const goldNextLevelRag = require("./gold-next-level-rag.js");
const chatBrain = require("./herpeto-chat-brain.js");
const adminAuth = require("./admin-auth.js");
const siteContentStore = require("./site-content-store.js");

const PORT = Number(process.env.PORT || process.env.SPECIESLINK_PROXY_PORT || 8787);
const ROOT = __dirname;
const SEARCH_CACHE_TTL_MS = Number(process.env.SPECIESLINK_CACHE_TTL_MS || 1000 * 60 * 60 * 6);
const SEARCH_RATE_LIMIT_PER_MINUTE = Number(process.env.SPECIESLINK_RATE_LIMIT_PER_MINUTE || 120);
const ALLOWED_ORIGIN = process.env.HERPETO_ALLOWED_ORIGIN || "";
const searchCache = new Map();
const requestWindows = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
};

const ALLOWED_CLASSES = new Set(["Amphibia", "Reptilia"]);
const ALLOWED_COORDINATES = new Set([
  "yes", "no", "automatic", "original", "suspect", "consistent", "absent", "blocked",
]);
const ALLOWED_BASIS_OF_RECORD = new Set(["PreservedSpecimen", "HumanObservation"]);
const ALLOWED_TEXT_FILTERS = ["scientificName", "genus", "family", "order", "scope"];
const PRIVATE_FILE_PATTERNS = [
  /^\/\./,
  /specieslink-api-client\.js$/i,
  /specieslink-proxy\.js$/i,
  /admin-auth\.js$/i,
  /site-content-store\.js$/i,
  /knowledge-pdf-index\.js$/i,
  /gold-local-llm-client\.js$/i,
  /gold-neural-client\.js$/i,
  /backend-biodiversity-/i,
  /iucn-api-client\.js$/i,
  /backend-data\//i,
  /content\//i,
  /deploy\//i,
  /logs\//i,
  /IAAprendaAqui\/gold_neural_index\//i,
  /IAAprendaAqui\/herpetology_pdf_/i,
  /IAAprendaAqui\/pdf_chunk_cache\//i,
  /IAAprendaAqui\/gold_local_instruction_corpus\.jsonl$/i,
  /start-herpeto\.ps1$/i,
  /\.test\.js$/i,
];

function sendJson(response, status, payload, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extraHeaders,
  };
  if (ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function readJsonBody(request, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("request_too_large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function errorPayload(error) {
  return {
    success: false,
    status: error.status || apiClient.SpeciesLinkStatus.UNAVAILABLE,
    reason: error.status || apiClient.SpeciesLinkStatus.UNAVAILABLE,
    userMessage: error.userMessage || "O speciesLink não respondeu corretamente neste momento.",
  };
}

function statusCodeFor(error) {
  if (error.status === apiClient.SpeciesLinkStatus.MISSING_API_KEY) return 503;
  if (error.status === apiClient.SpeciesLinkStatus.INVALID_API_KEY) return 502;
  if (error.status === apiClient.SpeciesLinkStatus.TIMEOUT) return 504;
  return 502;
}

function getMunicipalityById(id) {
  return municipalityConfig.MUNICIPALITIES.find((municipality) => municipality.id === id) || null;
}

function stableSearchCacheKey(municipality, options) {
  return JSON.stringify({
    municipalityId: municipality.id,
    ...Object.keys(options || {}).sort().reduce((sorted, key) => {
      sorted[key] = options[key];
      return sorted;
    }, {}),
  });
}

function clearSearchCache() {
  searchCache.clear();
}

function allowSearchRequest(request) {
  const now = Date.now();
  const key = request.socket.remoteAddress || "unknown";
  const active = (requestWindows.get(key) || []).filter((timestamp) => now - timestamp < 60000);
  if (active.length >= SEARCH_RATE_LIMIT_PER_MINUTE) {
    requestWindows.set(key, active);
    return false;
  }
  active.push(now);
  requestWindows.set(key, active);
  return true;
}

function parseSafeSearchOptions(url) {
  const params = url.searchParams;
  const municipality = getMunicipalityById(params.get("municipalityId"));
  if (!municipality) throw new Error("municipalityId inválido.");
  const taxonClass = params.get("taxonClass");
  if (!ALLOWED_CLASSES.has(taxonClass)) throw new Error("taxonClass inválido.");

  const options = {
    taxonClass,
    limit: Math.min(Math.max(Number(params.get("limit") ?? 500), 0), 500),
    offset: Math.max(Number(params.get("offset") ?? 0), 0),
  };
  const coordinates = params.get("coordinates");
  if (coordinates) {
    if (!ALLOWED_COORDINATES.has(coordinates)) throw new Error("coordinates inválido.");
    options.coordinates = coordinates;
  }
  const basisOfRecord = params.get("basisOfRecord");
  if (basisOfRecord) {
    if (!ALLOWED_BASIS_OF_RECORD.has(basisOfRecord)) throw new Error("basisOfRecord inválido.");
    options.basisOfRecord = basisOfRecord;
  }
  ALLOWED_TEXT_FILTERS.forEach((key) => {
    const value = params.get(key);
    if (value) options[key] = value.slice(0, 160);
  });
  return { municipality, options };
}

function serveStatic(request, response, url) {
  const requested = url.pathname === "/"
    ? "/index.html"
    : url.pathname === "/admin"
      ? "/admin.html"
      : decodeURIComponent(url.pathname);
  if (PRIVATE_FILE_PATTERNS.some((pattern) => pattern.test(requested))) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const sendFile = (resolvedPath, headers = {}) => {
    fs.readFile(resolvedPath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      const extension = path.extname(filePath).toLowerCase();
      const cacheControl = [".html", ".js", ".css"].includes(extension)
        ? "no-store"
        : "public, max-age=86400";
      response.writeHead(200, { "Content-Type": type, "Cache-Control": cacheControl, ...headers });
      response.end(data);
    });
  };
  fs.access(filePath, fs.constants.R_OK, (error) => {
    if (error) {
      const gzPath = `${filePath}.gz`;
      if (path.extname(filePath).toLowerCase() === ".json" && fs.existsSync(gzPath)) {
        sendFile(gzPath, { "Content-Encoding": "gzip" });
        return;
      }
      sendFile(filePath);
      return;
    }
    sendFile(filePath);
  });
}

async function handleHealth(response) {
  const diagnosis = await apiClient.diagnoseSpeciesLink();
  sendJson(response, diagnosis.connectionTest.success ? 200 : 503, diagnosis);
}

async function handleSearch(request, response, url) {
  try {
    if (!allowSearchRequest(request)) {
      sendJson(response, 429, {
        success: false,
        status: "rate_limited",
        reason: "rate_limited",
        userMessage: "Muitas consultas foram enviadas em pouco tempo. Aguarde um instante e tente novamente.",
      });
      return;
    }
    const { municipality, options } = parseSafeSearchOptions(url);
    const hasSpecificFilters = Object.keys(options).some((key) => !["taxonClass", "limit", "offset"].includes(key));
    const cacheKey = stableSearchCacheKey(municipality, options);
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
      sendJson(response, 200, { ...cached.result, cache: "hit" });
      return;
    }
    const localSnapshot = biodiversityStore.getSnapshot(
      "specieslink",
      biodiversityRefresh.speciesLinkKey(municipality.id, options.taxonClass)
    );
    if (!hasSpecificFilters && options.offset === 0 && localSnapshot?.payload) {
      sendJson(response, 200, { ...localSnapshot.payload, cache: "weekly_local" });
      return;
    }
    apiClient.getSpeciesLinkApiKey();
    const result = await apiClient.fetchSpeciesLinkByMunicipalityAndClass(municipality, options.taxonClass, options);
    if (!hasSpecificFilters && options.offset === 0) {
      biodiversityStore.setSnapshot("specieslink", biodiversityRefresh.speciesLinkKey(municipality.id, options.taxonClass), {
        municipalityId: municipality.id,
        taxonClass: options.taxonClass,
        payload: result,
      });
    }
    searchCache.set(cacheKey, { timestamp: Date.now(), result });
    sendJson(response, 200, { ...result, cache: "miss" });
  } catch (error) {
    if (!error.status) {
      sendJson(response, 400, { success: false, status: "invalid_request", reason: "invalid_request", userMessage: error.message });
      return;
    }
    console.error("Falha classificada no proxy speciesLink:", error.status);
    sendJson(response, statusCodeFor(error), errorPayload(error));
  }
}

async function handleINaturalistSpeciesCounts(response, url) {
  const municipality = getMunicipalityById(url.searchParams.get("municipalityId"));
  if (!municipality) {
    sendJson(response, 400, { success: false, status: "invalid_request", userMessage: "municipalityId invalido." });
    return;
  }
  const key = biodiversityRefresh.inaturalistKey(municipality.id);
  const cached = biodiversityStore.getSnapshot("inaturalist", key);
  if (cached?.payload) {
    sendJson(response, 200, { ...cached.payload, cache: "weekly_local" });
    return;
  }
  const result = await biodiversityRefresh.refreshINaturalistMunicipality(municipality, { force: true });
  const refreshed = biodiversityStore.getSnapshot("inaturalist", key);
  if (result.status === "updated" && refreshed?.payload) {
    sendJson(response, 200, { ...refreshed.payload, cache: "miss" });
    return;
  }
  sendJson(response, 502, {
    success: false,
    status: "unavailable",
    userMessage: "O iNaturalist nao respondeu e ainda nao existe uma copia local para este municipio.",
  });
}

async function handleIucnTaxon(response, url) {
  const scientificName = String(url.searchParams.get("scientificName") || "").slice(0, 180).trim();
  if (!scientificName) {
    sendJson(response, 400, { success: false, status: "invalid_request", userMessage: "Informe o nome cientifico." });
    return;
  }
  try {
    sendJson(response, 200, await biodiversityRefresh.getOrRefreshIucnTaxon(scientificName));
  } catch (error) {
    sendJson(response, error.status === "missing_api_key" ? 503 : 502, {
      success: false,
      status: error.status || "unavailable",
      userMessage: error.message,
    });
  }
}

async function handlePdfKnowledgeSearch(response, url) {
  const query = String(url.searchParams.get("q") || "").slice(0, 500);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 4), 1), 8);
  if (!query.trim()) {
    sendJson(response, 400, { success: false, status: "invalid_request", userMessage: "Informe uma pergunta para consultar a biblioteca local." });
    return;
  }
  sendJson(response, 200, {
    success: true,
    source: "biblioteca científica local",
    results: await pdfKnowledge.searchPdfKnowledge(query, { limit }),
  });
}

async function handleNeuralKnowledgeSearch(response, url) {
  const query = String(url.searchParams.get("q") || "").slice(0, 500);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 4), 1), 8);
  if (!query.trim()) {
    sendJson(response, 400, { success: false, status: "invalid_request", userMessage: "Informe uma pergunta para consultar a rede neural local." });
    return;
  }
  try {
    sendJson(response, 200, await neuralKnowledge.search(query, { limit }));
  } catch {
    sendJson(response, 200, {
      success: true,
      source: "biblioteca científica local",
      neuralFallback: true,
      results: await pdfKnowledge.searchPdfKnowledge(query, { limit }),
    });
  }
}

async function handleGoldChat(request, response) {
  try {
    const payload = await readJsonBody(request);
    const question = String(payload.question || "").slice(0, 1000).trim();
    if (!question) {
      sendJson(response, 400, { success: false, status: "invalid_request", userMessage: "Informe uma pergunta." });
      return;
    }
    const result = await goldNextLevelRag.answer(question);
    if (!result.handled || !result.answer) {
      const legacyAnswer = await chatBrain.receiveUserQuestion(question);
      sendJson(response, 200, {
        success: true,
        feature: "GOLD_NEXT_LEVEL_RAG",
        enabled: goldNextLevelRag.isEnabled(),
        ...result,
        handled: true,
        answer: legacyAnswer,
        legacyFallbackUsed: true,
      });
      return;
    }
    sendJson(response, 200, {
      success: true,
      feature: "GOLD_NEXT_LEVEL_RAG",
      enabled: goldNextLevelRag.isEnabled(),
      ...result,
    });
  } catch (error) {
    sendJson(response, 400, { success: false, status: "invalid_request", userMessage: error.message });
  }
}

function requireAdmin(request, response) {
  const session = adminAuth.getSession(request);
  if (!session) {
    sendJson(response, 401, {
      success: false,
      authenticated: false,
      userMessage: "Sessao admin ausente ou expirada.",
    });
    return null;
  }
  return session;
}

async function handleAdminLogin(request, response) {
  try {
    const payload = await readJsonBody(request, 8 * 1024);
    if (!adminAuth.authenticate(payload.email, payload.password)) {
      sendJson(response, 401, {
        success: false,
        authenticated: false,
        userMessage: "Email ou senha invalidos.",
      });
      return;
    }
    const token = adminAuth.createSession(String(payload.email || "").trim().toLowerCase());
    sendJson(response, 200, {
      success: true,
      authenticated: true,
      userMessage: "Login realizado.",
    }, {
      "Set-Cookie": adminAuth.sessionCookie(token),
    });
  } catch (error) {
    sendJson(response, 400, { success: false, userMessage: error.message });
  }
}

async function handleAdminLogout(request, response) {
  adminAuth.destroySession(request);
  sendJson(response, 200, {
    success: true,
    authenticated: false,
    userMessage: "Sessao encerrada.",
  }, {
    "Set-Cookie": adminAuth.expiredSessionCookie(),
  });
}

function handleAdminSession(request, response) {
  const session = adminAuth.getSession(request);
  sendJson(response, 200, {
    success: true,
    authenticated: Boolean(session),
    email: session?.email || null,
  });
}

function handleAdminContentGet(request, response) {
  const session = requireAdmin(request, response);
  if (!session) return;
  sendJson(response, 200, {
    success: true,
    content: siteContentStore.readContent(),
  });
}

async function handleAdminContentPut(request, response) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const payload = await readJsonBody(request, 1024 * 1024);
    const saved = siteContentStore.writeContent(payload.content, {
      updatedBy: session.email,
      backup: true,
    });
    sendJson(response, 200, {
      success: true,
      content: saved.content,
      backupCreated: Boolean(saved.backupPath),
    });
  } catch (error) {
    sendJson(response, 400, {
      success: false,
      userMessage: error.message,
    });
  }
}

function handlePublicSiteContent(response) {
  sendJson(response, 200, {
    success: true,
    content: siteContentStore.publicContent(),
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/site-content/public") {
    handlePublicSiteContent(response);
    return;
  }
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    await handleAdminLogin(request, response);
    return;
  }
  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    await handleAdminLogout(request, response);
    return;
  }
  if (url.pathname === "/api/admin/session") {
    handleAdminSession(request, response);
    return;
  }
  if (url.pathname === "/api/admin/content" && request.method === "GET") {
    handleAdminContentGet(request, response);
    return;
  }
  if (url.pathname === "/api/admin/content" && request.method === "PUT") {
    await handleAdminContentPut(request, response);
    return;
  }
  if (url.pathname === "/api/specieslink/health") {
    await handleHealth(response);
    return;
  }
  if (url.pathname === "/api/specieslink/search") {
    await handleSearch(request, response, url);
    return;
  }
  if (url.pathname === "/api/inaturalist/species-counts") {
    await handleINaturalistSpeciesCounts(response, url);
    return;
  }
  if (url.pathname === "/api/iucn/taxon") {
    await handleIucnTaxon(response, url);
    return;
  }
  if (url.pathname === "/api/biodiversity/local/health") {
    sendJson(response, 200, biodiversityStore.summary());
    return;
  }
  if (url.pathname === "/api/knowledge/pdfs/health") {
    sendJson(response, 200, pdfKnowledge.catalogSummary());
    return;
  }
  if (url.pathname === "/api/knowledge/pdfs/search") {
    await handlePdfKnowledgeSearch(response, url);
    return;
  }
  if (url.pathname === "/api/gold/llm/health") {
    sendJson(response, 200, await localLlm.health());
    return;
  }
  if (url.pathname === "/api/gold/neural/health") {
    sendJson(response, 200, await neuralKnowledge.health());
    return;
  }
  if (url.pathname === "/api/gold/neural/search") {
    await handleNeuralKnowledgeSearch(response, url);
    return;
  }
  if (url.pathname === "/api/gold/chat" && request.method === "POST") {
    await handleGoldChat(request, response);
    return;
  }
  serveStatic(request, response, url);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Herpeto Mantiqueira aberto em http://localhost:${PORT}`);
    console.log(process.env.SPECIESLINK_API_KEY
      ? "speciesLink: chave configurada no backend."
      : "speciesLink: chave ainda não configurada no backend.");
    console.log(process.env.IUCN_API_KEY
      ? "IUCN: chave configurada no backend."
      : "IUCN: chave ainda nao configurada no backend.");
    biodiversityRefresh.refreshAll().catch((error) => {
      console.warn("Atualizacao semanal de biodiversidade indisponivel:", error.message);
    });
  });
  const weeklyCheckInterval = setInterval(() => {
    biodiversityRefresh.refreshAll().catch((error) => {
      console.warn("Atualizacao semanal de biodiversidade indisponivel:", error.message);
    });
  }, biodiversityStore.DEFAULT_REFRESH_INTERVAL_MS);
  weeklyCheckInterval.unref();
}

module.exports = {
  server,
  parseSafeSearchOptions,
  getMunicipalityById,
  errorPayload,
  statusCodeFor,
  SEARCH_CACHE_TTL_MS,
  searchCache,
  stableSearchCacheKey,
  clearSearchCache,
  SEARCH_RATE_LIMIT_PER_MINUTE,
  ALLOWED_ORIGIN,
  requestWindows,
  allowSearchRequest,
  handleINaturalistSpeciesCounts,
  handleIucnTaxon,
  handleGoldChat,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSession,
  handleAdminContentGet,
  handleAdminContentPut,
  readJsonBody,
};
