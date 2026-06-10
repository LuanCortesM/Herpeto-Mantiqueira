const IUCN_BASE_URL = "https://api.iucnredlist.org/api/v4";

function getIucnApiKey() {
  const apiKey = process.env.IUCN_API_KEY;
  if (!apiKey) {
    const error = new Error("A chave da IUCN ainda nao foi configurada no backend.");
    error.status = "missing_api_key";
    throw error;
  }
  return apiKey;
}

function splitScientificName(scientificName) {
  const parts = String(scientificName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    const error = new Error("Informe um nome cientifico binomial para consultar a IUCN.");
    error.status = "invalid_scientific_name";
    throw error;
  }
  return { genusName: parts[0], speciesName: parts[1], infraName: parts.slice(2).join(" ") || null };
}

function buildScientificNameUrl(scientificName) {
  const { genusName, speciesName, infraName } = splitScientificName(scientificName);
  const params = new URLSearchParams({ genus_name: genusName, species_name: speciesName });
  if (infraName) params.set("infra_name", infraName);
  return `${IUCN_BASE_URL}/taxa/scientific_name?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.apiKey || getIucnApiKey()}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`A IUCN respondeu com HTTP ${response.status}.`);
      error.status = response.status === 401 || response.status === 403 ? "invalid_api_key" : "http_error";
      error.httpStatus = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("A IUCN demorou para responder.");
      timeoutError.status = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTaxonByScientificName(scientificName, options = {}) {
  return {
    success: true,
    source: "IUCN Red List",
    scientificName,
    queriedAt: new Date().toISOString(),
    payload: await fetchJson(buildScientificNameUrl(scientificName), options),
  };
}

module.exports = {
  IUCN_BASE_URL,
  getIucnApiKey,
  splitScientificName,
  buildScientificNameUrl,
  fetchJson,
  fetchTaxonByScientificName,
};
