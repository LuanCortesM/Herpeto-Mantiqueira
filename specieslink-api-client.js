const municipalityConfig = require("./municipalities.js");

const SPECIESLINK_BASE_URL = "https://specieslink.net/ws/1.0/search";
const DEFAULT_LIMIT = 500;
const DEFAULT_MAX_RECORDS = 1000;

const SpeciesLinkStatus = Object.freeze({
  SUCCESS: "success",
  UNAVAILABLE: "unavailable",
  MISSING_API_KEY: "missing_api_key",
  INVALID_API_KEY: "invalid_api_key",
  TIMEOUT: "timeout",
  HTTP_ERROR: "http_error",
  EMPTY_RESPONSE: "empty_response",
  INVALID_JSON: "invalid_json",
});

const USER_MESSAGES = {
  [SpeciesLinkStatus.MISSING_API_KEY]: "O speciesLink ainda não está disponível porque a chave da API não foi configurada no servidor.",
  [SpeciesLinkStatus.INVALID_API_KEY]: "O speciesLink respondeu que a chave configurada é inválida ou não autorizada.",
  [SpeciesLinkStatus.TIMEOUT]: "O speciesLink demorou para responder. Posso tentar novamente depois.",
  [SpeciesLinkStatus.HTTP_ERROR]: "O speciesLink não respondeu corretamente neste momento.",
  [SpeciesLinkStatus.EMPTY_RESPONSE]: "O speciesLink respondeu, mas não retornou uma resposta válida para essa consulta.",
  [SpeciesLinkStatus.INVALID_JSON]: "O speciesLink respondeu em um formato que não consegui interpretar.",
};

class SpeciesLinkError extends Error {
  constructor(status, message = USER_MESSAGES[status], details = {}) {
    super(message);
    this.name = "SpeciesLinkError";
    this.status = status;
    this.userMessage = USER_MESSAGES[status] || message;
    this.details = details;
  }
}

function getSpeciesLinkApiKey() {
  const apiKey = process.env.SPECIESLINK_API_KEY;
  if (!apiKey) throw new SpeciesLinkError(SpeciesLinkStatus.MISSING_API_KEY);
  return apiKey;
}

function buildSpeciesLinkUrl(params = {}, apiKey = getSpeciesLinkApiKey()) {
  const search = new URLSearchParams();
  search.set("apikey", apiKey);
  search.set("class", params.taxonClass);
  search.set("country", params.country || "Brazil");
  search.set("stateProvince", params.stateProvince || "SP");
  search.set("county", params.county);
  search.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  search.set("offset", String(params.offset ?? 0));
  ["coordinates", "basisOfRecord", "scientificName", "genus", "family", "order", "scope"].forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") search.set(key, String(params[key]));
  });
  return `${SPECIESLINK_BASE_URL}?${search.toString()}`;
}

function redactSpeciesLinkUrl(url) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("apikey")) parsed.searchParams.set("apikey", "[REDACTED]");
  return parsed.toString();
}

function detectResponseShape(json) {
  if (Array.isArray(json?.features)) return "features";
  if (Array.isArray(json)) return "array";
  if (Array.isArray(json?.records)) return "records";
  if (Array.isArray(json?.results)) return "results";
  if (Array.isArray(json?.result)) return "result";
  if (Array.isArray(json?.data)) return "data";
  if (Array.isArray(json?.records?.records)) return "records.records";
  return "unknown";
}

function extractSpeciesLinkRecords(json) {
  if (!json) return [];
  const shape = detectResponseShape(json);
  if (shape === "features") {
    return json.features
      .map((feature) => feature?.properties || null)
      .filter(Boolean);
  }
  if (shape === "array") return json;
  if (shape === "records") return json.records;
  if (shape === "results") return json.results;
  if (shape === "result") return json.result;
  if (shape === "data") return json.data;
  if (shape === "records.records") return json.records.records;
  return [];
}

function extractNumberMatched(json, recordCount = 0) {
  if (
    json?.type === "FeatureCollection" &&
    !Object.prototype.hasOwnProperty.call(json, "numberMatched")
  ) return null;
  const candidates = [
    json?.numberMatched,
    json?.total,
    json?.totalRecords,
    json?.total_results,
    json?.count,
    json?.matched,
    json?.recordsTotal,
    json?.numFound,
  ];
  const found = candidates.map(Number).find(Number.isFinite);
  return Number.isFinite(found) ? found : recordCount;
}

function extractNumberReturned(json, recordCount = 0) {
  const found = Number(json?.numberReturned);
  return Number.isFinite(found) ? found : recordCount;
}

function extractSpeciesLinkMetadata(json, recordCount = 0) {
  return {
    type: typeof json?.type === "string" ? json.type : null,
    numberMatched: extractNumberMatched(json, recordCount),
    numberReturned: extractNumberReturned(json, recordCount),
    featuresLength: Array.isArray(json?.features) ? json.features.length : 0,
  };
}

function classifyHttpError(statusCode) {
  if ([401, 403].includes(Number(statusCode))) return SpeciesLinkStatus.INVALID_API_KEY;
  return SpeciesLinkStatus.HTTP_ERROR;
}

async function fetchSpeciesLinkRaw(params = {}, options = {}) {
  const apiKey = options.apiKey || getSpeciesLinkApiKey();
  const url = buildSpeciesLinkUrl(params, apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 20000));
  try {
    let response;
    try {
      response = await (options.fetchImpl || fetch)(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new SpeciesLinkError(SpeciesLinkStatus.TIMEOUT);
      throw new SpeciesLinkError(SpeciesLinkStatus.UNAVAILABLE, "Não consegui conectar ao speciesLink.", { cause: error.message });
    }
    if (!response.ok) throw new SpeciesLinkError(classifyHttpError(response.status), undefined, { httpStatus: response.status });
    const body = typeof response.text === "function"
      ? await response.text()
      : JSON.stringify(await response.json());
    if (!String(body || "").trim()) throw new SpeciesLinkError(SpeciesLinkStatus.EMPTY_RESPONSE);
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new SpeciesLinkError(SpeciesLinkStatus.INVALID_JSON);
    }
    const records = extractSpeciesLinkRecords(json);
    const metadata = extractSpeciesLinkMetadata(json, records.length);
    return {
      success: true,
      status: SpeciesLinkStatus.SUCCESS,
      source: "speciesLink",
      records,
      ...metadata,
      rawRecordCount: records.length,
      detectedResponseShape: detectResponseShape(json),
      queriedAt: new Date().toISOString(),
      warnings: detectResponseShape(json) === "unknown" ? ["Resposta sem lista de registros reconhecida."] : [],
      raw: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function firstValue(raw, keys) {
  for (const key of keys) {
    if (raw?.[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function normalizeSpeciesLinkRecord(rawRecord, municipality) {
  const raw = rawRecord || {};
  const institutionCode = firstValue(raw, ["institutionCode", "institutioncode", "institution", "instituicao"]);
  const collectionCode = firstValue(raw, ["collectionCode", "collectioncode", "collection", "colecao"]);
  const catalogNumber = firstValue(raw, ["catalogNumber", "catalognumber", "catalogueNumber", "numeroCatalogo"]);
  const decimalLatitude = numberOrNull(firstValue(raw, ["decimalLatitude", "decimallatitude", "lat", "latitude"]));
  const decimalLongitude = numberOrNull(firstValue(raw, ["decimalLongitude", "decimallongitude", "long", "lng", "longitude"]));
  return {
    source: "speciesLink",
    municipality: municipality?.name || municipality || null,
    country: firstValue(raw, ["country"]) || "Brazil",
    stateProvince: firstValue(raw, ["stateProvince", "stateprovince", "state"]) || "SP",
    county: firstValue(raw, ["county"]) || null,
    kingdom: firstValue(raw, ["kingdom"]),
    phylum: firstValue(raw, ["phylum"]),
    className: firstValue(raw, ["class", "taxonClass", "classe"]),
    order: firstValue(raw, ["order", "ordem"]),
    family: firstValue(raw, ["family", "familia"]),
    genus: firstValue(raw, ["genus", "genero"]),
    specificEpithet: firstValue(raw, ["specificEpithet", "specificepithet", "epithet"]),
    scientificName: firstValue(raw, ["scientificName", "scientificname", "nomeCientifico"]),
    scientificNameAuthorship: firstValue(raw, ["scientificNameAuthorship", "scientificnameauthorship", "authorship"]),
    basisOfRecord: firstValue(raw, ["basisOfRecord", "basisofrecord", "basis"]),
    institutionCode,
    collectionCode,
    catalogNumber,
    fullCatalogCode: [institutionCode, collectionCode, catalogNumber].filter(Boolean).join(" ") || null,
    identifiedBy: firstValue(raw, ["identifiedBy", "identifiedby", "determinedBy"]),
    yearCollected: numberOrNull(firstValue(raw, ["yearCollected", "yearcollected", "year", "eventDateYear"])),
    locality: firstValue(raw, ["locality", "localidade"]),
    decimalLatitude,
    decimalLongitude,
    coordinatePrecision: firstValue(raw, ["coordinatePrecision", "coordinateprecision", "coordinateUncertaintyInMeters"]),
    hasCoordinates: Number.isFinite(decimalLatitude) && Number.isFinite(decimalLongitude),
    occurrenceRemarks: firstValue(raw, ["occurrenceRemarks", "occurrenceremarks", "remarks", "notes"]),
    barcode: firstValue(raw, ["barcode"]),
    queriedAt: new Date().toISOString(),
  };
}

function normalizeSpeciesLinkResponse(json, municipality) {
  const rawRecords = extractSpeciesLinkRecords(json);
  const metadata = extractSpeciesLinkMetadata(json, rawRecords.length);
  return {
    success: true,
    status: SpeciesLinkStatus.SUCCESS,
    source: "speciesLink",
    municipality: municipality?.name || municipality || null,
    records: rawRecords.map((record) => normalizeSpeciesLinkRecord(record, municipality)),
    ...metadata,
    rawRecordCount: rawRecords.length,
    detectedResponseShape: detectResponseShape(json),
    queriedAt: new Date().toISOString(),
    warnings: detectResponseShape(json) === "unknown" ? ["Resposta sem lista de registros reconhecida."] : [],
  };
}

function deduplicateRecords(records) {
  const seen = new Set();
  return (records || []).filter((record) => {
    const key = [
      record.municipality, record.scientificName, record.institutionCode, record.collectionCode,
      record.catalogNumber, record.yearCollected, record.locality, record.decimalLatitude, record.decimalLongitude,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSpeciesLinkByMunicipalityAndClass(municipality, taxonClass, options = {}) {
  const records = [];
  const attempts = [];
  let numberMatched = 0;
  for (const county of municipality.speciesLinkCountyQueries) {
    try {
      const limit = Number(options.limit ?? DEFAULT_LIMIT);
      const maxRecords = Number(options.maxRecords ?? DEFAULT_MAX_RECORDS);
      let offset = Number(options.offset || 0);
      let countyReturned = 0;
      let countyMatched = null;
      do {
        const result = await fetchSpeciesLinkRaw({ ...options, taxonClass, county, limit, offset }, options);
        attempts.push({
          county,
          offset,
          success: true,
          status: result.status,
          numberMatched: result.numberMatched,
          numberReturned: result.numberReturned,
          type: result.type,
          featuresLength: result.featuresLength,
        });
        if (Number.isFinite(result.numberMatched)) countyMatched = result.numberMatched;
        numberMatched = Math.max(numberMatched, countyMatched || 0);
        records.push(...result.records.map((raw) => normalizeSpeciesLinkRecord(raw, municipality)));
        countyReturned += result.records.length;
        if (
          limit === 0 ||
          !result.numberReturned ||
          result.numberReturned < limit ||
          (countyMatched !== null && countyReturned >= countyMatched) ||
          countyReturned >= maxRecords
        ) break;
        offset += limit;
      } while (records.length < maxRecords);
    } catch (error) {
      attempts.push({ county, success: false, status: error.status || SpeciesLinkStatus.UNAVAILABLE });
      if (municipality.speciesLinkCountyQueries.length === 1) throw error;
    }
  }
  if (!attempts.some((attempt) => attempt.success)) {
    throw new SpeciesLinkError(attempts[0]?.status || SpeciesLinkStatus.UNAVAILABLE);
  }
  return {
    success: true,
    status: SpeciesLinkStatus.SUCCESS,
    source: "speciesLink",
    municipality: municipality.name,
    taxonClass,
    records: deduplicateRecords(records),
    numberMatched,
    numberReturned: records.length,
    responseTypes: [...new Set(attempts.map((attempt) => attempt.type).filter(Boolean))],
    featuresLength: attempts.reduce((sum, attempt) => sum + Number(attempt.featuresLength || 0), 0),
    attempts,
    queriedAt: new Date().toISOString(),
  };
}

async function fetchSpeciesLinkMunicipalityHerpetofauna(municipality, options = {}) {
  const classes = options.classes || ["Amphibia", "Reptilia"];
  const batches = [];
  for (const taxonClass of classes) {
    batches.push(await fetchSpeciesLinkByMunicipalityAndClass(municipality, taxonClass, options));
  }
  return {
    success: true,
    status: SpeciesLinkStatus.SUCCESS,
    source: "speciesLink",
    municipality: municipality.name,
    records: deduplicateRecords(batches.flatMap((batch) => batch.records)),
    numberMatched: batches.reduce((sum, batch) => sum + Number(batch.numberMatched || 0), 0),
    numberReturned: batches.reduce((sum, batch) => sum + Number(batch.numberReturned || 0), 0),
    responseTypes: [...new Set(batches.flatMap((batch) => batch.responseTypes || []))],
    featuresLength: batches.reduce((sum, batch) => sum + Number(batch.featuresLength || 0), 0),
    queriedAt: new Date().toISOString(),
    attempts: batches.flatMap((batch) => batch.attempts),
  };
}

function groupSpeciesLinkByScientificName(records) {
  const groups = new Map();
  (records || []).forEach((record) => {
    const scientificName = record.scientificName || "Nome científico não informado";
    if (!groups.has(scientificName)) {
      groups.set(scientificName, {
        scientificName,
        className: record.className,
        family: record.family,
        genus: record.genus,
        totalRecords: 0,
        recordsWithCoordinates: 0,
        recordsWithoutCoordinates: 0,
        preservedSpecimens: 0,
        institutions: new Set(),
        collections: new Set(),
        catalogExamples: new Set(),
        years: new Set(),
      });
    }
    const item = groups.get(scientificName);
    item.totalRecords += 1;
    if (record.hasCoordinates) item.recordsWithCoordinates += 1;
    else item.recordsWithoutCoordinates += 1;
    if (record.basisOfRecord === "PreservedSpecimen") item.preservedSpecimens += 1;
    if (record.institutionCode) item.institutions.add(record.institutionCode);
    if (record.collectionCode) item.collections.add(record.collectionCode);
    if (record.fullCatalogCode) item.catalogExamples.add(record.fullCatalogCode);
    if (Number.isFinite(record.yearCollected)) item.years.add(record.yearCollected);
  });
  return [...groups.values()].map((item) => {
    const years = [...item.years].sort((a, b) => a - b);
    return {
      ...item,
      institutions: [...item.institutions],
      collections: [...item.collections],
      catalogExamples: [...item.catalogExamples].slice(0, 5),
      years,
      firstYear: years[0] || null,
      lastYear: years[years.length - 1] || null,
    };
  });
}

function summarizeSpeciesLinkMunicipality(records) {
  const list = records || [];
  const grouped = groupSpeciesLinkByScientificName(list);
  const countBy = (field) => [...list.reduce((map, record) => {
    if (record[field]) map.set(record[field], (map.get(record[field]) || 0) + 1);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const years = list.map((record) => record.yearCollected).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    municipality: list[0]?.municipality || null,
    totalRecords: list.length,
    uniqueScientificNames: grouped.length,
    amphibianNames: grouped.filter((item) => item.className === "Amphibia").length,
    reptileNames: grouped.filter((item) => item.className === "Reptilia").length,
    recordsWithCoordinates: list.filter((record) => record.hasCoordinates).length,
    recordsWithoutCoordinates: list.filter((record) => !record.hasCoordinates).length,
    preservedSpecimens: list.filter((record) => record.basisOfRecord === "PreservedSpecimen").length,
    mainInstitutions: countBy("institutionCode"),
    mainCollections: countBy("collectionCode"),
    firstYear: years[0] || null,
    lastYear: years[years.length - 1] || null,
    topTaxa: grouped.sort((a, b) => b.totalRecords - a.totalRecords).slice(0, 10),
  };
}

async function testSpeciesLinkConnection(options = {}) {
  try {
    const result = await fetchSpeciesLinkRaw({ taxonClass: "Amphibia", county: "Cruzeiro", limit: 0 }, options);
    return { success: true, status: result.status, numberMatched: result.numberMatched, detectedResponseShape: result.detectedResponseShape };
  } catch (error) {
    return { success: false, status: error.status || SpeciesLinkStatus.UNAVAILABLE, userMessage: error.userMessage || USER_MESSAGES[SpeciesLinkStatus.HTTP_ERROR] };
  }
}

async function diagnoseSpeciesLink(options = {}) {
  const apiKeyConfigured = Boolean(process.env.SPECIESLINK_API_KEY);
  const sampleQuery = { taxonClass: "Amphibia", country: "Brazil", stateProvince: "SP", county: "Cruzeiro", limit: 0 };
  const connectionTest = await testSpeciesLinkConnection(options);
  return {
    apiKeyConfigured,
    connectionTest,
    sampleQuery,
    sampleStatus: connectionTest.status,
    sampleNumberMatched: connectionTest.numberMatched ?? null,
    canFetchRecords: connectionTest.success,
    detectedResponseShape: connectionTest.detectedResponseShape || "unknown",
    recommendations: apiKeyConfigured ? [] : ["Configure SPECIESLINK_API_KEY no ambiente do backend e reinicie o servidor."],
  };
}

module.exports = {
  SPECIESLINK_BASE_URL,
  SpeciesLinkStatus,
  SpeciesLinkError,
  USER_MESSAGES,
  getSpeciesLinkApiKey,
  buildSpeciesLinkUrl,
  redactSpeciesLinkUrl,
  detectResponseShape,
  extractSpeciesLinkRecords,
  extractNumberMatched,
  extractNumberReturned,
  extractSpeciesLinkMetadata,
  fetchSpeciesLinkRaw,
  normalizeSpeciesLinkRecord,
  normalizeSpeciesLinkResponse,
  deduplicateRecords,
  fetchSpeciesLinkByMunicipalityAndClass,
  fetchSpeciesLinkMunicipalityHerpetofauna,
  groupSpeciesLinkByScientificName,
  summarizeSpeciesLinkMunicipality,
  testSpeciesLinkConnection,
  diagnoseSpeciesLink,
};
