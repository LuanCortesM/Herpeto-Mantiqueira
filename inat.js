(function (global) {
  const INAT_BASE_URL = "https://api.inaturalist.org/v1/observations/species_counts";
  const INAT_PROXY_URL = "/api/inaturalist/species-counts";
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
  const municipalityConfig =
    global.HerpetoMunicipalities ||
    (typeof require === "function" ? require("./municipalities.js") : null);

  const MUNICIPALITIES = municipalityConfig.toINaturalistMap();

  const cache = new Map();

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

  function normalizeMunicipalityName(input) {
    const normalized = normalizeText(input);
    const exact = Object.keys(MUNICIPALITIES).find((key) => normalizeText(key) === normalized);
    if (exact) return exact;

    const partial = Object.keys(MUNICIPALITIES).find((key) => {
      const normalizedKey = normalizeText(key);
      const normalizedName = normalizeText(MUNICIPALITIES[key].name);
      return normalized.includes(normalizedKey) || normalized.includes(normalizedName);
    });

    return partial || normalized;
  }

  function uniqueMunicipalities() {
    return Object.values(MUNICIPALITIES).filter(
      (value, index, array) => array.findIndex((item) => item.placeId === value.placeId) === index
    );
  }

  function detectMunicipality(question) {
    const normalizedQuestion = normalizeText(question);
    const detected = [];
    Object.entries(MUNICIPALITIES).forEach(([key, municipality]) => {
      const normalizedKey = normalizeText(key);
      const normalizedName = normalizeText(municipality.name);
      const nameWithoutState = normalizedName.replace(/\bsp\b/g, "").trim();

      if (
        normalizedQuestion.includes(normalizedKey) ||
        normalizedQuestion.includes(normalizedName) ||
        normalizedQuestion.includes(nameWithoutState)
      ) {
        if (!detected.some((item) => item.placeId === municipality.placeId)) {
          detected.push(municipality);
        }
      }
    });

    if (detected.length) return detected;
    if (/\b(todos|todas|vale historico|regiao|região|municipios|municípios)\b/.test(normalizedQuestion)) {
      return uniqueMunicipalities();
    }
    return detected;
  }

  const detectMunicipalities = detectMunicipality;

  function detectTaxonomicGroup(question) {
    const q = normalizeText(question);
    const amphibianTerms = ["anfibio", "anfibios", "amphibia", "anuro", "anuros", "sapo", "sapos", "ra", "ras", "perereca", "pererecas", "girino", "girinos"];
    const reptileTerms = ["reptil", "repteis", "reptilia", "serpente", "serpentes", "cobra", "cobras", "jararaca", "jararacas", "lagarto", "lagartos", "teiu", "teius", "quelonio", "quelonios", "tartaruga", "tartarugas"];
    const wantsAmphibia = amphibianTerms.some((term) => new RegExp(`\\b${term}\\b`).test(q));
    const wantsReptilia = reptileTerms.some((term) => new RegExp(`\\b${term}\\b`).test(q));

    if (q.includes("herpetofauna") || (wantsAmphibia && wantsReptilia)) return ["Amphibia", "Reptilia"];
    if (wantsAmphibia) return ["Amphibia"];
    if (wantsReptilia) return ["Reptilia"];
    return ["Amphibia", "Reptilia"];
  }

  function buildINatSpeciesCountsUrl(placeId, options = {}) {
    const params = new URLSearchParams();
    params.set("place_id", String(placeId));
    params.append("iconic_taxa[]", "Amphibia");
    params.append("iconic_taxa[]", "Reptilia");
    params.set("per_page", String(options.perPage || 500));
    if (options.verifiable === true) params.set("verifiable", "true");
    if (options.qualityGrade) params.set("quality_grade", options.qualityGrade);
    if (options.quality_grade) params.set("quality_grade", options.quality_grade);
    if (options.d1) params.set("d1", options.d1);
    if (options.d2) params.set("d2", options.d2);
    if (options.identified === true) params.set("identified", "true");
    return `${INAT_BASE_URL}?${params.toString()}`;
  }

  function stableCacheKey(placeId, options = {}) {
    const sorted = {};
    Object.keys(options)
      .sort()
      .forEach((key) => {
        if (typeof options[key] !== "undefined") sorted[key] = options[key];
      });
    return `${placeId}_${JSON.stringify(sorted)}`;
  }

  function clearINatCache() {
    cache.clear();
  }

  async function fetchWithTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      try {
        return await response.json();
      } catch (error) {
        throw new Error("JSON inválido retornado pela API.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchINatSpeciesCounts(placeId, options = {}) {
    const cacheOptions = { ...options };
    delete cacheOptions.timeoutMs;
    delete cacheOptions.forceRefresh;
    const key = stableCacheKey(placeId, cacheOptions);
    const cached = cache.get(key);
    if (!options.forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    const weeklyBaselineKeys = new Set(["perPage", "verifiable"]);
    const isWeeklyBaseline = options.verifiable === true &&
      Object.keys(options).every((option) => weeklyBaselineKeys.has(option) || ["timeoutMs", "forceRefresh"].includes(option));
    const municipality = uniqueMunicipalities().find((item) => item.placeId === Number(placeId));
    const url = isBrowser && isWeeklyBaseline && municipality?.id
      ? `${INAT_PROXY_URL}?municipalityId=${encodeURIComponent(municipality.id)}`
      : buildINatSpeciesCountsUrl(placeId, options);
    try {
      const json = await fetchWithTimeout(url, options.timeoutMs || 15000);
      if (!json || !Array.isArray(json.results)) {
        throw new Error("Resposta inválida da API do iNaturalist.");
      }
      cache.set(key, { timestamp: Date.now(), data: json });
      return json;
    } catch (error) {
      console.error("Erro técnico ao consultar iNaturalist:", error);
      if (cached?.data) return cached.data;
      throw new Error("Não consegui consultar o iNaturalist neste momento. Tente novamente mais tarde ou use os dados em cache, se disponíveis.");
    }
  }

  function normalizeINatSpeciesCounts(json, municipalityName, placeId) {
    const results = Array.isArray(json?.results) ? json.results : [];
    const consultationDate = new Date().toISOString();
    return results
      .map((item) => {
        const taxon = item?.taxon;
        if (!taxon || !taxon.id || !taxon.name) return null;
        const photo = taxon.default_photo || {};
        return {
          municipio: municipalityName,
          place_id: placeId,
          taxon_id: taxon.id || null,
          nome_cientifico: taxon.name || null,
          nome_popular: taxon.preferred_common_name || null,
          grupo: taxon.iconic_taxon_name || null,
          rank: taxon.rank || null,
          observacoes_municipio: Number(item.count || 0),
          observacoes_globais_inaturalist: Number(taxon.observations_count || 0),
          imagem: photo.medium_url || photo.square_url || null,
          url_taxon: taxon.id ? `https://www.inaturalist.org/taxa/${taxon.id}` : null,
          fonte: "iNaturalist",
          data_consulta: consultationDate,
        };
      })
      .filter(Boolean)
      .filter((record) => record.grupo === "Amphibia" || record.grupo === "Reptilia");
  }

  async function getMunicipalityHerpetofauna(municipalityName, options = {}) {
    const municipality =
      typeof municipalityName === "object" && municipalityName?.placeId
        ? municipalityName
        : MUNICIPALITIES[normalizeMunicipalityName(municipalityName)];
    if (!municipality) throw new Error("Município não reconhecido.");
    const json = await fetchINatSpeciesCounts(municipality.placeId, options);
    return normalizeINatSpeciesCounts(json, municipality.name, municipality.placeId);
  }

  async function getAllMunicipalitiesHerpetofauna(options = {}) {
    const batches = await Promise.all(uniqueMunicipalities().map((municipality) => getMunicipalityHerpetofauna(municipality, options)));
    return batches.flat();
  }

  function filterRecords(records, filters = {}) {
    let output = [...(records || [])];
    if (Array.isArray(filters.groups) && filters.groups.length) {
      output = output.filter((record) => filters.groups.includes(record.grupo));
    }
    if (filters.group) {
      output = output.filter((record) => record.grupo === filters.group);
    }
    if (filters.rank) {
      output = output.filter((record) => record.rank === filters.rank);
    }
    if (filters.onlySpecies === true) {
      output = output.filter((record) => record.rank === "species");
    }
    if (Number.isFinite(Number(filters.minObservations))) {
      output = output.filter((record) => record.observacoes_municipio >= Number(filters.minObservations));
    }
    if (filters.search) {
      const search = normalizeText(filters.search);
      output = output.filter((record) => normalizeText(record.nome_cientifico).includes(search) || normalizeText(record.nome_popular).includes(search));
    }
    return output;
  }

  function summarizeMunicipality(records) {
    const list = records || [];
    const amphibians = list.filter((record) => record.grupo === "Amphibia");
    const reptiles = list.filter((record) => record.grupo === "Reptilia");
    const speciesRank = list.filter((record) => record.rank === "species");
    const nonSpeciesRank = list.filter((record) => record.rank !== "species");
    const totalObservations = list.reduce((sum, record) => sum + Number(record.observacoes_municipio || 0), 0);
    const topTaxa = [...list].sort((a, b) => b.observacoes_municipio - a.observacoes_municipio).slice(0, 10);
    return {
      municipio: list[0]?.municipio || null,
      riqueza_total_taxa: list.length,
      riqueza_anfibios: amphibians.length,
      riqueza_repteis: reptiles.length,
      registros_rank_species: speciesRank.length,
      registros_acima_de_species: nonSpeciesRank.length,
      total_observacoes: totalObservations,
      taxa_mais_registrados: topTaxa,
    };
  }

  async function compareMunicipalities(options = {}) {
    const comparison = [];
    for (const municipality of uniqueMunicipalities()) {
      const records = filterRecords(await getMunicipalityHerpetofauna(municipality, options), options.filters || {});
      comparison.push({ municipio: municipality.name, place_id: municipality.placeId, summary: summarizeMunicipality(records), records });
    }
    return addSharedAndExclusiveTaxa(comparison);
  }

  function addSharedAndExclusiveTaxa(comparison) {
    const taxaByMunicipality = comparison.map((item) => new Set(item.records.filter((r) => r.rank === "species").map((r) => normalizeText(r.nome_cientifico))));
    const shared = [...(taxaByMunicipality[0] || [])].filter((name) => taxaByMunicipality.every((set) => set.has(name)));
    comparison.forEach((item, index) => {
      const otherTaxa = new Set(taxaByMunicipality.flatMap((set, setIndex) => (setIndex === index ? [] : [...set])));
      item.especies_compartilhadas = shared;
      item.especies_exclusivas = item.records
        .filter((record) => record.rank === "species" && !otherTaxa.has(normalizeText(record.nome_cientifico)))
        .map((record) => record.nome_cientifico);
    });
    return comparison;
  }

  async function searchSpeciesInMunicipality(speciesName, municipalityName, options = {}) {
    const records = await getMunicipalityHerpetofauna(municipalityName, options);
    return filterRecords(records, { search: speciesName });
  }

  function detectQueryOptions(question) {
    const q = normalizeText(question);
    const options = { verifiable: true, perPage: 500 };
    if (/\b(restrito|conservador|research|grau de pesquisa|cientifico|científico)\b/.test(q)) {
      delete options.verifiable;
      options.qualityGrade = "research";
    }
    if (/\b(exploratorio|exploratório|sem filtro|menos filtrado)\b/.test(q)) {
      delete options.verifiable;
      delete options.qualityGrade;
      options.exploratory = true;
    }
    if (/\bidentificado|identificados|identified\b/.test(q)) options.identified = true;

    const dates = String(question).match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    if (dates[0]) options.d1 = dates[0];
    if (dates[1]) options.d2 = dates[1];
    return options;
  }

  function detectIntent(question, municipalities) {
    const q = normalizeText(question);
    const hasGroupTerm = /\b(anfibio|anfibios|amphibia|sapo|sapos|ra|ras|perereca|pererecas|reptil|repteis|reptilia|cobra|cobras|serpente|serpentes|lagarto|lagartos|herpetofauna)\b/.test(q);
    const hasScientificBinomial = (String(question || "").match(/\b[A-Z][a-z]+ [a-z][a-z-]+\b/g) || []).some((match) => {
      const normalizedMatch = normalizeText(match);
      return !/^(quais|qual|liste|resumo|compare|quantos|quantas|sao|são) /.test(normalizedMatch) && !/\b(anfibio|anfibios|reptil|repteis|especies|espécies|registros)\b/.test(normalizedMatch);
    });
    if (/\b(confiavel|confiáveis|confiaveis|inventario completo|inventário completo|metodolog|vies|viés|validar|validacao|validação)\b/.test(q)) return "methodology";
    if (municipalities.length > 1 || /\b(compare|comparar|comparacao|comparação|qual cidade|qual municipio|qual município|mais registros|mais anfibios|mais répteis|mais repteis)\b/.test(q)) return "comparison";
    if (/\b(top|mais registrad|mais observad)\b/.test(q)) return "top";
    if (/\b(resumo|quantos|riqueza|total|registros tem)\b/.test(q)) return "summary";
    if (hasScientificBinomial || (/^(tem|ha|há|existe|aparece)\b/.test(q) && !hasGroupTerm)) return "species-search";
    return "list";
  }

  function extractSpeciesSearch(question, municipalities) {
    let text = String(question || "");
    municipalities.forEach((municipality) => {
      text = text.replace(new RegExp(municipality.name.replace("-SP", ""), "ig"), " ");
    });
    text = text
      .replace(/\b(tem|ha|há|existe|aparece|registros? de|registro de|em|no|na|nos|nas|o|a|os|as|iNaturalist|inaturalist)\b/gi, " ")
      .replace(/[?!.:,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }

  function rankWarning(record) {
    return record.rank && record.rank !== "species" ? ` [identificação em nível: ${record.rank}]` : "";
  }

  function methodologyNote(extra = "") {
    return [
      extra,
      "Nota metodológica: os dados representam registros disponíveis no iNaturalist, uma plataforma de ciência cidadã. Eles podem ter viés de esforço amostral, viés espacial, viés taxonômico e erros de identificação; portanto, não devem ser interpretados como inventário completo da herpetofauna municipal.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function noRecordsText(target = "esse filtro") {
    return `Não encontrei registros retornados pelo iNaturalist para ${target}. Isso não significa ausência real da espécie na natureza.`;
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${Number(count) === 1 ? singular : plural}`;
  }

  function shortMethodologyNote() {
    return "Fonte: iNaturalist. Registros disponíveis, não inventário completo.";
  }

  function formatSpeciesListAnswer(records, options = {}) {
    const groupLabel = options.groupLabel || "anfíbios e répteis";
    if (!records.length) return `${noRecordsText(groupLabel)}\n\n${methodologyNote()}`;
    const sorted = [...records].sort((a, b) => {
      const difference = Number(b.observacoes_municipio || 0) - Number(a.observacoes_municipio || 0);
      return difference || String(a.nome_cientifico || "").localeCompare(String(b.nome_cientifico || ""));
    });
    const limit = options.wantsFullList ? Number.MAX_SAFE_INTEGER : options.limit || 5;
    const lines = sorted.slice(0, limit).map((record, index) => {
      const commonName = record.nome_popular ? ` — ${record.nome_popular}` : "";
      return `${index + 1}. ${record.nome_cientifico}${commonName}${rankWarning(record)} — ${pluralize(record.observacoes_municipio, "observação", "observações")}`;
    });
    const additional = sorted.slice(limit, limit + 4).map((record) => record.nome_cientifico);
    const hidden = sorted.length > limit
      ? `\n\nTambém aparecem ${additional.join(", ")}${sorted.length - limit > additional.length ? " e outros registros" : ""}.\n\nQuer que eu abra a lista completa?`
      : "";
    const nonSpecies = sorted.filter((record) => record.rank !== "species").length;
    const rankNote = nonSpecies ? `\n\n${pluralize(nonSpecies, "registro")} ${nonSpecies === 1 ? "aparece" : "aparecem"} acima do nível de espécie e ${nonSpecies === 1 ? "pede" : "pedem"} revisão taxonômica.` : "";
    return `Boa. Fui olhar ${groupLabel} de ${sorted[0].municipio}.\n\nAchei ${pluralize(sorted.length, "táxon", "táxons")} no iNaturalist. ${sorted.length > limit ? "Os mais registrados foram:" : "Aqui estão os registros:"}\n\n${lines.join("\n")}${hidden}${rankNote}\n\nFonte: iNaturalist.\nNota: registros disponíveis, não inventário completo.`;
  }

  function formatSummaryAnswer(summary) {
    if (!summary?.municipio) return `${noRecordsText("esse município com os filtros atuais")}\n\n${methodologyNote()}`;
    const top = summary.taxa_mais_registrados?.[0];
    return [
      `${summary.municipio} está no meu mapa de consultas.`,
      "Pulo rápido pelos registros:",
      `- ${pluralize(summary.riqueza_total_taxa, "táxon", "táxons")} no iNaturalist`,
      `- Anfíbios: ${summary.riqueza_anfibios}`,
      `- Répteis: ${summary.riqueza_repteis}`,
      top ? `- Mais registrado: ${top.nome_cientifico}, com ${pluralize(top.observacoes_municipio, "observação", "observações")}` : "",
      summary.registros_acima_de_species ? `- ${pluralize(summary.registros_acima_de_species, "registro")} acima do nível de espécie` : "",
      "",
      "Quer ver só anfíbios, só répteis ou a lista completa?",
      "",
      "Fonte: iNaturalist.",
      "Nota: registros disponíveis, não inventário completo.",
    ].filter(Boolean).join("\n");
  }

  function formatComparisonAnswer(comparison, question = "") {
    if (!comparison.length) return `Não foi possível comparar os municípios porque nenhum dado foi retornado.\n\n${methodologyNote()}`;
    const q = normalizeText(question);
    const sorted = [...comparison].sort((a, b) => {
      if (q.includes("anfib")) return b.summary.riqueza_anfibios - a.summary.riqueza_anfibios;
      if (q.includes("rept")) return b.summary.riqueza_repteis - a.summary.riqueza_repteis;
      if (q.includes("observ")) return b.summary.total_observacoes - a.summary.total_observacoes;
      return b.summary.riqueza_total_taxa - a.summary.riqueza_total_taxa;
    });
    const lines = sorted.map((item, index) => `${index + 1}. ${item.municipio}\n   Táxons totais: ${item.summary.riqueza_total_taxa}\n   Anfíbios: ${item.summary.riqueza_anfibios}\n   Répteis: ${item.summary.riqueza_repteis}\n   Observações totais: ${item.summary.total_observacoes}`);
    const sharedCount = comparison[0]?.especies_compartilhadas?.length || 0;
    return `Comparação dos municípios segundo registros retornados pelo iNaturalist:\n\n${lines.join("\n\n")}\n\nEspécies compartilhadas entre todos os municípios neste filtro: ${sharedCount}.\n\n${methodologyNote("Cautela: espécies aparentemente exclusivas podem refletir diferença de esforço amostral, não exclusividade ecológica real.")}`;
  }

  function formatTopAnswer(records, groupLabel) {
    if (!records.length) return `${noRecordsText(groupLabel)}\n\n${methodologyNote()}`;
    const top = [...records].sort((a, b) => b.observacoes_municipio - a.observacoes_municipio).slice(0, 10);
    const lines = top.map((record, index) => `${index + 1}. ${record.nome_cientifico}${record.nome_popular ? ` — ${record.nome_popular}` : ""}${rankWarning(record)}: ${pluralize(record.observacoes_municipio, "observação", "observações")}`);
    return `Táxons mais registrados em ${top[0].municipio} para ${groupLabel}:\n\n${lines.join("\n")}\n\n${methodologyNote()}`;
  }

  function formatSpeciesSearchAnswer(matches, speciesName, municipalityName) {
    if (!matches.length) {
      return `Não encontrei ${speciesName} nos registros retornados pelo iNaturalist para ${municipalityName} com os filtros atuais. Isso não significa ausência real da espécie na natureza; significa apenas que a API não retornou registro correspondente para essa consulta.\n\n${methodologyNote()}`;
    }
    const lines = matches.map((record, index) => `${index + 1}. ${record.nome_cientifico}${record.nome_popular ? ` — ${record.nome_popular}` : ""}${rankWarning(record)}\n   Grupo: ${record.grupo}\n   Observações no município: ${record.observacoes_municipio}\n   Link: ${record.url_taxon || "não disponível"}`);
    return `Encontrei correspondência nos registros retornados pelo iNaturalist para ${municipalityName}:\n\n${lines.join("\n\n")}\n\n${methodologyNote("Busca feita por correspondência parcial em nome científico e nome popular.")}`;
  }

  function methodologyAnswer() {
    return "Os dados do iNaturalist são úteis para divulgação, educação ambiental e exploração inicial, mas não são inventário completo. Eles vêm de ciência cidadã e podem refletir viés de esforço amostral, viés espacial, viés taxonômico e erros de identificação. Para um modo mais conservador, use registros com quality_grade=research; para o modo padrão deste chatbox, uso verifiable=true quando consulto a API.";
  }

  async function answerUserQuestion(question, options = {}) {
    const municipalities = detectMunicipality(question);
    const groups = detectTaxonomicGroup(question);
    const queryOptions = { ...detectQueryOptions(question), ...options };
    const intent = detectIntent(question, municipalities);
    const groupLabel = groups.length === 1 && groups[0] === "Amphibia" ? "anfíbios" : groups.length === 1 && groups[0] === "Reptilia" ? "répteis" : "anfíbios e répteis";

    if (intent === "methodology") return methodologyAnswer();
    if (!municipalities.length) {
      return "Não identifiquei um município válido na pergunta. Municípios disponíveis: Lavrinhas, Queluz, Silveiras, Bananal, Areias, São José do Barreiro, Arapeí e Cruzeiro.";
    }

    try {
      if (intent === "comparison") {
        queryOptions.filters = { groups };
        return formatComparisonAnswer(await compareMunicipalities(queryOptions), question);
      }

      const municipality = municipalities[0];
      const records = await getMunicipalityHerpetofauna(municipality, queryOptions);
      let filtered = filterRecords(records, { groups });
      if (/\b(especies|espécies|lista cientifica|lista científica|rank species)\b/.test(normalizeText(question))) {
        filtered = filterRecords(filtered, { rank: "species" });
      }

      if (intent === "summary") return formatSummaryAnswer(summarizeMunicipality(filtered));
      if (intent === "top") return formatTopAnswer(filtered, groupLabel);
      if (intent === "species-search") {
        const speciesName = extractSpeciesSearch(question, municipalities);
        const matches = filterRecords(records, { search: speciesName, groups });
        return formatSpeciesSearchAnswer(matches, speciesName || "o táxon informado", municipality.name);
      }
      if (queryOptions.responseMode === "short") return formatSummaryAnswer(summarizeMunicipality(filtered));
      return formatSpeciesListAnswer(filtered, { groupLabel, wantsFullList: queryOptions.wantsFullList });
    } catch (error) {
      console.error("Falha ao responder com iNaturalist:", error);
      return "Não consegui consultar o iNaturalist neste momento. Tente novamente mais tarde ou use os dados em cache, se disponíveis.";
    }
  }

  const api = {
    INAT_BASE_URL,
    MUNICIPALITIES,
    CACHE_TTL_MS,
    cache,
    removeAccents,
    normalizeText,
    normalizeMunicipalityName,
    detectMunicipality,
    detectMunicipalities,
    detectTaxonomicGroup,
    buildINatSpeciesCountsUrl,
    fetchWithTimeout,
    fetchINatSpeciesCounts,
    normalizeINatSpeciesCounts,
    getMunicipalityHerpetofauna,
    getAllMunicipalitiesHerpetofauna,
    filterRecords,
    summarizeMunicipality,
    compareMunicipalities,
    searchSpeciesInMunicipality,
    answerUserQuestion,
    clearINatCache,
    formatSpeciesListAnswer,
    formatSummaryAnswer,
    formatComparisonAnswer,
    pluralize,
  };

  global.INatHerpeto = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
