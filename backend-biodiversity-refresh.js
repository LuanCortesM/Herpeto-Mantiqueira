const store = require("./backend-biodiversity-store.js");
const municipalityConfig = require("./municipalities.js");
const speciesLinkClient = require("./specieslink-api-client.js");
const iucnClient = require("./iucn-api-client.js");

const INATURALIST_BASE_URL = "https://api.inaturalist.org/v1/observations/species_counts";
const DEFAULT_INATURALIST_OPTIONS = { verifiable: true, perPage: 500 };
const municipalities = municipalityConfig.getUniqueMunicipalities();

function inaturalistKey(municipalityId) {
  return store.snapshotKey([municipalityId, "herpetofauna", "verifiable"]);
}

function speciesLinkKey(municipalityId, taxonClass) {
  return store.snapshotKey([municipalityId, taxonClass]);
}

function iucnKey(scientificName) {
  return String(scientificName || "").trim().toLowerCase();
}

function isIucnCandidateName(scientificName) {
  const name = String(scientificName || "").trim();
  if (!/^[A-Z][a-z-]+\s+[a-z-]+/.test(name)) return false;
  if (/\b(sp|spp|cf|aff|indet)\.?(\s|$)/i.test(name)) return false;
  if (/[()/?]/.test(name)) return false;
  return true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectScientificNamesFromCache(limit = 250) {
  const database = store.readDatabase();
  const names = new Set();
  Object.values(database.sources?.inaturalist?.snapshots || {}).forEach((snapshot) => {
    (snapshot.payload?.results || []).forEach((item) => {
      const name = item?.taxon?.name;
      if (isIucnCandidateName(name)) names.add(name);
    });
  });
  Object.values(database.sources?.specieslink?.snapshots || {}).forEach((snapshot) => {
    (snapshot.payload?.records || []).forEach((record) => {
      const name = record?.scientificName;
      if (isIucnCandidateName(name)) names.add(name);
    });
  });
  return [...names].slice(0, limit);
}

function buildINaturalistUrl(placeId, options = DEFAULT_INATURALIST_OPTIONS) {
  const params = new URLSearchParams();
  params.set("place_id", String(placeId));
  params.append("iconic_taxa[]", "Amphibia");
  params.append("iconic_taxa[]", "Reptilia");
  params.set("per_page", String(options.perPage || 500));
  if (options.verifiable === true) params.set("verifiable", "true");
  return `${INATURALIST_BASE_URL}?${params.toString()}`;
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshINaturalistMunicipality(municipality, options = {}) {
  const key = inaturalistKey(municipality.id);
  const current = store.getSnapshot("inaturalist", key);
  if (!options.force && !store.isStale(current)) return { source: "inaturalist", key, status: "fresh" };
  try {
    const payload = await fetchJson(buildINaturalistUrl(municipality.placeId));
    if (!Array.isArray(payload?.results)) throw new Error("Resposta iNaturalist sem resultados reconhecidos.");
    store.setSnapshot("inaturalist", key, { municipalityId: municipality.id, payload });
    return { source: "inaturalist", key, status: "updated", records: payload.results.length };
  } catch (error) {
    store.recordAttempt("inaturalist", { status: "unavailable", key, message: error.message });
    return { source: "inaturalist", key, status: "unavailable", message: error.message };
  }
}

async function refreshSpeciesLinkMunicipalityClass(municipality, taxonClass, options = {}) {
  const key = speciesLinkKey(municipality.id, taxonClass);
  const current = store.getSnapshot("specieslink", key);
  if (!options.force && !store.isStale(current)) return { source: "specieslink", key, status: "fresh" };
  try {
    const payload = await speciesLinkClient.fetchSpeciesLinkByMunicipalityAndClass(municipality, taxonClass);
    store.setSnapshot("specieslink", key, { municipalityId: municipality.id, taxonClass, payload });
    return { source: "specieslink", key, status: "updated", records: payload.records.length };
  } catch (error) {
    store.recordAttempt("specieslink", { status: error.status || "unavailable", key, message: error.message });
    return { source: "specieslink", key, status: error.status || "unavailable", message: error.message };
  }
}

async function getOrRefreshIucnTaxon(scientificName, options = {}) {
  const key = iucnKey(scientificName);
  const current = store.getSnapshot("iucn", key);
  if (!options.force && current && !store.isStale(current)) return { ...current.payload, cache: "hit" };
  try {
    const payload = await iucnClient.fetchTaxonByScientificName(scientificName, options);
    store.setSnapshot("iucn", key, { scientificName, payload });
    return { ...payload, cache: "miss" };
  } catch (error) {
    store.recordAttempt("iucn", { status: error.status || "unavailable", key, message: error.message });
    if (current?.payload) return { ...current.payload, cache: "stale", warning: error.status || "unavailable" };
    throw error;
  }
}

async function refreshIucnFromCache(options = {}) {
  const names = collectScientificNamesFromCache(options.limit || 250);
  if (!process.env.IUCN_API_KEY) {
    store.recordAttempt("iucn", {
      status: "skipped_missing_api_key",
      message: "IUCN_API_KEY ausente; enriquecimento IUCN pulado.",
      candidateNames: names.length,
    });
    return { source: "iucn", status: "skipped_missing_api_key", candidateNames: names.length, results: [] };
  }
  const results = [];
  const delayMs = Number(options.delayMs ?? 350);
  for (const name of names) {
    try {
      const payload = await getOrRefreshIucnTaxon(name, options);
      results.push({ source: "iucn", key: iucnKey(name), status: payload.cache === "hit" ? "fresh" : "updated" });
    } catch (error) {
      results.push({ source: "iucn", key: iucnKey(name), status: error.status || "unavailable", httpStatus: error.httpStatus || null, message: error.message });
      if (error.httpStatus === 429) {
        store.recordAttempt("iucn", {
          status: "rate_limited",
          key: iucnKey(name),
          message: "IUCN rate limit atingido; refresh interrompido para preservar a API.",
          completed: results.length,
          remaining: names.length - results.length,
        });
        break;
      }
    }
    if (delayMs > 0) await wait(delayMs);
  }
  return { source: "iucn", status: "completed", candidateNames: names.length, results };
}

async function refreshAll(options = {}) {
  const results = [];
  for (const municipality of municipalities) {
    results.push(await refreshINaturalistMunicipality(municipality, options));
    for (const taxonClass of ["Amphibia", "Reptilia"]) {
      results.push(await refreshSpeciesLinkMunicipalityClass(municipality, taxonClass, options));
    }
  }
  if (options.includeIucn !== false) {
    const iucn = await refreshIucnFromCache(options);
    results.push(iucn);
  }
  return {
    success: true,
    completedAt: new Date().toISOString(),
    results,
    summary: store.summary(),
  };
}

module.exports = {
  INATURALIST_BASE_URL,
  DEFAULT_INATURALIST_OPTIONS,
  inaturalistKey,
  speciesLinkKey,
  iucnKey,
  isIucnCandidateName,
  buildINaturalistUrl,
  refreshINaturalistMunicipality,
  refreshSpeciesLinkMunicipalityClass,
  getOrRefreshIucnTaxon,
  collectScientificNamesFromCache,
  refreshIucnFromCache,
  refreshAll,
};

if (require.main === module) {
  refreshAll({ force: process.argv.includes("--force") })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
