(function (global) {
  const inatDefault =
    global.INatHerpeto ||
    (typeof require === "function" ? require("./inat.js") : null);
  const speciesLinkDefault =
    global.SpeciesLinkHerpeto ||
    (typeof require === "function" ? require("./specieslink.js") : null);
  const storeDefault =
    global.GoldBiodiversityStore ||
    (typeof require === "function" ? require("./backend-biodiversity-store.js") : null);

  const COMBINED_NOTE =
    "Os dados combinam registros do iNaturalist e do speciesLink. O iNaturalist representa principalmente observações de ciência cidadã, enquanto o speciesLink reúne registros de coleções e bases biológicas. A união das fontes amplia a cobertura, mas ainda não representa inventário completo da herpetofauna local.";

  function createManager(dependencies = {}) {
    const inat = dependencies.inat || inatDefault;
    const speciesLink = dependencies.speciesLink || speciesLinkDefault;
    const hasInjectedSources = Boolean(dependencies.inat || dependencies.speciesLink);
    const store = dependencies.store === undefined ? (hasInjectedSources ? null : storeDefault) : dependencies.store;

    function removeAccents(text) {
      return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function normalizeText(text) {
      return removeAccents(text)
        .toLowerCase()
        .replace(/[-_/.,;:()[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeScientificName(name) {
      return removeAccents(String(name || ""))
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    function decideDataSources(question) {
      const q = normalizeText(question);
      const asksINat =
        /\b(inaturalist|foto|fotos|fotografado|fotografada|observado|observada|observacao|observacoes|ciencia cidada|usuarios|mais visto|mais observad|registros recentes|registros populares)\b/.test(q);
      const asksSpeciesLink =
        /\b(specieslink|voucher|vouchers|colecao|colecoes|museu|instituicao|catalogo|material preservado|tombo|coleta|coletado|registro historico|coordenada de colecao|dado cientifico)\b/.test(q);
      const asksCombined =
        /\b(ambas|duas fontes|todas as fontes|juntar|combinad|compare fontes|comparar fontes|registros disponiveis|herpetofauna registrada|fonte conjunta|visao geral|lista completa possivel)\b/.test(q);

      if (asksCombined || (asksINat && asksSpeciesLink)) return ["iNaturalist", "speciesLink"];
      if (asksINat) return ["iNaturalist"];
      if (asksSpeciesLink) return ["speciesLink"];
      return ["iNaturalist", "speciesLink"];
    }

    function createEvidenceBundle(queryPlan = {}) {
      return {
        queryPlan,
        sourcesRequested: queryPlan.sourcesRequested || [],
        sourcesSucceeded: [],
        sourcesFailed: [],
        filtersApplied: queryPlan.filters || {},
        rawCounts: {},
        normalizedRecords: [],
        combinedRecords: [],
        generatedAt: new Date().toISOString(),
        limitations: [],
        warnings: [],
        sourceStatus: {
          iNaturalist: { requested: false, success: false, error: null },
          speciesLink: { requested: false, success: false, error: null },
        },
      };
    }

    function isFailureAnswer(answer) {
      return /\b(n[aã]o consegui consultar|chave da api specieslink n[aã]o configurada|temporariamente indispon[ií]vel|specieslink ainda n[aã]o est[aá] dispon[ií]vel|specieslink ainda n[aã]o est[aá] ativo)\b/i.test(String(answer || ""));
    }

    function recordEvidenceFromAnswer(evidence, answer) {
      evidence.sourcesRequested.forEach((source) => { evidence.sourceStatus[source].requested = true; });
      const text = String(answer || "");
      if (/Fontes (consultadas|usadas): iNaturalist e speciesLink\./i.test(text)) {
        evidence.sourcesSucceeded = ["iNaturalist", "speciesLink"];
      } else {
        if (/Fonte (consultada com sucesso|consultada|usada): [^.]*iNaturalist/i.test(text)) evidence.sourcesSucceeded.push("iNaturalist");
        if (/Fonte (consultada com sucesso|consultada|usada): [^.]*speciesLink/i.test(text)) evidence.sourcesSucceeded.push("speciesLink");
      }
      if (/Fonte indisponível no momento: [^.]*iNaturalist/i.test(text)) evidence.sourcesFailed.push("iNaturalist");
      if (/Fonte indisponível no momento: [^.]*speciesLink/i.test(text)) evidence.sourcesFailed.push("speciesLink");
      evidence.sourcesRequested.forEach((source) => {
        if (!evidence.sourcesSucceeded.includes(source) && !evidence.sourcesFailed.includes(source)) {
          (isFailureAnswer(text) ? evidence.sourcesFailed : evidence.sourcesSucceeded).push(source);
        }
      });
      evidence.sourcesSucceeded = [...new Set(evidence.sourcesSucceeded)];
      evidence.sourcesFailed = [...new Set(evidence.sourcesFailed)];
      evidence.sourcesSucceeded.forEach((source) => { evidence.sourceStatus[source].success = true; });
      evidence.sourcesFailed.forEach((source) => {
        evidence.sourceStatus[source].success = false;
        evidence.sourceStatus[source].error = "Consulta indisponível ou não concluída.";
      });
      return evidence;
    }

    function detectMunicipalities(question) {
      return inat.detectMunicipality(question);
    }

    function detectTaxonomicGroups(question) {
      return inat.detectTaxonomicGroup(question);
    }

    function normalizeINaturalistData(rawData, municipality) {
      if (Array.isArray(rawData)) return rawData;
      return inat.normalizeINatSpeciesCounts(
        rawData,
        municipality?.name || municipality?.municipio || null,
        municipality?.placeId || municipality?.place_id || null
      );
    }

    function speciesLinkMunicipalityFrom(municipality) {
      const name = typeof municipality === "string" ? municipality : municipality?.name;
      return speciesLink.normalizeMunicipalityName(name);
    }

    function normalizeSpeciesLinkData(rawData, municipality) {
      if (Array.isArray(rawData)) return rawData;
      const label =
        municipality?.displayName ||
        municipality?.name ||
        municipality?.municipio ||
        String(municipality || "");
      return speciesLink.normalizeSpeciesLinkResponse(rawData, label);
    }

    function databaseSummary() {
      try {
        return store?.summary?.() || null;
      } catch {
        return null;
      }
    }

    function cachedSnapshots(source, municipality, groups = []) {
      const database = store?.readDatabase?.() || null;
      const snapshots = Object.values(database?.sources?.[source]?.snapshots || {});
      return snapshots.filter((snapshot) => {
        const matchesMunicipality =
          snapshot.municipalityId === municipality.id ||
          String(snapshot.key || "").startsWith(`${municipality.id}:`);
        if (!matchesMunicipality) return false;
        if (source !== "specieslink" || !groups.length) return true;
        return !snapshot.taxonClass || groups.includes(snapshot.taxonClass);
      });
    }

    function getCachedINaturalistMunicipalityData(municipality) {
      return cachedSnapshots("inaturalist", municipality)
        .flatMap((snapshot) => normalizeINaturalistData(snapshot.payload, municipality));
    }

    function getCachedSpeciesLinkMunicipalityData(municipality, groups = []) {
      return cachedSnapshots("specieslink", municipality, groups)
        .flatMap((snapshot) => normalizeSpeciesLinkData(snapshot.payload, municipality));
    }

    function hasFreshINaturalistSnapshot(municipality) {
      const snapshots = cachedSnapshots("inaturalist", municipality);
      return snapshots.length > 0 && snapshots.some((snapshot) => !store?.isStale?.(snapshot));
    }

    function hasFreshSpeciesLinkSnapshots(municipality, groups = []) {
      const targetGroups = groups.length ? groups : ["Amphibia", "Reptilia"];
      return targetGroups.every((group) => {
        const snapshots = cachedSnapshots("specieslink", municipality, [group]);
        return snapshots.length > 0 && snapshots.some((snapshot) => !store?.isStale?.(snapshot));
      });
    }

    function cacheSourceNote(comparison) {
      const sources = comparison.cacheFallbackSources?.length
        ? comparison.cacheFallbackSources
        : comparison.cacheLocalSources || [];
      if (!sources.length) return "";
      const reason = comparison.cacheFallbackSources?.length
        ? "porque a consulta ao vivo falhou"
        : "para evitar consultas repetidas às APIs";
      const when = comparison.cacheUpdatedAt
        ? ` Última atualização local: ${new Date(comparison.cacheUpdatedAt).toLocaleString("pt-BR")}.`
        : "";
      return `Usei a base local baixada para ${sources.join(" e ")} ${reason}.${when}`;
    }

    async function getINaturalistMunicipalityData(municipality, options = {}) {
      return inat.getMunicipalityHerpetofauna(municipality, options.inaturalist || options);
    }

    async function getSpeciesLinkMunicipalityData(municipality, options = {}) {
      const target = speciesLinkMunicipalityFrom(municipality);
      if (!target) throw new Error("Município não reconhecido pelo speciesLink.");
      const queryOptions = { ...(options.speciesLink || options) };
      if (options.groups) queryOptions.groups = options.groups;
      return speciesLink.fetchSpeciesLinkMunicipalityHerpetofauna(target, queryOptions);
    }

    function mergeBiodiversitySources(inatRecords, speciesLinkRecords) {
      const map = new Map();
      const groupedSpeciesLink = speciesLink.groupSpeciesLinkByScientificName(speciesLinkRecords || []);

      for (const record of inatRecords || []) {
        const key = normalizeScientificName(record.nome_cientifico);
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, {
            municipio: record.municipio,
            nome_cientifico: record.nome_cientifico,
            grupo: record.grupo,
            rank: record.rank || null,
            fontes: [],
            presente_inaturalist: false,
            presente_specieslink: false,
            inaturalist: null,
            specieslink: null,
          });
        }
        const item = map.get(key);
        item.presente_inaturalist = true;
        if (!item.fontes.includes("iNaturalist")) item.fontes.push("iNaturalist");
        item.inaturalist = {
          taxon_id: record.taxon_id,
          nome_popular: record.nome_popular,
          rank: record.rank,
          observacoes_municipio: Number(record.observacoes_municipio || 0),
          imagem: record.imagem,
          url_taxon: record.url_taxon,
        };
        if (!item.grupo) item.grupo = record.grupo;
      }

      for (const record of groupedSpeciesLink) {
        const key = normalizeScientificName(record.nome_cientifico);
        if (!key || key === "nome científico não informado") continue;
        if (!map.has(key)) {
          map.set(key, {
            municipio: record.municipios?.[0] || null,
            nome_cientifico: record.nome_cientifico,
            grupo: record.classe,
            rank: null,
            fontes: [],
            presente_inaturalist: false,
            presente_specieslink: false,
            inaturalist: null,
            specieslink: null,
          });
        }
        const item = map.get(key);
        item.presente_specieslink = true;
        if (!item.fontes.includes("speciesLink")) item.fontes.push("speciesLink");
        item.specieslink = {
          total_registros: Number(record.total_registros || 0),
          registros_com_coordenada: Number(record.registros_com_coordenada || 0),
          registros_sem_coordenada: Number(record.registros_sem_coordenada || 0),
          registros_material_preservado: (record.tipos_registro || []).some(
            (type) => normalizeText(type).includes("preservedspecimen")
          ),
          instituicoes: record.instituicoes || [],
          colecoes: record.colecoes || [],
          tipos_registro: record.tipos_registro || [],
          anos_coleta: record.anos_coleta || [],
          primeiro_ano: record.primeiro_ano || null,
          ultimo_ano: record.ultimo_ano || null,
          exemplos_catalogo: record.exemplos_catalogo || [],
        };
        if (!item.grupo) item.grupo = record.classe;
      }

      return [...map.values()]
        .map((item) => {
          let nivelDocumentacao = "registro em uma fonte";
          let observacaoMetodologica = "Táxon retornado por uma das fontes consultadas.";
          if (item.presente_inaturalist && item.presente_specieslink) {
            nivelDocumentacao = "observação pública + registro técnico-científico";
            observacaoMetodologica = "Táxon registrado nas duas fontes.";
          } else if (item.presente_inaturalist) {
            nivelDocumentacao = "observação pública";
            observacaoMetodologica = "Táxon retornado somente pelo iNaturalist com os filtros atuais.";
          } else if (item.presente_specieslink) {
            nivelDocumentacao = "registro técnico-científico";
            observacaoMetodologica = "Táxon retornado somente pelo speciesLink com os filtros atuais.";
          }
          return { ...item, nivel_documentacao: nivelDocumentacao, observacao_metodologica: observacaoMetodologica };
        })
        .sort((a, b) => a.nome_cientifico.localeCompare(b.nome_cientifico));
    }

    function summarizeCombinedSources(combinedRecords) {
      const records = combinedRecords || [];
      return {
        total_combinado: records.length,
        presentes_nas_duas_fontes: records.filter((record) => record.presente_inaturalist && record.presente_specieslink).length,
        apenas_inaturalist: records.filter((record) => record.presente_inaturalist && !record.presente_specieslink).length,
        apenas_specieslink: records.filter((record) => !record.presente_inaturalist && record.presente_specieslink).length,
        anfibios: records.filter((record) => record.grupo === "Amphibia").length,
        repteis: records.filter((record) => record.grupo === "Reptilia").length,
      };
    }

    function filterCombinedRecords(records, groups) {
      if (!Array.isArray(groups) || !groups.length) return records || [];
      return (records || []).filter((record) => groups.includes(record.grupo));
    }

    function filterCombinedRecordsByTaxon(records, taxonFilter) {
      const normalizedFilter = normalizeScientificName(taxonFilter);
      if (!normalizedFilter) return records || [];
      return (records || []).filter((record) =>
        normalizeScientificName(record.nome_cientifico).startsWith(`${normalizedFilter} `)
      );
    }

    function countSpeciesLinkVouchers(records) {
      return (records || []).filter((record) => normalizeText(record.tipo_registro).includes("preservedspecimen")).length;
    }

    function pluralize(count, singular, plural = `${singular}s`) {
      return `${count} ${Number(count) === 1 ? singular : plural}`;
    }

    function pluralizeObservation(count) {
      return pluralize(count, "observação", "observações");
    }

    function pluralizeTaxa(count) {
      return pluralize(count, "táxon", "táxons");
    }

    function pluralizeRecord(count) {
      return pluralize(count, "registro", "registros");
    }

    function getPersonalityPrefix(context = "summary") {
      const prefixes = {
        summary: "Pulo rápido pelos dados:",
        finding: "Boa, achei alguns registros.",
        caution: "Opa, aqui preciso ser cuidadoso:",
        method: "Como bom sapinho desconfiado, eu não chamaria isso de inventário completo.",
      };
      return prefixes[context] || "";
    }

    function describeSourceStatus(comparison) {
      const available = comparison.fontes_disponiveis || [];
      const unavailable = comparison.fontes_indisponiveis || [];
      if (!available.length) return "Não consegui consultar as fontes agora.";
      if (available.length === 2 && !unavailable.length) return "Fontes usadas: iNaturalist e speciesLink.";
      if (available.includes("iNaturalist") && unavailable.includes("speciesLink")) {
        return "Fonte usada: iNaturalist. speciesLink indisponível no momento.";
      }
      if (available.includes("speciesLink") && unavailable.includes("iNaturalist")) {
        return "Fonte usada: speciesLink. iNaturalist indisponível no momento.";
      }
      return `Fonte usada: ${available.join(" e ")}.`;
    }

    function sourceUsageNote(comparison) {
      const available = comparison.fontes_disponiveis || [];
      if (available.length === 2) return "Combinei iNaturalist e speciesLink nesta resposta.";
      if (available.includes("iNaturalist")) return "Usei apenas o iNaturalist nesta resposta.";
      if (available.includes("speciesLink")) return "Usei apenas o speciesLink nesta resposta.";
      return "";
    }

    function cleanSourceStatus(comparison) {
      const available = comparison.fontes_disponiveis || [];
      const unavailable = comparison.fontes_indisponiveis || [];
      if (available.length === 2 && !unavailable.length) return "Fontes: iNaturalist e speciesLink.";
      if (available.includes("iNaturalist")) {
        return `Fonte: iNaturalist.${unavailable.includes("speciesLink") ? " speciesLink ainda não está ativo." : ""}`;
      }
      if (available.includes("speciesLink")) {
        return `Fonte: speciesLink.${unavailable.includes("iNaturalist") ? " iNaturalist não respondeu agora." : ""}`;
      }
      return "Não consegui consultar as fontes agora.";
    }

    function generateMethodologicalNote(level = "short", comparison = null) {
      if (level === "short") return "Esses dados representam registros disponíveis, não um inventário completo.";
      if (level === "medium") {
        return "Interpretação: as bases mostram registros disponíveis. Diferenças podem refletir esforço amostral, histórico de coletas e qualidade da georreferência.";
      }
      return comparison?.fontes_disponiveis?.length === 2
        ? COMBINED_NOTE
        : "A fonte disponível ajuda a explorar registros documentados, mas não substitui inventário de campo, validação taxonômica e análise do esforço amostral.";
    }

    function generateSourceUnavailableAnswer(source, municipality = null) {
      const target = municipality ? ` ${municipality}` : "";
      if (source === "speciesLink") {
        return [
          `Entendi: você quer consultar${target} no speciesLink.`,
          "Essa fonte ainda não está ativa no servidor porque a chave da API não foi configurada no backend. Quando a SPECIESLINK_API_KEY estiver configurada, eu consigo buscar vouchers, coleções e números de catálogo.",
          "Por enquanto, posso seguir com o iNaturalist.",
          "Fonte indisponível no momento: speciesLink.",
        ].join("\n\n");
      }
      return `Não consegui consultar o iNaturalist${target} agora. Tente novamente mais tarde.\n\nFonte indisponível no momento: iNaturalist.`;
    }

    function generateContextualSourceSwitchAnswer(source, municipality, available = true) {
      if (!available) return generateSourceUnavailableAnswer(source, municipality);
      return `Entendi: você quer consultar ${municipality} no ${source}.`;
    }

    function appendSourceOnce(answer, source) {
      return /\bFonte(s| usada| usadas)?:/i.test(String(answer || ""))
        ? answer
        : `${answer}\n\nFonte: ${source}.`;
    }

    async function compareSourcesForMunicipality(municipality, options = {}) {
      const groups = options.groups || ["Amphibia", "Reptilia"];
      const useCachedINat = hasFreshINaturalistSnapshot(municipality);
      const useCachedSpeciesLink = hasFreshSpeciesLinkSnapshots(municipality, groups);
      const [inatResult, speciesLinkResult] = await Promise.allSettled([
        useCachedINat
          ? Promise.resolve({ __cacheHit: true, records: getCachedINaturalistMunicipalityData(municipality) })
          : getINaturalistMunicipalityData(municipality, options),
        useCachedSpeciesLink
          ? Promise.resolve({ __cacheHit: true, records: getCachedSpeciesLinkMunicipalityData(municipality, groups) })
          : getSpeciesLinkMunicipalityData(municipality, { ...options, groups }),
      ]);
      const cachedINatRecords =
        inatResult.status === "rejected" ? inat.filterRecords(getCachedINaturalistMunicipalityData(municipality), { groups }) : [];
      const cachedSpeciesLinkRecords =
        speciesLinkResult.status === "rejected" ? speciesLink.filterSpeciesLinkRecords(getCachedSpeciesLinkMunicipalityData(municipality, groups), { classes: groups }) : [];
      const inatRecords =
        inatResult.status === "fulfilled"
          ? inat.filterRecords(inatResult.value.__cacheHit ? inatResult.value.records : inatResult.value, { groups })
          : cachedINatRecords;
      const speciesLinkRecords =
        speciesLinkResult.status === "fulfilled"
          ? speciesLink.filterSpeciesLinkRecords(speciesLinkResult.value.__cacheHit ? speciesLinkResult.value.records : speciesLinkResult.value, { classes: groups })
          : cachedSpeciesLinkRecords;
      const cacheLocalSources = [
        inatResult.status === "fulfilled" && inatResult.value.__cacheHit ? "iNaturalist" : null,
        speciesLinkResult.status === "fulfilled" && speciesLinkResult.value.__cacheHit ? "speciesLink" : null,
      ].filter(Boolean);
      const cacheFallbackSources = [
        inatResult.status === "rejected" && cachedINatRecords.length ? "iNaturalist" : null,
        speciesLinkResult.status === "rejected" && cachedSpeciesLinkRecords.length ? "speciesLink" : null,
      ].filter(Boolean);
      const cacheInfo = databaseSummary();
      const combined = mergeBiodiversitySources(inatRecords, speciesLinkRecords);
      const summary = summarizeCombinedSources(combined);
      const sourceStatus = {
        iNaturalist: {
          requested: true,
          success: inatResult.status === "fulfilled" || cachedINatRecords.length > 0,
          status: inatResult.status === "fulfilled"
            ? inatResult.value.__cacheHit ? "weekly_local" : "success"
            : cachedINatRecords.length ? "cache_fallback" : "unavailable",
          reason: inatResult.status === "rejected" ? inatResult.reason?.message || "unavailable" : null,
        },
        speciesLink: {
          requested: true,
          success: speciesLinkResult.status === "fulfilled" || cachedSpeciesLinkRecords.length > 0,
          status: speciesLinkResult.status === "fulfilled"
            ? speciesLinkResult.value.__cacheHit ? "weekly_local" : "success"
            : cachedSpeciesLinkRecords.length ? "cache_fallback" : speciesLinkResult.reason?.status || "unavailable",
          reason:
            speciesLinkResult.status === "rejected"
              ? speciesLinkResult.reason?.status || speciesLinkResult.reason?.message || "unavailable"
              : null,
        },
      };
      return {
        municipio: municipality.name,
        total_inaturalist: inatRecords.length,
        total_specieslink: speciesLink.groupSpeciesLinkByScientificName(speciesLinkRecords).length,
        total_combinado: summary.total_combinado,
        presentes_nas_duas_fontes: combined.filter((record) => record.presente_inaturalist && record.presente_specieslink),
        apenas_inaturalist: combined.filter((record) => record.presente_inaturalist && !record.presente_specieslink),
        apenas_specieslink: combined.filter((record) => !record.presente_inaturalist && record.presente_specieslink),
        resumo_por_grupo: {
          Amphibia: summarizeCombinedSources(combined.filter((record) => record.grupo === "Amphibia")),
          Reptilia: summarizeCombinedSources(combined.filter((record) => record.grupo === "Reptilia")),
        },
        total_observacoes_inaturalist: inatRecords.reduce((sum, record) => sum + Number(record.observacoes_municipio || 0), 0),
        total_registros_specieslink: speciesLinkRecords.length,
        total_vouchers_specieslink: countSpeciesLinkVouchers(speciesLinkRecords),
        registros_com_coordenada_specieslink: speciesLinkRecords.filter((record) => record.tem_coordenada).length,
        combined,
        inatRecords,
        speciesLinkRecords,
        sourceStatus,
        cacheLocalSources,
        cacheFallbackSources,
        cacheUpdatedAt: cacheInfo?.updatedAt || null,
        fontes_disponiveis: [
          ...(inatResult.status === "fulfilled" || cachedINatRecords.length ? ["iNaturalist"] : []),
          ...(speciesLinkResult.status === "fulfilled" || cachedSpeciesLinkRecords.length ? ["speciesLink"] : []),
        ],
        fontes_indisponiveis: [
          ...(inatResult.status === "rejected" && !cachedINatRecords.length ? ["iNaturalist"] : []),
          ...(speciesLinkResult.status === "rejected" && !cachedSpeciesLinkRecords.length ? ["speciesLink"] : []),
        ],
      };
    }

    async function compareSourcesAcrossMunicipalities(options = {}) {
      const municipalities = inat.detectMunicipality("todos os municípios");
      const comparisons = [];
      for (const municipality of municipalities) {
        comparisons.push(await compareSourcesForMunicipality(municipality, options));
      }
      return comparisons;
    }

    function partialFailureNote(comparison) {
      if (!comparison.fontes_indisponiveis.length) return "";
      if (comparison.fontes_disponiveis.includes("iNaturalist") && comparison.fontes_indisponiveis.includes("speciesLink")) {
        return "Consegui consultar o iNaturalist. O speciesLink ainda não está disponível no servidor, então esta resposta usa só o iNaturalist.";
      }
      if (comparison.fontes_disponiveis.includes("speciesLink") && comparison.fontes_indisponiveis.includes("iNaturalist")) {
        return "Consegui consultar o speciesLink. O iNaturalist não respondeu agora, então esta resposta usa só o speciesLink.";
      }
      return "Não consegui consultar as fontes agora.";
    }

    function sourceDisclosure(comparison) {
      return [describeSourceStatus(comparison), cacheSourceNote(comparison)].filter(Boolean).join("\n");
    }

    function incompleteTaxonomyNote(records) {
      const incomplete = (records || []).filter((record) => {
        const name = normalizeScientificName(record.nome_cientifico);
        return record.rank && record.rank !== "species" || /\b(sp|spp|gen|cf|aff)\.?$/.test(name);
      });
      return incomplete.length
        ? `Também ${incomplete.length === 1 ? "apareceu" : "apareceram"} ${pluralizeRecord(incomplete.length)} com identificação incompleta ou acima do nível de espécie. ${incomplete.length === 1 ? "Ele é uma pista útil, mas pede" : "Eles são pistas úteis, mas pedem"} revisão taxonômica.`
        : "";
    }

    function formatCombinedItem(record, index) {
      const inatLine = record.inaturalist
        ? `   iNaturalist: ${pluralizeObservation(record.inaturalist.observacoes_municipio)}`
        : "";
      const speciesLinkLine = record.specieslink
        ? `   speciesLink: ${pluralizeRecord(record.specieslink.total_registros)}${record.specieslink.registros_material_preservado ? ", incluindo material preservado" : ""}`
        : "";
      const collections =
        record.specieslink?.colecoes?.length
          ? `   Coleções: ${record.specieslink.colecoes.join(", ")}`
          : "";
      return [`${index + 1}. ${record.nome_cientifico} — ${record.grupo || "grupo não informado"}`, inatLine, speciesLinkLine, collections]
        .filter(Boolean)
        .join("\n");
    }

    function totalForPreview(record) {
      return Number(record.inaturalist?.observacoes_municipio || 0) + Number(record.specieslink?.total_registros || 0);
    }

    function sortForPreview(records) {
      return [...(records || [])].sort((left, right) => {
        const difference = totalForPreview(right) - totalForPreview(left);
        return difference || String(left.nome_cientifico || "").localeCompare(String(right.nome_cientifico || ""));
      });
    }

    function conversationalItem(record, index, mixedGroups = false) {
      const group = mixedGroups && record.grupo ? ` — ${record.grupo}` : "";
      const inatCount = Number(record.inaturalist?.observacoes_municipio || 0);
      const speciesLinkCount = Number(record.specieslink?.total_registros || 0);
      let count = "";
      if (record.inaturalist && record.specieslink) count = `${pluralizeObservation(inatCount)}; ${pluralizeRecord(speciesLinkCount)} de coleção`;
      else if (record.inaturalist) count = pluralizeObservation(inatCount);
      else if (record.specieslink) count = pluralizeRecord(speciesLinkCount);
      return `${index + 1}. ${record.nome_cientifico}${group}${count ? ` — ${count}` : ""}`;
    }

    function openingForTaxonList(comparison, groups, options = {}) {
      const popular = options.commonTaxonTerms?.[0];
      if (popular === "sapos" || options.subgroupTerms?.includes("anuros")) return `Boa, fui olhar os sapinhos de ${comparison.municipio}.`;
      if (options.subgroupTerms?.includes("serpentes")) return `Boa, fui olhar as serpentes de ${comparison.municipio}.`;
      if (groups?.length === 1 && groups[0] === "Amphibia") return `Boa. Fui olhar os anfíbios de ${comparison.municipio}.`;
      if (groups?.length === 1 && groups[0] === "Reptilia") return `Boa. Fui olhar os répteis de ${comparison.municipio}.`;
      return `Boa. Fui olhar os registros de ${comparison.municipio}.`;
    }

    function generateQuickMunicipalityOverview(comparison, groups) {
      const records = filterCombinedRecords(comparison.combined, groups);
      const summary = summarizeCombinedSources(records);
      const top = [...records].sort((a, b) => {
        const totalA = Number(a.inaturalist?.observacoes_municipio || 0) + Number(a.specieslink?.total_registros || 0);
        const totalB = Number(b.inaturalist?.observacoes_municipio || 0) + Number(b.specieslink?.total_registros || 0);
        return totalB - totalA;
      })[0];
      const topCount = Number(top?.inaturalist?.observacoes_municipio || top?.specieslink?.total_registros || 0);
      return [
        `${comparison.municipio} está no meu mapa de consultas.`,
        getPersonalityPrefix("summary"),
        `- ${pluralizeTaxa(summary.total_combinado)} retornados`,
        `- ${pluralize(summary.anfibios, "anfíbio")}`,
        `- ${pluralize(summary.repteis, "réptil", "répteis")}`,
        top ? `- Mais registrado: ${top.nome_cientifico}, com ${top.inaturalist ? pluralizeObservation(topCount) : pluralizeRecord(topCount)}` : "",
        `- speciesLink: ${comparison.fontes_disponiveis.includes("speciesLink") ? pluralizeTaxa(comparison.total_specieslink) : "indisponível no momento"}`,
        incompleteTaxonomyNote(records),
        describeSourceStatus(comparison),
        cacheSourceNote(comparison),
        "Esses são registros disponíveis, não um inventário completo.",
        "Quer ver só anfíbios, só répteis ou a lista completa?",
      ].filter(Boolean).join("\n");
    }

    function generateTaxonListPreview(comparison, groups, options = {}) {
      const records = sortForPreview(filterCombinedRecords(comparison.combined, groups));
      const limit = options.limit || 5;
      const visible = records.slice(0, limit);
      const hidden = records.length - visible.length;
      const mixedGroups = !Array.isArray(groups) || groups.length !== 1;
      const additionalNames = records.slice(limit, limit + 4).map((record) => record.nome_cientifico);
      return [
        openingForTaxonList(comparison, groups, options),
        `Achei ${pluralizeTaxa(records.length)}${groups?.length === 1 ? ` de ${groups[0] === "Amphibia" ? "anfíbios" : "répteis"}` : ""} nas fontes disponíveis. ${records.length ? "Os mais registrados foram:" : ""}`,
        visible.length ? visible.map((record, index) => conversationalItem(record, index, mixedGroups)).join("\n") : "Não apareceu registro para esse filtro.",
        hidden > 0 && additionalNames.length ? `Também aparecem ${additionalNames.join(", ")}${hidden > additionalNames.length ? " e outros registros" : ""}.` : "",
        hidden > 0 ? "Quer que eu abra a lista completa?" : "",
        cleanSourceStatus(comparison),
        cacheSourceNote(comparison),
        "Nota: registros disponíveis, não inventário completo.",
      ].filter(Boolean).join("\n\n");
    }

    function generateFullTaxonList(comparison, groups) {
      const records = [...filterCombinedRecords(comparison.combined, groups)].sort((left, right) =>
        String(left.nome_cientifico || "").localeCompare(String(right.nome_cientifico || ""))
      );
      const mixedGroups = !Array.isArray(groups) || groups.length !== 1;
      return [
        `Claro. Lista completa dos ${groups?.length === 1 ? groups[0] === "Amphibia" ? "anfíbios" : "répteis" : "táxons"} retornados para ${comparison.municipio}:`,
        records.length ? records.map((record, index) => conversationalItem(record, index, mixedGroups)).join("\n") : "Não apareceu registro para esse filtro.",
        cleanSourceStatus(comparison),
        cacheSourceNote(comparison),
        "Nota: registros disponíveis, não inventário completo.",
      ].join("\n\n");
    }

    function formatCombinedList(comparison, groups, options = {}) {
      if (options.responseMode === "short") return generateQuickMunicipalityOverview(comparison, groups);
      if (options.wantsFullList) return generateFullTaxonList(comparison, groups);
      return generateTaxonListPreview(comparison, groups);
    }

    function formatCombinedSummary(comparison, groups) {
      const records = filterCombinedRecords(comparison.combined, groups);
      const summary = summarizeCombinedSources(records);
      const hasINat = comparison.fontes_disponiveis.includes("iNaturalist");
      const hasSpeciesLink = comparison.fontes_disponiveis.includes("speciesLink");
      return [
        partialFailureNote(comparison),
        `Resumo dos registros disponíveis para ${comparison.municipio}:`,
        `- Nomes científicos combinados: ${summary.total_combinado}`,
        `- Anfíbios: ${summary.anfibios}`,
        `- Répteis: ${summary.repteis}`,
        hasINat && hasSpeciesLink ? `- Encontrados nas duas fontes: ${summary.presentes_nas_duas_fontes}` : "",
        hasINat ? `- Encontrados no iNaturalist: ${summary.apenas_inaturalist}` : "- iNaturalist: indisponível",
        hasSpeciesLink ? `- Encontrados no speciesLink: ${summary.apenas_specieslink}` : "- speciesLink: indisponível",
        `- Observações no iNaturalist: ${hasINat ? comparison.total_observacoes_inaturalist : "indisponível"}`,
        `- Registros no speciesLink: ${hasSpeciesLink ? comparison.total_registros_specieslink : "indisponível"}`,
        `- Vouchers/material preservado no speciesLink: ${hasSpeciesLink ? comparison.total_vouchers_specieslink : "indisponível"}`,
        `- Registros com coordenadas no speciesLink: ${hasSpeciesLink ? comparison.registros_com_coordenada_specieslink : "indisponível"}`,
        "",
        "Interpretação: riqueza registrada é o número de táxons retornados pelas bases consultadas. Ela não equivale automaticamente à riqueza real da fauna local.",
        generateMethodologicalNote("medium", comparison),
        sourceDisclosure(comparison),
      ]
        .filter(Boolean)
        .join("\n");
    }

    function formatCombinedTop(comparison, groups) {
      const records = filterCombinedRecords(comparison.combined, groups);
      const sorted = [...records].sort((a, b) => {
        const aTotal = Number(a.inaturalist?.observacoes_municipio || 0) + Number(a.specieslink?.total_registros || 0);
        const bTotal = Number(b.inaturalist?.observacoes_municipio || 0) + Number(b.specieslink?.total_registros || 0);
        return bTotal - aTotal;
      });
      const lines = sorted.slice(0, 10).map((record, index) => {
        const inatCount = Number(record.inaturalist?.observacoes_municipio || 0);
        const speciesLinkCount = Number(record.specieslink?.total_registros || 0);
        const group = record.grupo ? ` — ${record.grupo}` : "";
        const counts = [
          comparison.fontes_disponiveis.includes("iNaturalist") ? pluralizeObservation(inatCount) : "",
          comparison.fontes_disponiveis.includes("speciesLink") ? `${pluralizeRecord(speciesLinkCount)} de coleção` : "",
        ].filter(Boolean).join("; ");
        return `${index + 1}. ${record.nome_cientifico}${group}${counts ? ` — ${counts}` : ""}`;
      });
      return [
        `Aqui estão os táxons mais registrados para ${comparison.municipio}:`,
        lines.length ? lines.join("\n\n") : "Nenhum táxon foi retornado com os filtros atuais.",
        cleanSourceStatus(comparison),
        cacheSourceNote(comparison),
        "Nota: a ordem ajuda a explorar os registros disponíveis; não mede abundância local.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    function formatMunicipalityComparison(comparison) {
      const summary = summarizeCombinedSources(comparison.combined);
      const hasINat = comparison.fontes_disponiveis.includes("iNaturalist");
      const hasSpeciesLink = comparison.fontes_disponiveis.includes("speciesLink");
      return [
        partialFailureNote(comparison),
        `Para ${comparison.municipio}, as fontes retornaram:`,
        `- iNaturalist: ${hasINat ? pluralize(comparison.total_inaturalist, "táxon", "táxons") : "indisponível"}`,
        `- speciesLink: ${hasSpeciesLink ? pluralize(comparison.total_specieslink, "nome científico", "nomes científicos") : "indisponível"}`,
        `- Combinado: ${summary.total_combinado}`,
        hasINat && hasSpeciesLink ? `- Encontrados nas duas fontes: ${summary.presentes_nas_duas_fontes}` : "",
        hasINat ? `- Encontrados no iNaturalist: ${summary.apenas_inaturalist}` : "",
        hasSpeciesLink ? `- Encontrados no speciesLink: ${summary.apenas_specieslink}` : "",
        "",
        "Interpretação: o iNaturalist tende a refletir observações de usuários, geralmente com fotos. O speciesLink tende a refletir coleções, vouchers e dados históricos. Diferenças entre as fontes indicam naturezas distintas de amostragem e documentação.",
        generateMethodologicalNote("medium", comparison),
        sourceDisclosure(comparison),
      ]
        .filter(Boolean)
        .join("\n");
    }

    function formatRegionalComparison(comparisons) {
      const lines = [...comparisons].sort((a, b) => b.total_combinado - a.total_combinado).map((item) => {
        const hasINat = item.fontes_disponiveis.includes("iNaturalist");
        const hasSpeciesLink = item.fontes_disponiveis.includes("speciesLink");
        return `| ${item.municipio} | ${hasINat ? item.total_inaturalist : "indisponível"} | ${hasSpeciesLink ? item.total_specieslink : "indisponível"} | ${item.total_combinado} |`;
      });
      const partial = comparisons.flatMap((item) => item.fontes_indisponiveis).length
        ? "Aviso: uma ou mais consultas falharam. A tabela usa os dados disponíveis agora."
        : "";
      return [
        "Comparação regional: consultei os municípios configurados usando os dados disponíveis agora.",
        "| Município | iNaturalist | speciesLink | Total usado |",
        "|---|---:|---:|---:|",
        ...lines,
        partial,
        "Leitura rápida: municípios com mais registros nas bases consultadas podem ter maior esforço amostral, mais observadores, mais coletas históricas ou melhor georreferenciamento. A tabela não mede diretamente a biodiversidade real.",
        comparisons.every((item) => item.fontes_disponiveis.length === 2)
          ? generateMethodologicalNote("medium", comparisons[0])
          : "A tabela usa somente as fontes disponíveis em cada município. “Indisponível” não significa zero registros.",
        comparisons.every((item) => !item.fontes_indisponiveis.length)
          ? "Fontes usadas: iNaturalist e speciesLink."
          : "A comparação usa somente as fontes consultadas com sucesso em cada município.",
      ]
        .filter(Boolean)
        .join("\n");
    }

    function extractSpeciesSearch(question, municipalities) {
      let text = String(question || "");
      for (const municipality of municipalities) {
        text = text.replace(new RegExp(municipality.name.replace("-SP", ""), "ig"), " ");
      }
      return text
        .replace(/\b(tem|ha|há|existe|aparece|registro|registros|de|do|da|dos|das|em|para|no|na|nos|nas|o|a|os|as|inaturalist|specieslink|ambas|fontes)\b/gi, " ")
        .replace(/[?!.:,;]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isSpeciesSearch(question, municipalities = []) {
      const candidates = String(question || "").match(/\b[A-Z][a-z]+ [a-z][a-z-]+\b/g) || [];
      const ignoredFirstWords = new Set(["quais", "qual", "liste", "resumo", "compare", "comparar", "faca"]);
      return candidates.some((candidate) => {
        const normalized = normalizeText(candidate);
        const firstWord = normalized.split(" ")[0];
        if (ignoredFirstWords.has(firstWord)) return false;
        return !(municipalities || []).some((municipality) => {
          const municipalityName = normalizeText(municipality.name.replace("-SP", ""));
          return normalized.startsWith(`${municipalityName} `) || municipalityName === firstWord;
        });
      });
      /*
      return /\b[A-Z][a-z]+ [a-z][a-z-]+\b/.test(String(question || "")) || /^(tem|ha|há|existe|aparece)\b/i.test(String(question || "").trim());
      */
    }

    function formatCombinedSpeciesSearch(comparison, speciesName) {
      const search = normalizeScientificName(speciesName);
      const matches = comparison.combined.filter((record) => normalizeScientificName(record.nome_cientifico).includes(search));
      if (!matches.length) {
        return [
          partialFailureNote(comparison),
          getPersonalityPrefix("caution"),
          `Não encontrei ${speciesName} nas fontes disponíveis para ${comparison.municipio} com os filtros atuais.`,
          "Isso não significa que a espécie não ocorra ali; significa apenas que ela não apareceu nessa consulta.",
          generateMethodologicalNote("short", comparison),
          sourceDisclosure(comparison),
        ]
          .filter(Boolean)
          .join("\n\n");
      }
      return [
        partialFailureNote(comparison),
        ...matches.map((record) => {
          if (record.presente_inaturalist && record.presente_specieslink) {
            return `Sim. ${record.nome_cientifico} aparece nas duas fontes consultadas para ${comparison.municipio}.\n- iNaturalist: ${pluralize(record.inaturalist.observacoes_municipio, "observação", "observações")}\n- speciesLink: ${pluralize(record.specieslink.total_registros, "registro")}\n- Material preservado: ${record.specieslink.registros_material_preservado ? "sim" : "não retornado"}\n- Registros com coordenadas: ${record.specieslink.registros_com_coordenada ? "sim" : "não retornado"}`;
          }
          if (record.presente_inaturalist) {
            return `Sim. ${record.nome_cientifico} aparece no iNaturalist para ${comparison.municipio}.\n- iNaturalist: ${pluralizeObservation(record.inaturalist.observacoes_municipio)}\n- speciesLink: ${comparison.fontes_indisponiveis.includes("speciesLink") ? "indisponível no momento" : "sem registro correspondente retornado"}\n\nIsso indica registro disponível na base, não necessariamente abundância local.`;
          }
          return `${record.nome_cientifico} aparece no speciesLink para ${comparison.municipio}, mas não encontrei registro correspondente no iNaturalist com os filtros atuais. Isso pode indicar registro de coleção sem observações públicas recentes na plataforma.`;
        }),
        generateMethodologicalNote("short", comparison),
        sourceDisclosure(comparison),
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    async function answerBiodiversityQuestion(question, options = {}) {
      const sources = decideDataSources(question);
      const municipalities = detectMunicipalities(question);
      const groups = detectTaxonomicGroups(question);
      const q = normalizeText(question);
      const inventoryNote = q.includes("inventario")
        ? "Posso gerar uma lista de registros disponíveis em iNaturalist e speciesLink, mas isso não equivale a um inventário faunístico completo."
        : "";

      if (!municipalities.length) {
        return "Não identifiquei um município válido. Municípios disponíveis: Lavrinhas, Queluz, Silveiras, Bananal, Areias, São José do Barreiro, Arapeí e Cruzeiro.";
      }
      if (sources.length === 1 && sources[0] === "iNaturalist") {
        const answer = await inat.answerUserQuestion(question, {
          ...(options.inaturalist || options),
          responseMode: options.queryPlan?.responseMode,
          wantsFullList: options.queryPlan?.wantsFullList,
        });
        if (!isFailureAnswer(answer)) return appendSourceOnce(answer, "iNaturalist");
        const comparison = await compareSourcesForMunicipality(municipalities[0], { ...options, groups });
        const onlyINat = { ...comparison, combined: comparison.combined.filter((record) => record.presente_inaturalist) };
        return onlyINat.fontes_disponiveis.includes("iNaturalist")
          ? [inventoryNote, formatCombinedList(onlyINat, groups, options.queryPlan || options)].filter(Boolean).join("\n\n")
          : generateSourceUnavailableAnswer("iNaturalist", municipalities[0]?.name);
      }
      if (sources.length === 1 && sources[0] === "speciesLink") {
        const answer = await speciesLink.answerSpeciesLinkQuestion(question, {
          ...(options.speciesLink || options),
          responseMode: options.queryPlan?.responseMode,
          wantsFullList: options.queryPlan?.wantsFullList,
        });
        if (!isFailureAnswer(answer)) return appendSourceOnce(answer, "speciesLink");
        const comparison = await compareSourcesForMunicipality(municipalities[0], { ...options, groups });
        const onlySpeciesLink = { ...comparison, combined: comparison.combined.filter((record) => record.presente_specieslink) };
        return onlySpeciesLink.fontes_disponiveis.includes("speciesLink")
          ? [inventoryNote, formatCombinedList(onlySpeciesLink, groups, options.queryPlan || options)].filter(Boolean).join("\n\n")
          : generateSourceUnavailableAnswer("speciesLink", municipalities[0]?.name);
      }

      if (municipalities.length > 1) {
        const comparisons = [];
        for (const municipality of municipalities) {
          comparisons.push(await compareSourcesForMunicipality(municipality, { ...options, groups }));
        }
        return [inventoryNote, formatRegionalComparison(comparisons)].filter(Boolean).join("\n\n");
      }

      const comparisonRaw = await compareSourcesForMunicipality(municipalities[0], { ...options, groups });
      const comparison = {
        ...comparisonRaw,
        combined: filterCombinedRecordsByTaxon(comparisonRaw.combined, options.queryPlan?.taxonFilter),
      };
      if (isSpeciesSearch(question, municipalities)) {
        const speciesName = extractSpeciesSearch(question, municipalities);
        return [inventoryNote, formatCombinedSpeciesSearch(comparison, speciesName || "o táxon informado")].filter(Boolean).join("\n\n");
      }
      if (/\b(compare|comparar|comparacao|fontes)\b/.test(q)) {
        return [inventoryNote, formatMunicipalityComparison(comparison)].filter(Boolean).join("\n\n");
      }
      if (/\b(resumo|visao geral|quantos|quantas|riqueza|total de registros)\b/.test(q)) {
        return [inventoryNote, formatCombinedSummary(comparison, groups)].filter(Boolean).join("\n\n");
      }
      if (/\b(top|mais registrad\w*|mais observad\w*|aparece mais|mais comum)\b/.test(q)) {
        return [inventoryNote, formatCombinedTop(comparison, groups)].filter(Boolean).join("\n\n");
      }
      const listOptions = { ...(options.queryPlan || options) };
      if (!listOptions.commonTaxonTerms?.length && /\bsapos?\b/.test(q)) listOptions.commonTaxonTerms = ["sapos"];
      if (!listOptions.subgroupTerms?.length && /\b(cobras?|serpentes?)\b/.test(q)) listOptions.subgroupTerms = ["serpentes"];
      return [inventoryNote, formatCombinedList(comparison, groups, listOptions)]
        .filter(Boolean)
        .join("\n\n");
    }

    async function answerBiodiversityQuestionWithEvidence(question, options = {}) {
      const sourcesRequested = options.queryPlan?.sourcesRequested || decideDataSources(question);
      const evidence = createEvidenceBundle({ ...(options.queryPlan || {}), sourcesRequested });
      const answer = await answerBiodiversityQuestion(question, options);
      recordEvidenceFromAnswer(evidence, answer);
      return { answer, evidence, sourceStatus: evidence.sourceStatus };
    }

    return {
      COMBINED_NOTE,
      removeAccents,
      normalizeText,
      normalizeScientificName,
      pluralize,
      pluralizeObservation,
      pluralizeTaxa,
      pluralizeRecord,
      getPersonalityPrefix,
      decideDataSources,
      createEvidenceBundle,
      recordEvidenceFromAnswer,
      detectMunicipalities,
      detectTaxonomicGroups,
      normalizeINaturalistData,
      normalizeSpeciesLinkData,
      getINaturalistMunicipalityData,
      getSpeciesLinkMunicipalityData,
      mergeBiodiversitySources,
      filterCombinedRecordsByTaxon,
      summarizeCombinedSources,
      describeSourceStatus,
      generateMethodologicalNote,
      getMethodologicalNote: generateMethodologicalNote,
      generateQuickMunicipalityOverview,
      generateTaxonListPreview,
      generateFullTaxonList,
      generateSourceUnavailableAnswer,
      generateContextualSourceSwitchAnswer,
      generateRegionalComparisonTable: formatRegionalComparison,
      generateSpeciesSearchAnswer: formatCombinedSpeciesSearch,
      generateRegionalComparisonAnswer: formatRegionalComparison,
      generateContinuationAnswer: generateFullTaxonList,
      compareSourcesForMunicipality,
      compareSourcesAcrossMunicipalities,
      answerBiodiversityQuestion,
      answerBiodiversityQuestionWithEvidence,
      answerUnifiedHerpetofaunaQuestion: answerBiodiversityQuestion,
      formatCombinedList,
      formatCombinedSummary,
      formatCombinedTop,
      formatMunicipalityComparison,
      formatRegionalComparison,
    };
  }

  const api = createManager();
  api.createManager = createManager;
  global.HerpetoDataSourceManager = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
