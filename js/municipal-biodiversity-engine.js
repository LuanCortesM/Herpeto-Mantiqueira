(function (global) {
  const managerDefault =
    global.HerpetoDataSourceManager ||
    (typeof require === "function" ? require("./biodiversity-manager.js") : null);
  const municipalitiesDefault =
    global.HerpetoMunicipalities ||
    (typeof require === "function" ? require("./municipalities.js") : null);
  const storeDefault = typeof require === "function" ? require("./backend-biodiversity-store.js") : null;

  function removeAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalize(value) {
    return removeAccents(value).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalizeSources(sources) {
    return (sources?.length ? sources : ["inat", "specieslink", "cache"]).map((source) =>
      source === "iNaturalist" || source === "inaturalist" ? "inat" : source.toLowerCase()
    );
  }

  function createMunicipalBiodiversityEngine(dependencies = {}) {
    const manager = dependencies.manager || managerDefault;
    const municipalityConfig = dependencies.municipalities || municipalitiesDefault;
    const store = dependencies.store === undefined ? storeDefault : dependencies.store;
    const now = dependencies.now || (() => Date.now());
    const cacheMaxAgeMs = dependencies.cacheMaxAgeMs || 1000 * 60 * 60 * 24 * 7;
    let browserDatabasePromise = null;

    function findMunicipality(value) {
      const target = normalize(value);
      return municipalityConfig.MUNICIPALITIES.find((municipality) =>
        [municipality.name, ...municipality.aliases].some((alias) => normalize(alias) === target)
      ) || null;
    }

    async function readDatabase() {
      if (global.GoldBiodiversityDatabase) return global.GoldBiodiversityDatabase;
      if (store?.readDatabase) return store.readDatabase();
      if (typeof fetch === "function") {
        browserDatabasePromise ||= fetch("../backend-data/biodiversity-cache/database.json")
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
        return await browserDatabasePromise;
      }
      return null;
    }

    async function cacheDiagnostic() {
      const database = await readDatabase();
      const updatedAt = database?.updatedAt || null;
      if (!updatedAt) return { updatedAt: null, empty: true, stale: true };
      return {
        updatedAt,
        empty: false,
        stale: now() - new Date(updatedAt).getTime() >= cacheMaxAgeMs,
      };
    }

    function filterByInput(records, input) {
      const taxon = normalize(input.taxon);
      const group = normalize(input.group);
      return (records || []).filter((record) => {
        const scientific = normalize(record.nome_cientifico);
        if (taxon && !scientific.includes(taxon)) return false;
        if (!group) return true;
        if (group === "anfibios") return record.grupo === "Amphibia";
        if (group === "repteis") return record.grupo === "Reptilia";
        if (group === "sapos") return record.grupo === "Amphibia";
        if (group === "serpentes") return record.grupo === "Reptilia" && /bothrops|serp|cobra|viper/i.test(`${scientific} ${record.specieslink?.familia || ""}`);
        if (group === "lagartos") return record.grupo === "Reptilia";
        if (group === "quelonios") return record.grupo === "Reptilia";
        return true;
      });
    }

    function summarizeRecords(records, input) {
      return (records || []).map((record) => ({
        scientificName: record.nome_cientifico,
        group: record.grupo || null,
        inaturalistObservations: Number(record.inaturalist?.observacoes_municipio || 0),
        hasINaturalistObservation: Boolean(record.presente_inaturalist),
        hasSpeciesLinkRecord: Boolean(record.presente_specieslink),
        hasVoucher: Boolean(record.specieslink?.registros_material_preservado),
        hasCoordinates: Boolean(record.specieslink?.registros_com_coordenada),
        coordinateWarning: record.presente_specieslink && !record.specieslink?.registros_com_coordenada
          ? "Registro de coleção sem coordenada retornada."
          : null,
        requestedVoucher: Boolean(input.includeVouchers),
        requestedCoordinates: Boolean(input.includeCoordinates),
      }));
    }

    function mergeCacheRecord(map, name, patch = {}) {
      const scientificName = String(name || "").trim();
      if (!scientificName) return;
      const key = normalize(scientificName);
      const current = map.get(key) || {
        nome_cientifico: scientificName,
        grupo: patch.grupo || null,
        presente_inaturalist: false,
        presente_specieslink: false,
        inaturalist: null,
        specieslink: null,
      };
      current.grupo = current.grupo || patch.grupo || null;
      if (patch.inaturalist) {
        current.presente_inaturalist = true;
        current.inaturalist = {
          observacoes_municipio: Number(current.inaturalist?.observacoes_municipio || 0) + Number(patch.inaturalist.observacoes_municipio || 0),
        };
      }
      if (patch.specieslink) {
        current.presente_specieslink = true;
        current.specieslink = {
          familia: current.specieslink?.familia || patch.specieslink.familia || null,
          total_registros: Number(current.specieslink?.total_registros || 0) + Number(patch.specieslink.total_registros || 0),
          registros_material_preservado: Boolean(current.specieslink?.registros_material_preservado || patch.specieslink.registros_material_preservado),
          registros_com_coordenada: Boolean(current.specieslink?.registros_com_coordenada || patch.specieslink.registros_com_coordenada),
        };
      }
      map.set(key, current);
    }

    async function recordsFromCache(municipality) {
      const database = await readDatabase();
      const map = new Map();
      const inatSnapshots = Object.values(database?.sources?.inaturalist?.snapshots || {})
        .filter((snapshot) => snapshot.municipalityId === municipality.id || String(snapshot.key || "").startsWith(`${municipality.id}:`));
      for (const snapshot of inatSnapshots) {
        for (const item of snapshot.payload?.results || []) {
          mergeCacheRecord(map, item.taxon?.name, {
            grupo: item.taxon?.iconic_taxon_name || null,
            inaturalist: { observacoes_municipio: item.count || 0 },
          });
        }
      }
      const speciesLinkSnapshots = Object.values(database?.sources?.specieslink?.snapshots || {})
        .filter((snapshot) => snapshot.municipalityId === municipality.id || String(snapshot.key || "").startsWith(`${municipality.id}:`));
      for (const snapshot of speciesLinkSnapshots) {
        for (const record of snapshot.payload?.records || []) {
          mergeCacheRecord(map, record.scientificName, {
            grupo: record.className || snapshot.taxonClass || null,
            specieslink: {
              familia: record.family || null,
              total_registros: 1,
              registros_material_preservado: /preservedspecimen|specimen|occurrence/i.test(String(record.basisOfRecord || "")),
              registros_com_coordenada: Boolean(record.hasCoordinates || record.decimalLatitude || record.decimalLongitude),
            },
          });
        }
      }
      return Array.from(map.values());
    }

    async function queryMunicipality(input = {}) {
      const municipality = findMunicipality(input.municipality);
      const cache = await cacheDiagnostic();
      if (!municipality) {
        return {
          municipality: input.municipality || "",
          queryType: "unsupported_municipality",
          recordsSummary: [],
          sourcesUsed: [],
          sourceFailures: [],
          uncertaintyNotes: ["Os dados estruturados municipais do Gold cobrem apenas os oito municípios configurados do Vale Histórico."],
          lastCacheUpdate: cache.updatedAt,
          finalInterpretation: "Posso responder perguntas gerais, mas não consultar dados estruturados municipais para essa localidade.",
        };
      }
      const requestedSources = normalizeSources(input.sources);
      let comparison = null;
      try {
        comparison = await manager.compareSourcesForMunicipality(municipality, {
          groups: input.group === "anfibios" || input.group === "sapos" ? ["Amphibia"]
            : input.group ? ["Reptilia"] : ["Amphibia", "Reptilia"],
        });
      } catch (error) {
        comparison = {
          combined: [],
          fontes_disponiveis: [],
          fontes_indisponiveis: ["iNaturalist", "speciesLink"],
          error: error.message || "Falha ao consultar fontes ao vivo.",
        };
      }
      const cacheRecords = cache.empty ? [] : await recordsFromCache(municipality);
      if ((!comparison.combined || !comparison.combined.length) && cacheRecords.length) {
        comparison = {
          ...comparison,
          combined: cacheRecords,
          fontes_disponiveis: [...new Set([...(comparison.fontes_disponiveis || []), "cache"])],
        };
      }
      const available = comparison.fontes_disponiveis || [];
      const unavailable = comparison.fontes_indisponiveis || [];
      const sourcesUsed = [
        requestedSources.includes("inat") && available.includes("iNaturalist") ? "inat" : null,
        requestedSources.includes("specieslink") && available.includes("speciesLink") ? "specieslink" : null,
        requestedSources.includes("cache") && !cache.empty ? "cache" : null,
      ].filter(Boolean);
      const sourceFailures = [
        requestedSources.includes("inat") && unavailable.includes("iNaturalist") ? "inat" : null,
        requestedSources.includes("specieslink") && unavailable.includes("speciesLink") ? "specieslink" : null,
        requestedSources.includes("cache") && cache.empty ? "cache_empty" : null,
      ].filter(Boolean);
      const filtered = filterByInput(comparison.combined, input);
      const uncertaintyNotes = [
        "Ausência de retorno não significa ausência real na natureza.",
        "Observação do iNaturalist não é equivalente a voucher de coleção.",
        unavailable.length ? `Fontes indisponíveis nesta consulta: ${unavailable.join(", ")}.` : null,
        cache.empty ? "O cache local está vazio." : null,
        cache.stale && !cache.empty ? "O cache local está antigo e deve ser atualizado." : null,
        filtered.some((record) => record.presente_specieslink && !record.specieslink?.registros_com_coordenada)
          ? "Há registros de coleção sem coordenada retornada ou sem precisão espacial suficiente para interpretação automática."
          : null,
      ].filter(Boolean);
      return {
        municipality: municipality.name,
        queryType: input.taxon ? "municipal_taxon_query" : input.group ? "municipal_group_query" : "municipal_herpetofauna_query",
        recordsSummary: summarizeRecords(filtered, input),
        sourcesUsed,
        sourceFailures,
        uncertaintyNotes,
        lastCacheUpdate: cache.updatedAt,
        finalInterpretation: filtered.length
          ? `Foram recuperados ${filtered.length} táxons para os filtros informados. Interprete como registros disponíveis nas fontes consultadas, não como inventário completo.`
          : "Nenhum registro correspondente foi retornado pelos filtros atuais. Isso não demonstra ausência real da espécie ou grupo no município.",
      };
    }

    async function compareMunicipalities(inputs = []) {
      const results = [];
      for (const input of inputs) results.push(await queryMunicipality(input));
      return {
        queryType: "municipal_comparison",
        municipalities: results,
        finalInterpretation: "A comparação descreve registros disponíveis por município. Diferenças podem refletir esforço amostral, acesso, cobertura das fontes e histórico de coleta, não biodiversidade real.",
      };
    }

    return { normalize, normalizeSources, findMunicipality, cacheDiagnostic, recordsFromCache, filterByInput, summarizeRecords, queryMunicipality, compareMunicipalities };
  }

  const api = createMunicipalBiodiversityEngine();
  api.createMunicipalBiodiversityEngine = createMunicipalBiodiversityEngine;
  global.GoldMunicipalBiodiversityEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
