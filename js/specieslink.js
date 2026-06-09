(function (global) {
  const SPECIESLINK_PROXY_URL = "/api/specieslink/search";
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
  const DEFAULT_LIMIT = 500;
  const DEFAULT_MAX_RECORDS = 1000;
  const SpeciesLinkStatus = {
    SUCCESS: "success",
    UNAVAILABLE: "unavailable",
    MISSING_API_KEY: "missing_api_key",
    INVALID_API_KEY: "invalid_api_key",
    TIMEOUT: "timeout",
    HTTP_ERROR: "http_error",
    EMPTY_RESPONSE: "empty_response",
    INVALID_JSON: "invalid_json",
  };
  const backendClient =
    typeof window === "undefined" && typeof require === "function"
      ? require("./specieslink-api-client.js")
      : null;
  const municipalityConfig =
    global.HerpetoMunicipalities ||
    (typeof require === "function" ? require("./municipalities.js") : null);

  const SPECIESLINK_MUNICIPALITIES = municipalityConfig.toSpeciesLinkMap();

  const cache = new Map();

  function getSpeciesLinkApiKey() {
    if (!backendClient) throw new Error("A chave do speciesLink só pode ser lida no backend.");
    return backendClient.getSpeciesLinkApiKey();
  }

  function removeAccents(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeText(text) {
    return removeAccents(text)
      .toLowerCase()
      .replace(/\b(sp|sao paulo|são paulo)\b/g, " ")
      .replace(/[-_/.,;:()[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function municipalityLabel(municipality) {
    return municipality?.displayName || municipality?.name || null;
  }

  function uniqueMunicipalities() {
    return Object.values(SPECIESLINK_MUNICIPALITIES).filter(
      (value, index, array) => array.findIndex((item) => municipalityLabel(item) === municipalityLabel(value)) === index
    );
  }

  function normalizeMunicipalityName(input) {
    const normalized = normalizeText(input);
    const exact = Object.entries(SPECIESLINK_MUNICIPALITIES).find(([key]) => normalizeText(key) === normalized);
    if (exact) return exact[1];

    const partial = Object.entries(SPECIESLINK_MUNICIPALITIES).find(([key, municipality]) => {
      const names = [key, municipality.name, municipality.displayName, ...(municipality.countyQueries || [])]
        .filter(Boolean)
        .map(normalizeText);
      return names.some((name) => normalized === name || normalized.includes(name));
    });
    return partial ? partial[1] : null;
  }

  function detectSpeciesLinkMunicipalities(question) {
    const q = normalizeText(question);
    const detected = [];
    Object.entries(SPECIESLINK_MUNICIPALITIES).forEach(([key, municipality]) => {
      const names = [key, municipality.name, municipality.displayName, ...(municipality.countyQueries || [])]
        .filter(Boolean)
        .map(normalizeText);
      if (names.some((name) => q.includes(name))) {
        if (!detected.some((item) => municipalityLabel(item) === municipalityLabel(municipality))) {
          detected.push(municipality);
        }
      }
    });
    if (detected.length) return detected;
    if (/\b(todos|todas|vale historico|regiao|região|municipios|municípios)\b/.test(q)) return uniqueMunicipalities();
    return detected;
  }

  function detectSpeciesLinkTaxonomicGroup(question) {
    const q = normalizeText(question);
    const amphibianTerms = ["anfibio", "anfibios", "amphibia", "anuro", "anuros", "sapo", "sapos", "ra", "ras", "perereca", "pererecas", "girino", "girinos"];
    const reptileTerms = ["reptil", "repteis", "reptilia", "cobra", "cobras", "serpente", "serpentes", "jararaca", "jararacas", "lagarto", "lagartos", "teiu", "teius", "quelonio", "quelonios", "tartaruga", "tartarugas"];
    const wantsAmphibia = amphibianTerms.some((term) => new RegExp(`\\b${term}\\b`).test(q));
    const wantsReptilia = reptileTerms.some((term) => new RegExp(`\\b${term}\\b`).test(q));
    if (q.includes("herpetofauna") || (wantsAmphibia && wantsReptilia)) return ["Amphibia", "Reptilia"];
    if (wantsAmphibia) return ["Amphibia"];
    if (wantsReptilia) return ["Reptilia"];
    return ["Amphibia", "Reptilia"];
  }

  const detectSpeciesLinkTaxonomicGroups = detectSpeciesLinkTaxonomicGroup;

  function buildSpeciesLinkSearchUrl({
    apiKey,
    taxonClass,
    county,
    limit = DEFAULT_LIMIT,
    offset = 0,
    coordinates,
    basisOfRecord,
    scientificName,
    genus,
    family,
    order,
    scope,
  }) {
    if (!backendClient) throw new Error("URLs externas do speciesLink só podem ser montadas no backend.");
    return backendClient.buildSpeciesLinkUrl({
      taxonClass, county, limit, offset, coordinates, basisOfRecord, scientificName, genus, family, order, scope,
    }, apiKey);
  }

  function stableCacheKey(prefix, options) {
    const sorted = {};
    Object.keys(options || {})
      .sort()
      .forEach((key) => {
        if (typeof options[key] !== "undefined" && key !== "apiKey" && key !== "timeoutMs" && key !== "forceRefresh") {
          sorted[key] = options[key];
        }
      });
    return `${prefix}_${JSON.stringify(sorted)}`;
  }

  function clearSpeciesLinkCache() {
    cache.clear();
  }

  async function fetchWithTimeout(url, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        let status = "http_error";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
          if (payload?.userMessage) message = payload.userMessage;
          if (payload?.status) status = payload.status;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        const error = new Error(message);
        error.status = status;
        throw error;
      }
      try {
        return await response.json();
      } catch (error) {
        throw new Error("JSON inválido retornado pela API speciesLink.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  function extractSpeciesLinkRecords(json) {
    if (!json) return [];
    if (Array.isArray(json.features)) {
      return json.features
        .map((feature) => feature?.properties || null)
        .filter(Boolean);
    }
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.records)) return json.records;
    if (Array.isArray(json?.results)) return json.results;
    if (Array.isArray(json?.result)) return json.result;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.records?.records)) return json.records.records;
    console.warn("Resposta speciesLink sem array de registros reconhecido.", json);
    return [];
  }

  function extractTotalCount(json, recordsLength) {
    const candidates = [json?.numberMatched, json?.total, json?.totalRecords, json?.total_results, json?.count, json?.matched, json?.recordsTotal, json?.numFound];
    const total = candidates.map(Number).find(Number.isFinite);
    return Number.isFinite(total) ? total : recordsLength;
  }

  function extractSpeciesLinkMetadata(json, recordsLength = extractSpeciesLinkRecords(json).length) {
    const numberReturned = Number(json?.numberReturned);
    return {
      type: typeof json?.type === "string" ? json.type : null,
      numberMatched: extractTotalCount(json, recordsLength),
      numberReturned: Number.isFinite(numberReturned) ? numberReturned : recordsLength,
      featuresLength: Array.isArray(json?.features) ? json.features.length : 0,
    };
  }

  async function fetchSpeciesLinkRecordsDirect(options) {
    if (!backendClient) throw new Error("Consulta externa direta bloqueada no frontend.");
    const cacheKey = stableCacheKey("specieslink_direct", options);
    const cached = cache.get(cacheKey);
    if (!options.forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
    const result = await backendClient.fetchSpeciesLinkRaw(options, options);
    const json = {
      ...result.raw,
      records: result.records,
      numberMatched: result.numberMatched,
      numberReturned: result.numberReturned,
      type: result.type,
      featuresLength: result.featuresLength,
    };
    cache.set(cacheKey, { timestamp: Date.now(), data: json });
    return json;
  }

  async function fetchSpeciesLinkRecords(options = {}) {
    const cacheKey = stableCacheKey("specieslink_proxy", options);
    const cached = cache.get(cacheKey);
    if (!options.forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

    const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    try {
      let json;
      if (isBrowser) {
        const params = new URLSearchParams();
        Object.entries(options).forEach(([key, value]) => {
          if (typeof value !== "undefined" && value !== null && ["municipalityId", "taxonClass", "limit", "offset", "coordinates", "basisOfRecord", "scientificName", "genus", "family", "order", "scope"].includes(key)) params.set(key, String(value));
        });
        json = await fetchWithTimeout(`${SPECIESLINK_PROXY_URL}?${params.toString()}`, options.timeoutMs || 25000);
      } else {
        json = await fetchSpeciesLinkRecordsDirect(options);
      }
      cache.set(cacheKey, { timestamp: Date.now(), data: json });
      return json;
    } catch (error) {
      console.error("Erro técnico ao consultar speciesLink:", error);
      if (cached?.data) return cached.data;
      throw new Error(error.message || "Não consegui consultar o speciesLink neste momento.");
    }
  }

  function firstValue(raw, keys) {
    for (const key of keys) {
      if (raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
    }
    return null;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSpeciesLinkRecord(rawRecord, municipalityName) {
    const raw = rawRecord || {};
    const latitude = numberOrNull(firstValue(raw, ["decimalLatitude", "lat", "latitude"]));
    const longitude = numberOrNull(firstValue(raw, ["decimalLongitude", "long", "lng", "longitude"]));
    const institutionCode = firstValue(raw, ["institutionCode", "institution", "instituicao"]);
    const collectionCode = firstValue(raw, ["collectionCode", "collection", "colecao"]);
    const catalogNumber = firstValue(raw, ["catalogNumber", "catalogueNumber", "numeroCatalogo"]);
    const year = numberOrNull(firstValue(raw, ["yearCollected", "year", "eventDateYear"]));

    return {
      fonte: "speciesLink",
      municipio: municipalityName,
      estado: firstValue(raw, ["stateProvince", "state"]) || "SP",
      pais: firstValue(raw, ["country"]) || "Brazil",
      classe: firstValue(raw, ["class", "className", "taxonClass", "classe"]),
      ordem: firstValue(raw, ["order", "ordem"]),
      familia: firstValue(raw, ["family", "familia"]),
      genero: firstValue(raw, ["genus", "genero"]),
      epiteto_especifico: firstValue(raw, ["specificEpithet", "epithet"]),
      nome_cientifico: firstValue(raw, ["scientificName", "nomeCientifico"]),
      autoria_nome_cientifico: firstValue(raw, ["scientificNameAuthorship", "authorship"]),
      instituicao: institutionCode,
      colecao: collectionCode,
      numero_catalogo: catalogNumber,
      codigo_catalogo_completo: firstValue(raw, ["fullCatalogCode"]) || [institutionCode, collectionCode, catalogNumber].filter(Boolean).join(" ") || null,
      tipo_registro: firstValue(raw, ["basisOfRecord", "basis"]),
      identificador: firstValue(raw, ["identifiedBy", "determinedBy"]),
      ano_coleta: year,
      localidade: firstValue(raw, ["locality", "localidade"]),
      latitude,
      longitude,
      precisao_coordenada: firstValue(raw, ["coordinatePrecision", "coordinateUncertaintyInMeters"]),
      tem_coordenada: raw.hasCoordinates === true || Number.isFinite(latitude) && Number.isFinite(longitude),
      observacoes: firstValue(raw, ["occurrenceRemarks", "remarks", "notes"]),
      barcode: firstValue(raw, ["barcode"]),
      data_consulta: new Date().toISOString(),
    };
  }

  function normalizeSpeciesLinkResponse(json, municipalityName) {
    return extractSpeciesLinkRecords(json)
      .map((raw) => normalizeSpeciesLinkRecord(raw, municipalityName))
      .filter((record) => record.nome_cientifico || record.genero || record.familia);
  }

  function deduplicateSpeciesLinkRecords(records) {
    const seen = new Set();
    return (records || []).filter((record) => {
      const key = [
        record.municipio,
        record.nome_cientifico,
        record.instituicao,
        record.colecao,
        record.numero_catalogo,
        record.ano_coleta,
        record.localidade,
        record.latitude,
        record.longitude,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchSpeciesLinkByMunicipalityAndClass(municipality, taxonClass, options = {}) {
    const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    if (isBrowser) {
      const json = await fetchSpeciesLinkRecords({ ...options, municipalityId: municipality.id, taxonClass, limit: options.limit || DEFAULT_LIMIT });
      return deduplicateSpeciesLinkRecords(normalizeSpeciesLinkResponse(json, municipalityLabel(municipality)));
    }
    const all = [];
    const errors = [];
    let successfulQueries = 0;
    for (const county of municipality.countyQueries || []) {
      try {
        const json = await fetchSpeciesLinkRecords({ ...options, taxonClass, county, limit: options.limit || DEFAULT_LIMIT });
        successfulQueries += 1;
        all.push(...normalizeSpeciesLinkResponse(json, municipalityLabel(municipality)));
      } catch (error) {
        errors.push(error);
        console.warn(`Falha speciesLink: ${municipalityLabel(municipality)} ${taxonClass} county=${county}`, error);
      }
    }
    if (!successfulQueries && errors.length) throw errors[0];
    return deduplicateSpeciesLinkRecords(all);
  }

  async function fetchSpeciesLinkMunicipalityHerpetofauna(municipality, options = {}) {
    const groups = options.groups || ["Amphibia", "Reptilia"];
    const batches = [];
    for (const taxonClass of groups) {
      batches.push(...(await fetchSpeciesLinkByMunicipalityAndClass(municipality, taxonClass, options)));
    }
    return deduplicateSpeciesLinkRecords(batches);
  }

  async function fetchSpeciesLinkAllMunicipalities(options = {}) {
    const batches = [];
    for (const municipality of uniqueMunicipalities()) {
      batches.push(...(await fetchSpeciesLinkMunicipalityHerpetofauna(municipality, options)));
    }
    return batches;
  }

  function groupSpeciesLinkByScientificName(records) {
    const groups = new Map();
    (records || []).forEach((record) => {
      const key = record.nome_cientifico || "Nome científico não informado";
      if (!groups.has(key)) {
        groups.set(key, {
          nome_cientifico: key,
          classe: record.classe,
          familia: record.familia,
          genero: record.genero,
          municipios: new Set(),
          total_registros: 0,
          registros_com_coordenada: 0,
          registros_sem_coordenada: 0,
          colecoes: new Set(),
          instituicoes: new Set(),
          tipos_registro: new Set(),
          anos_coleta: new Set(),
          exemplos_catalogo: new Set(),
        });
      }
      const item = groups.get(key);
      item.total_registros += 1;
      if (record.tem_coordenada) item.registros_com_coordenada += 1;
      else item.registros_sem_coordenada += 1;
      if (record.municipio) item.municipios.add(record.municipio);
      if (record.colecao) item.colecoes.add(record.colecao);
      if (record.instituicao) item.instituicoes.add(record.instituicao);
      if (record.tipo_registro) item.tipos_registro.add(record.tipo_registro);
      if (Number.isFinite(record.ano_coleta)) item.anos_coleta.add(record.ano_coleta);
      if (record.codigo_catalogo_completo) item.exemplos_catalogo.add(record.codigo_catalogo_completo);
    });

    return [...groups.values()].map((item) => {
      const years = [...item.anos_coleta].sort((a, b) => a - b);
      return {
        nome_cientifico: item.nome_cientifico,
        classe: item.classe,
        familia: item.familia,
        genero: item.genero,
        municipios: [...item.municipios],
        total_registros: item.total_registros,
        registros_com_coordenada: item.registros_com_coordenada,
        registros_sem_coordenada: item.registros_sem_coordenada,
        colecoes: [...item.colecoes],
        instituicoes: [...item.instituicoes],
        tipos_registro: [...item.tipos_registro],
        anos_coleta: years,
        primeiro_ano: years[0] || null,
        ultimo_ano: years[years.length - 1] || null,
        exemplos_catalogo: [...item.exemplos_catalogo].slice(0, 5),
      };
    });
  }

  function summarizeSpeciesLinkMunicipality(records) {
    const list = records || [];
    const grouped = groupSpeciesLinkByScientificName(list);
    const years = list.map((record) => record.ano_coleta).filter(Number.isFinite).sort((a, b) => a - b);
    const preserved = list.filter((record) => normalizeText(record.tipo_registro).includes("preservedspecimen"));
    const countBy = (getter) =>
      [...list.reduce((map, record) => {
        const value = getter(record);
        if (value) map.set(value, (map.get(value) || 0) + 1);
        return map;
      }, new Map())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

    return {
      municipio: list[0]?.municipio || null,
      total_registros: list.length,
      nomes_cientificos_unicos: grouped.length,
      riqueza_anfibios: grouped.filter((record) => record.classe === "Amphibia").length,
      riqueza_repteis: grouped.filter((record) => record.classe === "Reptilia").length,
      registros_com_coordenada: list.filter((record) => record.tem_coordenada).length,
      registros_sem_coordenada: list.filter((record) => !record.tem_coordenada).length,
      registros_material_preservado: preserved.length,
      principais_colecoes: countBy((record) => record.colecao),
      principais_instituicoes: countBy((record) => record.instituicao),
      principais_familias: countBy((record) => record.familia),
      primeiro_ano: years[0] || null,
      ultimo_ano: years[years.length - 1] || null,
      taxa_mais_registrados: grouped.sort((a, b) => b.total_registros - a.total_registros).slice(0, 10),
    };
  }

  function filterSpeciesLinkRecords(records, filters = {}) {
    let output = [...(records || [])];
    if (Array.isArray(filters.classes) && filters.classes.length) output = output.filter((record) => filters.classes.includes(record.classe));
    if (filters.classe) output = output.filter((record) => record.classe === filters.classe);
    if (filters.family) output = output.filter((record) => normalizeText(record.familia).includes(normalizeText(filters.family)));
    if (filters.genus) output = output.filter((record) => normalizeText(record.genero).includes(normalizeText(filters.genus)));
    if (filters.scientificName) output = output.filter((record) => normalizeText(record.nome_cientifico).includes(normalizeText(filters.scientificName)));
    if (filters.basisOfRecord) output = output.filter((record) => normalizeText(record.tipo_registro).includes(normalizeText(filters.basisOfRecord)));
    if (filters.withCoordinates === true) output = output.filter((record) => record.tem_coordenada);
    if (filters.withCoordinates === false) output = output.filter((record) => !record.tem_coordenada);
    if (Number.isFinite(Number(filters.yearMin))) output = output.filter((record) => record.ano_coleta >= Number(filters.yearMin));
    if (Number.isFinite(Number(filters.yearMax))) output = output.filter((record) => record.ano_coleta <= Number(filters.yearMax));
    if (filters.collection) output = output.filter((record) => normalizeText(record.colecao).includes(normalizeText(filters.collection)));
    if (filters.institution) output = output.filter((record) => normalizeText(record.instituicao).includes(normalizeText(filters.institution)));
    return output;
  }

  async function searchSpeciesLinkSpeciesInMunicipality(speciesName, municipality, options = {}) {
    const target = typeof municipality === "string" ? normalizeMunicipalityName(municipality) : municipality;
    const records = await fetchSpeciesLinkMunicipalityHerpetofauna(target, options);
    return filterSpeciesLinkRecords(records, { scientificName: speciesName });
  }

  function speciesLinkMethodologyNote(prefix = "") {
    return [
      prefix,
      "Nota metodológica: o speciesLink reúne registros de coleções e bases integradas, não inventários completos. Os dados podem ter viés histórico, viés de coleta, viés institucional, problemas de georreferenciamento e nomes taxonômicos desatualizados. Eu não corrijo taxonomia automaticamente sem uma fonte taxonômica adicional.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function formatEmptySpeciesLinkAnswer(target = "os filtros atuais") {
    return `Não encontrei registros no speciesLink para ${target}. Isso não significa ausência real da espécie ou grupo; significa apenas que a busca não retornou registros correspondentes.\n\n${speciesLinkMethodologyNote()}`;
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${Number(count) === 1 ? singular : plural}`;
  }

  function formatSpeciesLinkListAnswer(records, groupLabel = "anfíbios e répteis", options = {}) {
    if (!records.length) return formatEmptySpeciesLinkAnswer(groupLabel);
    const grouped = groupSpeciesLinkByScientificName(records).sort((a, b) => a.nome_cientifico.localeCompare(b.nome_cientifico));
    const limit = options.wantsFullList ? Number.MAX_SAFE_INTEGER : 10;
    const lines = grouped.slice(0, limit).map((item, index) => `${index + 1}. ${item.nome_cientifico} — ${pluralize(item.total_registros, "registro")}\n   Família: ${item.familia || "não informada"}${item.colecoes.length ? `\n   Coleções: ${item.colecoes.join(", ")}` : ""}`);
    const hidden = grouped.length > limit ? `\n\nAinda há ${pluralize(grouped.length - limit, "registro")} ocultos. Diga “liste todos” para ver a lista completa.` : "";
    return `Encontrei ${pluralize(grouped.length, "nome científico", "nomes científicos")} de ${groupLabel} para ${records[0].municipio} no speciesLink.\n\n${grouped.length > limit ? "Alguns registros:" : "Registros encontrados:"}\n${lines.join("\n\n")}${hidden}\n\nFonte: speciesLink. Registros disponíveis, não inventário completo.`;
  }

  function formatSpeciesLinkSummaryAnswer(summary) {
    if (!summary?.municipio) return formatEmptySpeciesLinkAnswer("esse município com os filtros atuais");
    return [
      `Resumo do speciesLink para ${summary.municipio}:`,
      `- Total de registros: ${summary.total_registros}`,
      `- Nomes científicos únicos: ${summary.nomes_cientificos_unicos}`,
      `- Anfíbios: ${summary.riqueza_anfibios}`,
      `- Répteis: ${summary.riqueza_repteis}`,
      `- Registros com coordenadas: ${summary.registros_com_coordenada}`,
      `- Registros sem coordenadas: ${summary.registros_sem_coordenada}`,
      `- Registros com voucher/material preservado: ${summary.registros_material_preservado}`,
      `- Principais coleções: ${summary.principais_colecoes.map((item) => `${item.name} (${item.count})`).join(", ") || "não informadas"}`,
      `- Principais famílias: ${summary.principais_familias.map((item) => `${item.name} (${item.count})`).join(", ") || "não informadas"}`,
      `- Intervalo temporal de coleta: ${summary.primeiro_ano || "?"} - ${summary.ultimo_ano || "?"}`,
      "",
      speciesLinkMethodologyNote(),
    ].join("\n");
  }

  function formatSpeciesLinkVoucherAnswer(records) {
    if (!records.length) return formatEmptySpeciesLinkAnswer("material preservado/vouchers");
    const lines = records.slice(0, 25).map((record, index) => `${index + 1}. ${record.nome_cientifico || "Nome científico não informado"}\n   Instituição: ${record.instituicao || "não informada"}\n   Coleção: ${record.colecao || "não informada"}\n   Número de catálogo: ${record.codigo_catalogo_completo || record.numero_catalogo || "não informado"}\n   Ano: ${record.ano_coleta || "não informado"}\n   Localidade: ${record.localidade || "não informada"}`);
    return `Encontrei registros com material preservado para ${records[0].municipio}:\n\n${lines.join("\n\n")}\n\n${speciesLinkMethodologyNote("Vouchers são importantes porque permitem verificação posterior da identificação.")}`;
  }

  function formatSpeciesLinkCoordinatesAnswer(records) {
    if (!records.length) return formatEmptySpeciesLinkAnswer("registros com coordenadas");
    const lines = records.slice(0, 25).map((record, index) => `${index + 1}. ${record.nome_cientifico || "Nome científico não informado"}\n   Latitude: ${record.latitude}\n   Longitude: ${record.longitude}\n   Localidade: ${record.localidade || "não informada"}\n   Coleção: ${record.colecao || "não informada"}`);
    return `Registros georreferenciados retornados pelo speciesLink para ${records[0].municipio}:\n\n${lines.join("\n\n")}\n\n${speciesLinkMethodologyNote("Cautela: coordenadas podem ter incerteza, erro de transcrição ou sensibilidade associada ao dado.")}`;
  }

  function formatSpeciesLinkComparisonAnswer(comparison, question = "") {
    if (!comparison.length) return formatEmptySpeciesLinkAnswer("comparação regional");
    const q = normalizeText(question);
    const sorted = [...comparison].sort((a, b) => {
      if (q.includes("voucher") || q.includes("colecao") || q.includes("coleção")) return b.summary.registros_material_preservado - a.summary.registros_material_preservado;
      if (q.includes("anfib")) return b.summary.riqueza_anfibios - a.summary.riqueza_anfibios;
      if (q.includes("rept")) return b.summary.riqueza_repteis - a.summary.riqueza_repteis;
      return b.summary.total_registros - a.summary.total_registros;
    });
    const lines = sorted.map((item, index) => `${index + 1}. ${item.municipio}\n   Registros: ${item.summary.total_registros}\n   Nomes científicos únicos: ${item.summary.nomes_cientificos_unicos}\n   Anfíbios: ${item.summary.riqueza_anfibios}\n   Répteis: ${item.summary.riqueza_repteis}\n   Com coordenadas: ${item.summary.registros_com_coordenada}\n   Vouchers/material preservado: ${item.summary.registros_material_preservado}`);
    return `Comparação dos municípios segundo registros retornados pelo speciesLink:\n\n${lines.join("\n\n")}\n\n${speciesLinkMethodologyNote("Maior número de registros não significa necessariamente maior biodiversidade real; pode refletir esforço histórico de coleta e integração de coleções.")}`;
  }

  function formatSpeciesLinkSpeciesSearchAnswer(matches, speciesName, municipalityName) {
    if (!matches.length) {
      return `Não encontrei registros de ${speciesName} no speciesLink para ${municipalityName} com os filtros atuais. Isso não significa ausência real da espécie; significa apenas que a busca não retornou registros correspondentes.\n\n${speciesLinkMethodologyNote()}`;
    }
    const grouped = groupSpeciesLinkByScientificName(matches)[0];
    return `Sim. O speciesLink retornou registros de ${speciesName} para ${municipalityName}. Foram encontrados ${matches.length} registros, incluindo tipos: ${grouped.tipos_registro.join(", ") || "não informados"}.\n\n${matches.slice(0, 10).map((record, index) => `${index + 1}. ${record.nome_cientifico}\n   Tipo: ${record.tipo_registro || "não informado"}\n   Catálogo: ${record.codigo_catalogo_completo || "não informado"}\n   Coordenada: ${record.tem_coordenada ? `${record.latitude}, ${record.longitude}` : "não informada"}`).join("\n\n")}\n\n${speciesLinkMethodologyNote()}`;
  }

  function detectIntent(question, municipalities) {
    const q = normalizeText(question);
    const hasScientificBinomial = (String(question || "").match(/\b[A-Z][a-z]+ [a-z][a-z-]+\b/g) || []).some((match) => !/^(quais|qual|liste|resumo|compare|quantos|quantas) /i.test(match));
    if (municipalities.length > 1 || /\b(compare|comparar|comparacao|comparação|todos|qual municipio|qual município|qual cidade)\b/.test(q)) return "comparison";
    if (/\b(voucher|material preservado|preservado|colecao|coleção|catalogo|catálogo)\b/.test(q)) return "voucher";
    if (/\b(coordenada|coordenadas|georreferenciado|latitude|longitude)\b/.test(q)) return "coordinates";
    if (/\b(resumo|quantos|quantas|total|riqueza)\b/.test(q)) return "summary";
    if (hasScientificBinomial || /^(tem|ha|há|existe|aparece)\b/.test(q)) return "species-search";
    return "list";
  }

  function extractSpeciesSearch(question, municipalities) {
    let text = String(question || "");
    municipalities.forEach((municipality) => {
      municipality.countyQueries.forEach((county) => {
        text = text.replace(new RegExp(county, "ig"), " ");
      });
      text = text.replace(new RegExp((municipality.displayName || municipality.name).replace("-SP", ""), "ig"), " ");
    });
    return text
      .replace(/\b(specieslink|tem|ha|há|existe|aparece|registro|registros|de|do|da|dos|das|em|para|no|na|nos|nas|o|a|os|as)\b/gi, " ")
      .replace(/[?!.:,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function answerSpeciesLinkQuestion(question, options = {}) {
    const municipalities = detectSpeciesLinkMunicipalities(question);
    const groups = detectSpeciesLinkTaxonomicGroup(question);
    const intent = detectIntent(question, municipalities);
    const q = normalizeText(question);
    const wantsCoordinates = intent === "coordinates";
    const wantsVoucher = intent === "voucher";
    const queryOptions = { ...options, groups };
    if (wantsCoordinates) queryOptions.coordinates = options.coordinates || "yes";
    if (wantsVoucher) queryOptions.basisOfRecord = "PreservedSpecimen";

    if (!municipalities.length) {
      return "Não identifiquei um município válido na pergunta. Municípios disponíveis: Lavrinhas, Queluz, Silveiras, Bananal, Areias, São José do Barreiro, Arapeí e Cruzeiro.";
    }

    try {
      if (intent === "comparison") {
        const comparison = [];
        for (const municipality of municipalities) {
          const records = await fetchSpeciesLinkMunicipalityHerpetofauna(municipality, queryOptions);
          comparison.push({ municipio: municipalityLabel(municipality), records, summary: summarizeSpeciesLinkMunicipality(records) });
        }
        return formatSpeciesLinkComparisonAnswer(comparison, question);
      }

      const municipality = municipalities[0];
      const records = await fetchSpeciesLinkMunicipalityHerpetofauna(municipality, queryOptions);
      let filtered = filterSpeciesLinkRecords(records, { classes: groups });
      if (wantsCoordinates) filtered = filterSpeciesLinkRecords(filtered, { withCoordinates: true });
      if (wantsVoucher) filtered = filterSpeciesLinkRecords(filtered, { basisOfRecord: "PreservedSpecimen" });

      if (intent === "species-search") {
        const speciesName = extractSpeciesSearch(question, municipalities);
        const matches = filterSpeciesLinkRecords(records, { scientificName: speciesName, classes: groups });
        return formatSpeciesLinkSpeciesSearchAnswer(matches, speciesName || "o táxon informado", municipalityLabel(municipality));
      }
      if (intent === "summary") return formatSpeciesLinkSummaryAnswer(summarizeSpeciesLinkMunicipality(filtered));
      if (intent === "voucher") return formatSpeciesLinkVoucherAnswer(filtered);
      if (intent === "coordinates") return formatSpeciesLinkCoordinatesAnswer(filtered);

      const groupLabel = groups.length === 1 && groups[0] === "Amphibia" ? "anfíbios" : groups.length === 1 && groups[0] === "Reptilia" ? "répteis" : "anfíbios e répteis";
      if (queryOptions.responseMode === "short") return formatSpeciesLinkSummaryAnswer(summarizeSpeciesLinkMunicipality(filtered));
      return formatSpeciesLinkListAnswer(filtered, groupLabel, { wantsFullList: queryOptions.wantsFullList });
    } catch (error) {
      console.error("Falha ao responder com speciesLink:", error);
      if (error.status === SpeciesLinkStatus.MISSING_API_KEY || /chave da API não foi configurada/i.test(error.message)) return "O speciesLink ainda não está disponível porque a chave da API não foi configurada no servidor.";
      if (error.status === SpeciesLinkStatus.INVALID_API_KEY) return "O speciesLink respondeu que a chave configurada é inválida ou não autorizada.";
      if (error.status === SpeciesLinkStatus.TIMEOUT) return "O speciesLink demorou para responder. Posso tentar novamente depois.";
      if (error.status === SpeciesLinkStatus.EMPTY_RESPONSE) return "O speciesLink respondeu, mas não retornou uma resposta válida para essa consulta.";
      if (error.status === SpeciesLinkStatus.INVALID_JSON) return "O speciesLink respondeu em um formato que não consegui interpretar.";
      if (/Failed to fetch|fetch failed|ECONNREFUSED/.test(error.message)) return "Não consegui consultar o speciesLink neste momento. O proxy seguro do projeto pode não estar aberto.";
      return "Não consegui consultar o speciesLink neste momento. A consulta pode estar temporariamente indisponível ou a chave da API pode não estar configurada.";
    }
  }

  const api = {
    SPECIESLINK_PROXY_URL,
    SpeciesLinkStatus,
    CACHE_TTL_MS,
    SPECIESLINK_MUNICIPALITIES,
    cache,
    getSpeciesLinkApiKey,
    removeAccents,
    normalizeText,
    normalizeMunicipalityName,
    detectSpeciesLinkMunicipalities,
    detectSpeciesLinkTaxonomicGroup,
    detectSpeciesLinkTaxonomicGroups,
    buildSpeciesLinkSearchUrl,
    fetchWithTimeout,
    fetchSpeciesLinkRecords,
    fetchSpeciesLinkRecordsDirect,
    fetchSpeciesLinkByMunicipalityAndClass,
    fetchSpeciesLinkMunicipalityHerpetofauna,
    fetchSpeciesLinkAllMunicipalities,
    normalizeSpeciesLinkRecord,
    normalizeSpeciesLinkResponse,
    extractSpeciesLinkRecords,
    extractSpeciesLinkMetadata,
    groupSpeciesLinkByScientificName,
    summarizeSpeciesLinkMunicipality,
    filterSpeciesLinkRecords,
    searchSpeciesLinkSpeciesInMunicipality,
    answerSpeciesLinkQuestion,
    clearSpeciesLinkCache,
    deduplicateSpeciesLinkRecords,
    formatSpeciesLinkListAnswer,
    formatSpeciesLinkSummaryAnswer,
    formatSpeciesLinkComparisonAnswer,
    formatSpeciesLinkVoucherAnswer,
    formatSpeciesLinkCoordinatesAnswer,
    pluralize,
  };

  global.SpeciesLinkHerpeto = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
