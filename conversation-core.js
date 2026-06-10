(function (global) {
  const municipalityConfig =
    global.HerpetoMunicipalities ||
    (typeof require === "function" ? require("./municipalities.js") : null);

  const INTENTS = {
    LIST_TAXA: "LIST_TAXA",
    SUMMARY: "SUMMARY",
    COMPARE_MUNICIPALITIES: "COMPARE_MUNICIPALITIES",
    COMPARE_SOURCES: "COMPARE_SOURCES",
    SEARCH_SPECIES: "SEARCH_SPECIES",
    TOP_RECORDED: "TOP_RECORDED",
    VOUCHERS: "VOUCHERS",
    COORDINATES: "COORDINATES",
    EXPLAIN_METHOD: "EXPLAIN_METHOD",
    HELP: "HELP",
    CITY_SUPPORT: "CITY_SUPPORT",
    OUT_OF_SCOPE: "OUT_OF_SCOPE",
    CLARIFICATION: "CLARIFICATION",
    UNKNOWN: "UNKNOWN",
  };
  const CONVERSATION_INTENTS = {
    GENERAL_SCIENTIFIC_QUESTION: "general_scientific_question",
    GENERAL_TAXON_QUESTION: "general_taxon_question",
    MUNICIPAL_OCCURRENCE_QUERY: "municipal_occurrence_query",
    POPULAR_NAME_QUESTION: "popular_name_question",
    REGIONAL_CONTEXT_QUESTION: "regional_context_question",
    SAFETY_QUESTION: "safety_question",
    METHODOLOGY_QUESTION: "methodology_question",
    COMPLAINT: "complaint",
    GREETING: "greeting",
    UNKNOWN: "unknown",
  };
  const SCOPES = {
    GENERAL: "general",
    MUNICIPAL: "municipal",
    BRAZIL: "brazil",
    MATA_ATLANTICA: "mata_atlantica",
    SERRA_DA_MANTIQUEIRA: "serra_da_mantiqueira",
    VALE_HISTORICO: "vale_historico",
    UNKNOWN: "unknown",
  };
  const DATA_SCOPES = {
    STRUCTURED_MUNICIPAL_DATA: "structured_municipal_data",
    LITERATURE_RAG: "literature_rag",
    TAXONOMY_INDEX: "taxonomy_index",
    GLOSSARY: "glossary",
    GENERAL_SCIENTIFIC: "general_scientific",
    SAFETY: "safety",
    NONE: "none",
  };
  const TAXONOMIC_CORRECTIONS = {
    bopthrops: "Bothrops",
    botrops: "Bothrops",
    bothropes: "Bothrops",
    rinella: "Rhinella",
    rhinela: "Rhinella",
    viperideos: "Viperidae",
    bufonideos: "Bufonidae",
  };
  const KNOWN_TAXA = ["Bothrops", "Rhinella", "Viperidae", "Bufonidae"];

  const SLANG_MAP = {
    q: "que", qq: "que", oq: "o que", oque: "o que", vc: "você", vcs: "vocês",
    tb: "também", tbm: "também", qts: "quantos", qnts: "quantos", qntos: "quantos", qtd: "quantidade",
    num: "não", n: "não", pra: "para", pro: "para o", inat: "inaturalist", species: "specieslink",
    splink: "specieslink", pfv: "por favor", pls: "por favor", qro: "quero", queroo: "quero",
    blz: "beleza", vlw: "valeu", ae: "ai", vei: "cara", vey: "cara", mano: "cara", mds: "meu deus",
  };
  const TYPO_MAP = {
    anfibois: "anfibios", anfibo: "anfibio", anfbios: "anfibios",
    repitil: "reptil", repiteis: "repteis", repties: "repteis",
    serpetne: "serpente", serpetnes: "serpentes", serpntes: "serpentes", sepentes: "serpentes",
    perreca: "perereca", perrecas: "pererecas", pererecs: "pererecas",
    lagrato: "lagarto", lagratos: "lagartos", largatos: "lagartos",
    girno: "girino", girnos: "girinos",
  };

  const SPECIES_BLACKLIST = new Set([
    "sapo", "sapos", "ra", "ras", "perereca", "pererecas", "anuro", "anuros",
    "anfibio", "anfibios", "cobra", "cobras", "serpente", "serpentes", "jararaca",
    "jararacas", "reptil", "repteis", "lagarto", "lagartos", "teiu", "teius",
    "quelonio", "quelonios", "tartaruga", "tartarugas", "fauna", "herpetofauna",
    "bicho", "bichos", "animal", "animais", "registro", "registros", "observacao",
    "observacoes", "voucher", "vouchers", "colecao", "coordenada", "coordenadas",
    "trilha", "trilhas", "mantiqueira", "quais", "qual", "liste", "compare", "resumo",
    "como", "fale", "conte", "explique", "explica", "interprete", "interpreta",
    "interprete", "analise", "discuta", "tenho", "duvida", "defina", "diferenca",
    "quero", "existe", "existem", "mostre", "mostrar", "mande", "pode", "por",
    "onde", "quando", "porque", "seria", "faca", "sobre", "agora",
    "mata", "vale", "serra", "brasil", "municipio", "cidade", "cientifico",
    "cientifica", "biblioteca", "metodo", "metodos", "familia", "genero",
  ]);
  const SPECIES_SECOND_BLACKLIST = new Set([
    "alguma", "algum", "saber", "todos", "todas", "que", "mais", "sobre", "isso",
    "essa", "esse", "uma", "um", "dados", "fontes", "registros", "especies",
    "considerando", "sobre", "para", "com", "voce", "voces", "conhece", "conhecem",
    "existe", "existem", "aparece", "aparecem", "ocorre", "ocorrem", "tem", "quais", "qual",
  ]);
  const PREPOSITIONS = new Set(["de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "pra", "para", "com"]);

  function removeAccents(text) {
    return municipalityConfig.removeAccents(text);
  }

  function normalizeText(text) {
    return removeAccents(text)
      .toLowerCase()
      .replace(/\bp\s*\/\s*/g, " para ")
      .replace(/\bc\s*\/\s*/g, " com ")
      .replace(/\bs\s*\/\s*/g, " sem ")
      .replace(/[-_/.,;:()[\]?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slangAndAbbreviationResolver(text) {
    let corrected = normalizeText(text)
      .replace(/\bq\s+q\b/g, "o que")
      .replace(/\bsp\s+link\b/g, "specieslink");
    corrected = corrected
      .split(" ")
      .map((word) => {
        const slang = SLANG_MAP[word] || word;
        return TYPO_MAP[slang] || slang;
      })
      .join(" ");
    return corrected.replace(/\s+/g, " ").trim();
  }

  function correctTaxonomicTypos(text) {
    const corrections = [];
    const suggestions = [];
    const correctedText = String(text || "").replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
      const normalized = normalizeText(word);
      const canonical = TAXONOMIC_CORRECTIONS[normalized];
      if (canonical) {
        corrections.push({ raw: word, normalized: canonical, confidence: 1 });
        return canonical;
      }
      if (word.length < 5) return word;
      const fuzzy = fuzzyMatch(word, KNOWN_TAXA.map((value) => ({ id: value, value })), 0.74);
      if (fuzzy.match && fuzzy.match.confidence < 0.94) {
        suggestions.push({ raw: word, normalized: fuzzy.match.value, confidence: fuzzy.match.confidence });
      }
      return word;
    });
    return { correctedText, corrections, suggestions };
  }

  function detectAudienceProfile(text) {
    const q = slangAndAbbreviationResolver(text);
    const child = /\b(crianca|criancas|meu filho|minha filha|escola|trabalho escolar|ensino fundamental|explica facil|bem simples|como se eu tivesse \d+ anos)\b/.test(q);
    const technical = /\b(doutor|doutora|doutorado|mestrado|mestre|tese|dissertacao|artigo|metodologia|vies|amostral|basisofrecord|darwin core|sdm|modelagem|georreferenciamento|revisao sistematica|riqueza|taxonom|filogen|ecolog\w*)\b/.test(q);
    const informal = /\b(cara|meu deus|porra|caralho|cacete|merda|mano|vei|vey|blz|vlw|bora|ai)\b/.test(q);
    if (child) return { audience: "child", confidence: 0.95 };
    if (technical) return { audience: "technical", confidence: 0.95 };
    if (informal) return { audience: "casual", confidence: 0.88 };
    return { audience: "general", confidence: 0.72 };
  }

  function levenshteinDistance(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
    }
    return rows[left.length][right.length];
  }

  function fuzzyMatch(input, candidates, threshold = 0.85) {
    const value = normalizeText(input);
    const matches = candidates
      .map((candidate) => {
        const normalized = normalizeText(candidate.value);
        const distance = levenshteinDistance(value, normalized);
        const confidence = 1 - distance / Math.max(value.length, normalized.length, 1);
        return { ...candidate, confidence };
      })
      .sort((a, b) => b.confidence - a.confidence);
    if (!matches.length || matches[0].confidence < threshold) return { match: null, ambiguous: false, candidates: matches.slice(0, 2) };
    const ambiguous = matches[1] && Math.abs(matches[0].confidence - matches[1].confidence) < 0.04 && matches[0].id !== matches[1].id;
    return { match: ambiguous ? null : matches[0], ambiguous, candidates: matches.slice(0, 2) };
  }

  function findMunicipalityMentions(text) {
    const correctedText = slangAndAbbreviationResolver(text);
    const exact = [];
    municipalityConfig.MUNICIPALITIES.forEach((municipality) => {
      const aliases = municipality.aliases.map(normalizeText);
      if (aliases.some((alias) => correctedText.includes(alias))) {
        exact.push({ ...municipality, placeId: municipality.inaturalistPlaceId, confidence: 1 });
      }
    });
    if (exact.length) return { municipalities: deduplicateMunicipalities(exact), warnings: [], unresolved: [] };

    const knownTypos = [];
    municipalityConfig.MUNICIPALITIES.forEach((municipality) => {
      const fuzzyAliases = municipality.fuzzyAliases.map(normalizeText);
      const matchedAlias = fuzzyAliases.find((alias) => correctedText.includes(alias));
      if (matchedAlias) knownTypos.push({ ...municipality, placeId: municipality.inaturalistPlaceId, confidence: 0.94, matchedAlias });
    });
    if (knownTypos.length) {
      const municipalities = deduplicateMunicipalities(knownTypos);
      return {
        municipalities,
        warnings: municipalities.map((item) => `Entendi “${item.matchedAlias}” como ${item.name}.`),
        unresolved: [],
      };
    }

    const tokens = correctedText.split(" ");
    const phrases = [];
    for (let size = Math.min(4, tokens.length); size >= 1; size -= 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) phrases.push(tokens.slice(index, index + size).join(" "));
    }
    const candidates = municipalityConfig.MUNICIPALITIES.flatMap((municipality) =>
      [...municipality.aliases, ...municipality.fuzzyAliases].map((alias) => ({ id: municipality.id, value: alias, municipality }))
    );
    let best = null;
    for (const phrase of phrases) {
      const result = fuzzyMatch(phrase, candidates);
      if (result.match && (!best || result.match.confidence > best.confidence)) best = { ...result.match, phrase };
    }
    if (!best) return { municipalities: [], warnings: [], unresolved: [] };
    return {
      municipalities: [{ ...best.municipality, placeId: best.municipality.inaturalistPlaceId, confidence: best.confidence }],
      warnings: [`Entendi “${best.phrase}” como ${best.municipality.name}.`],
      unresolved: [],
    };
  }

  function deduplicateMunicipalities(municipalities) {
    const seen = new Set();
    return (municipalities || []).filter((municipality) => {
      if (seen.has(municipality.id)) return false;
      seen.add(municipality.id);
      return true;
    });
  }

  function isFollowUp(text) {
    return /^(e\b|agora\b|so\b|somente\b|apenas\b|com\b|tambem\b|mesma coisa\b|faz\b|mais\b|continua\b|continue\b|volta\b|retorna\b|troca\b|tem\s+(coordenada|voucher)\b|specieslink\b|inaturalist\b)/.test(slangAndAbbreviationResolver(text));
  }

  function isSourceSwitch(text) {
    return /^(agora\s+)?(no\s+)?(specieslink|inaturalist)\??$/.test(slangAndAbbreviationResolver(text));
  }

  function hasContextualReference(text) {
    return /\b(la|ai|isso|disso|deles|nessa cidade|nesse municipio|essa cidade|essas especies|esses registros)\b/.test(slangAndAbbreviationResolver(text));
  }

  function municipalityResolver(text, context) {
    const correctedText = slangAndAbbreviationResolver(text);
    const detected = findMunicipalityMentions(correctedText);
    if (detected.municipalities.length) return { ...detected, usesContext: false, contextFieldsUsed: [], confidence: Math.min(...detected.municipalities.map((item) => item.confidence || 1)) };
    if (context?.lastMunicipalities?.length && (isFollowUp(text) || hasContextualReference(correctedText))) {
      return { municipalities: context.lastMunicipalities, warnings: [], unresolved: [], usesContext: true, contextFieldsUsed: ["municipalities"], confidence: 0.92 };
    }
    if (/\b(todos|todas|regiao|vale historico|municipios)\b/.test(correctedText)) {
      return { municipalities: municipalityConfig.getUniqueMunicipalities(), warnings: [], unresolved: [], usesContext: false, contextFieldsUsed: [], confidence: 1 };
    }
    return { municipalities: [], warnings: [], unresolved: [], usesContext: false, contextFieldsUsed: [], confidence: 0 };
  }

  function taxonResolver(text, context) {
    const q = slangAndAbbreviationResolver(text);
    const subgroupTerms = [];
    const commonTaxonTerms = [];
    let amphibia = false;
    let reptilia = false;
    const add = (pattern, group, common, subgroup) => {
      if (!pattern.test(q)) return;
      if (group === "Amphibia") amphibia = true;
      if (group === "Reptilia") reptilia = true;
      if (common && !commonTaxonTerms.includes(common)) commonTaxonTerms.push(common);
      if (subgroup && !subgroupTerms.includes(subgroup)) subgroupTerms.push(subgroup);
    };
    add(/\b(anfibio|anfibios)\b/, "Amphibia", "anfíbios");
    add(/\b(sapo|sapos)\b/, "Amphibia", "sapos", "anuros");
    add(/\b(ra|ras)\b/, "Amphibia", "rãs", "anuros");
    add(/\b(perereca|pererecas)\b/, "Amphibia", "pererecas", "anuros/pererecas");
    add(/\b(anuro|anuros)\b/, "Amphibia", "anuros", "anuros");
    add(/\b(girino|girinos)\b/, "Amphibia", "girinos");
    add(/\b(reptil|repteis)\b/, "Reptilia", "répteis");
    add(/\bbothrops\b/, "Reptilia", "Bothrops", "serpentes");
    add(/\b(cobra|cobras|serpente|serpentes|jararaca|jararacas|peconhenta|venenosa)\b/, "Reptilia", /\b(cobra|cobras)\b/.test(q) ? "cobras" : "serpentes", "serpentes");
    add(/\b(lagarto|lagartos|teiu|teius)\b/, "Reptilia", "lagartos", "lagartos");
    add(/\b(quelonio|quelonios|tartaruga|tartarugas)\b/, "Reptilia", "quelônios", "quelônios");
    if (/\b(herpetofauna|fauna herpetologica|anfibios e repteis|repteis e anfibios|sapos e cobras|bicho|bichos|animal|animais)\b/.test(q)) {
      amphibia = true; reptilia = true;
      commonTaxonTerms.push("herpetofauna");
    }
    const explicit = amphibia || reptilia;
    return {
      taxonomicGroups: explicit ? [amphibia ? "Amphibia" : null, reptilia ? "Reptilia" : null].filter(Boolean) : context?.lastTaxonomicGroups?.length && (isFollowUp(text) || hasContextualReference(text)) ? context.lastTaxonomicGroups : ["Amphibia", "Reptilia"],
      subgroupTerms: explicit ? subgroupTerms : context?.lastSubgroupTerms?.length && (isFollowUp(text) || hasContextualReference(text)) ? context.lastSubgroupTerms : [],
      commonTaxonTerms,
      confidence: explicit ? 1 : context?.lastTaxonomicGroups?.length && (isFollowUp(text) || hasContextualReference(text)) ? 0.92 : 0.65,
      usesContext: !explicit && Boolean(context?.lastTaxonomicGroups?.length && (isFollowUp(text) || hasContextualReference(text))),
    };
  }

  function speciesQueryExtractor(text) {
    const raw = String(text || "");
    const rejectedSpeciesCandidates = [];
    if (/\b(?:esp[eé]cies?|g[eê]nero)\s+(?:de|do|da)?\s*[A-Z][a-z]{2,}\b/u.test(raw)) {
      return { speciesQuery: null, possibleSpeciesQuery: null, commonNameQuery: null, rejectedSpeciesCandidates };
    }
    const candidates = raw.match(/\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)\s+([a-záéíóúâêôãõç]{3,})\b/gu) || [];
    for (const candidate of candidates) {
      const words = normalizeText(candidate).split(" ");
      const normalizedCandidate = normalizeText(candidate);
      const mentionsMunicipality = municipalityConfig.MUNICIPALITIES.some((municipality) =>
        [...municipality.aliases, ...municipality.fuzzyAliases]
          .map(normalizeText)
          .some((alias) =>
            normalizedCandidate === alias ||
            normalizedCandidate.startsWith(`${alias} `) ||
            alias.startsWith(`${normalizedCandidate} `)
          )
      );
      if (
        mentionsMunicipality ||
        SPECIES_BLACKLIST.has(words[0]) ||
        SPECIES_SECOND_BLACKLIST.has(words[1]) ||
        PREPOSITIONS.has(words[1]) ||
        words[1].endsWith("mente")
      ) {
        rejectedSpeciesCandidates.push(candidate);
        continue;
      }
      return { speciesQuery: candidate, possibleSpeciesQuery: null, commonNameQuery: null, rejectedSpeciesCandidates };
    }
    const q = normalizeText(text);
    const commonNameQuery = /\bjararacas?\b/.test(q) ? "jararaca" : null;
    return { speciesQuery: null, possibleSpeciesQuery: null, commonNameQuery, rejectedSpeciesCandidates };
  }

  function sourceRouter(text, intent, context) {
    const q = slangAndAbbreviationResolver(text);
    if (/\b(so|somente|apenas)\s+(o\s+)?inaturalist\b/.test(q)) return { sources: ["iNaturalist"], confidence: 1 };
    if (/\b(so|somente|apenas)\s+(o\s+)?specieslink\b/.test(q)) return { sources: ["speciesLink"], confidence: 1 };
    if (/\b(voucher|vouchers|colecao|colecoes|museu|museus|catalogo|catalogos|tombo|tombos|material preservado|historico)\b/.test(q)) return { sources: ["speciesLink"], confidence: 1 };
    if (/\b(fotos?|fotograf\w*|observa\w*|ciencia cidada|registros? recentes?)\b/.test(q) && !q.includes("specieslink")) return { sources: ["iNaturalist"], confidence: 1 };
    if (/\b(inaturalist e specieslink|specieslink e inaturalist|compare fontes|comparar fontes|duas fontes|todas as fontes|junta tudo|fontes juntas)\b/.test(q)) return { sources: ["iNaturalist", "speciesLink"], confidence: 1 };
    if (q.includes("inaturalist") && !q.includes("specieslink")) return { sources: ["iNaturalist"], confidence: 1 };
    if (q.includes("specieslink") && !q.includes("inaturalist")) return { sources: ["speciesLink"], confidence: 1 };
    if (["VOUCHERS", "COORDINATES"].includes(intent)) return { sources: ["speciesLink"], confidence: 0.95 };
    if (isFollowUp(text) && context?.lastSources?.length) return { sources: context.lastSources, confidence: 0.9, usesContext: true };
    return { sources: ["iNaturalist", "speciesLink"], confidence: 0.8 };
  }

  function intentClassifier(text, municipalities, speciesQuery) {
    const q = slangAndAbbreviationResolver(text);
    if (/\b(o que voce faz|o que voce sabe fazer|como perguntar|ajuda|help|quais cidades|cidades cobre|cidades voce cobre)\b/.test(q)) return { intent: INTENTS.HELP, confidence: 1 };
    if (/\b(essa cidade voce tem|cidade voce tem|voce tem essa cidade)\b/.test(q)) return { intent: INTENTS.CITY_SUPPORT, confidence: 1 };
    if (/\b(confiavel|inventario|artigo|metodolog|vies|diferenca entre fontes)\b/.test(q)) return { intent: INTENTS.EXPLAIN_METHOD, confidence: 1 };
    if (/\b(compare fontes|comparar fontes|inaturalist e specieslink|specieslink e inaturalist|nas duas fontes)\b/.test(q)) return { intent: INTENTS.COMPARE_SOURCES, confidence: 1 };
    if (municipalities.length > 1 || /\b(compare|comparar|qual cidade|qual municipio|todos os municipios|vale historico|regiao)\b/.test(q)) return { intent: INTENTS.COMPARE_MUNICIPALITIES, confidence: 0.98 };
    if (/\b(voucher|vouchers|colecao|colecoes|catalogo|catalogos|tombo|tombos|material preservado)\b/.test(q)) return { intent: INTENTS.VOUCHERS, confidence: 1 };
    if (/\b(coordenada|latitude|longitude|georreferenciad|mapa|mapear)\b/.test(q)) return { intent: INTENTS.COORDINATES, confidence: 1 };
    if (/\b(top|mais registrad|mais observad|mais comum)\b/.test(q)) return { intent: INTENTS.TOP_RECORDED, confidence: 1 };
    if (/\b(resumo|quantos|quantidade|visao geral|riqueza|total)\b/.test(q)) return { intent: INTENTS.SUMMARY, confidence: 0.98 };
    if (speciesQuery) return { intent: INTENTS.SEARCH_SPECIES, confidence: 1 };
    if (municipalities.length || /\b(especies|fauna|animais|bichos|registros|o que tem|sapo|sapos|anfibio|anfibios|reptil|repteis|cobra|cobras|jararaca|jararacas|serpente|serpentes|lagarto|lagartos|quelonio|quelonios|tartaruga|tartarugas)\b/.test(q)) return { intent: INTENTS.LIST_TAXA, confidence: 0.9 };
    return { intent: INTENTS.UNKNOWN, confidence: 0.35 };
  }

  function detectConversationTaxon(text) {
    const corrected = correctTaxonomicTypos(text).correctedText;
    const q = slangAndAbbreviationResolver(corrected);
    const family = corrected.match(/\b([A-Z][a-z]+idae)\b/)?.[1];
    if (family) return { raw: family, normalized: family, rank: "family" };
    const explicit = corrected.match(/\b(?:g[eê]nero|esp[eé]cies?\s+de)\s+([A-Z][a-z]{2,})\b/i)?.[1];
    if (explicit) return { raw: explicit, normalized: explicit[0].toUpperCase() + explicit.slice(1).toLowerCase(), rank: "genus" };
    const known = KNOWN_TAXA.find((taxon) => new RegExp(`\\b${normalizeText(taxon)}\\b`, "i").test(q));
    if (known) return { raw: known, normalized: known, rank: known.endsWith("idae") ? "family" : "genus" };
    if (/\bjararacas?\b/.test(q)) return { raw: "jararaca", normalized: "jararaca", rank: "popular_name" };
    if (/\bsapos?\b/.test(q)) return { raw: "sapo", normalized: "sapo", rank: "popular_name" };
    if (/\banura\b/.test(q)) return { raw: "Anura", normalized: "Anura", rank: "order" };
    if (/\bherpetofauna\b/.test(q)) return { raw: "herpetofauna", normalized: "herpetofauna", rank: "class" };
    if (/\b(anfibios?|repteis?|serpentes?|anuros?)\b/.test(q)) {
      const raw = q.match(/\b(anfibios?|repteis?|serpentes?|anuros?)\b/)?.[1];
      const rank = /^anuros?$/.test(raw) ? "order" : /^serpentes?$/.test(raw) ? "order" : "class";
      return { raw, normalized: raw, rank };
    }
    return { raw: null, normalized: null, rank: null };
  }

  function detectConversationScope(text, municipalities = []) {
    const q = slangAndAbbreviationResolver(text);
    if (municipalities.length === 1) return SCOPES.MUNICIPAL;
    if (municipalities.length > 1) return SCOPES.VALE_HISTORICO;
    if (/\b(brasil|brasileir[oa]s?|nacional)\b/.test(q)) return SCOPES.BRAZIL;
    if (/\bmata atlantica\b/.test(q)) return SCOPES.MATA_ATLANTICA;
    if (/\b(serra da mantiqueira|mantiqueira)\b/.test(q)) return SCOPES.SERRA_DA_MANTIQUEIRA;
    if (/\b(vale historico|regiao|regional|todos os municipios)\b/.test(q)) return SCOPES.VALE_HISTORICO;
    if (/\b(geral|no geral|de forma geral|sem municipio|nao quero municipio|lista geral)\b/.test(q)) return SCOPES.GENERAL;
    return SCOPES.UNKNOWN;
  }

  function classifyConversationIntent(text, options = {}) {
    const typo = correctTaxonomicTypos(text);
    const q = slangAndAbbreviationResolver(typo.correctedText);
    const municipalities = options.municipalities || findMunicipalityMentions(q).municipalities;
    const scope = detectConversationScope(q, municipalities);
    const taxon = detectConversationTaxon(typo.correctedText);
    const complaint = /\b(so sabe falar isso|voce so sabe falar isso|burro|idiota|inutil|para de perguntar|para de pedir municipio|ja falei|de novo isso|nao quero municipio|voce esta quebrado|esta quebrado|travou|bugado|nao foi isso|nao era isso|responde direito|eu falei geral|voce nao entendeu|nao entendeu)\b/.test(q);
    const greeting = /^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hey|hello)[!.? ]*$/.test(q);
    const safety = /\b(picada|mordida|acidente|veneno|peconhent|torniquete|primeiros socorros|seguranca|posso pegar|pegar uma|capturar|manusear|matar|cobra no quintal|achei uma cobra|encontrei uma cobra|orientar criancas|orientar criancas sobre serpentes|sem criar panico|criancas.*serpentes|crianças.*serpentes)\b/.test(q);
    const methodology = /\b(inventario|levantamento|metodolog|metodologias|amostragem|pitfall|busca ativa|esforco amostral|artigo|vies|curva de acumulacao|ficha de campo|dados minimos|observacao cientifica|procura visual|encontros ocasionais|gravacao acustica)\b/.test(q);
    const conservationQuestion = /\b(conservacao|preservacao|projetos?|acoes?|restauracao|corredores?|proteger|ajudar|manejo|educacao ambiental)\b/.test(q);
    const threatQuestion = /\b(doenca|doencas|patogeno|patogenos|perigo|perigos|ameaca|ameacas|atingem|afetam|declinio|quitridio|quitridiomicose|ranavirus|ranavirose|fungo|parasita|atropelamento|perseguicao|trafico|poluicao|agrotoxico|agrotoxicos)\b/.test(q);
    const ecologyQuestion = /\b(sensiveis|alteracao ambiental|altitude|serrapilheira|fragmentacao|riachos|pocas temporarias|borda de mata|composicao|micro habitat|microhabitat|sazonalidade|detectabilidade|chuva|temperatura|umidade|habitat|nicho|bioindicadores?|bioindicadoras|equilibrio ecologico|mudancas climaticas)\b/.test(q);
    const taxonomyConceptQuestion = /\b(genero ou especie|binomio cientifico|sinonimo taxonomico|nomes cientificos mudam|nome cientifico muda|taxonomia muda|nome aceito|nome valido)\b/.test(q);
    const dataEvidenceQuestion = /\b(base cientifica|pedir municipio|ausencia de retorno|ausencia de registros|ausencia da especie|api|registro antigo|registros publicos|priorizar areas|lacunas de amostragem|colecao com observacoes recentes|fonte citavel|evidencia suficiente|conhecimento geral|ocorrencia municipal|qualidade de coordenadas)\b/.test(q);
    const explicitMunicipalCue = /\b(registros?|registrad\w*|observad\w*|ocorrencias?|ocorre\w*|aparece\w*|consultar|consulta|municipio|cidade)\b/.test(q);
    const popularExplanation = taxon.rank === "popular_name" && (
      /^(o que (e|sao)|oq (e|sao)|fale sobre|explique|explica|me fale sobre)\b/.test(q) ||
      new RegExp(`^${taxon.normalized}s?\\??$`).test(q)
    );
    let intent = CONVERSATION_INTENTS.UNKNOWN;
    if (greeting) intent = CONVERSATION_INTENTS.GREETING;
    else if (complaint) intent = CONVERSATION_INTENTS.COMPLAINT;
    else if (safety) intent = CONVERSATION_INTENTS.SAFETY_QUESTION;
    else if (municipalities.length) intent = CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY;
    else if (methodology || taxonomyConceptQuestion || dataEvidenceQuestion) intent = CONVERSATION_INTENTS.METHODOLOGY_QUESTION;
    else if (explicitMunicipalCue && scope !== SCOPES.GENERAL && scope !== SCOPES.BRAZIL) {
      intent = CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY;
    } else if (conservationQuestion || threatQuestion || ecologyQuestion) {
      intent = CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION;
    } else if (popularExplanation || taxon.rank === "popular_name") intent = CONVERSATION_INTENTS.POPULAR_NAME_QUESTION;
    else if (taxon.normalized || /\b(taxonomia|familia|genero|classe|filo|reino|especies?)\b/.test(q)) {
      intent = CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION;
    } else if ([SCOPES.MATA_ATLANTICA, SCOPES.SERRA_DA_MANTIQUEIRA, SCOPES.VALE_HISTORICO].includes(scope)) {
      intent = CONVERSATION_INTENTS.REGIONAL_CONTEXT_QUESTION;
    } else if (/\b(ecologia|conservacao|habitat|nicho|herpetologia|zoologia)\b/.test(q)) {
      intent = CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION;
    }
    const shouldAskMunicipality = intent === CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY && municipalities.length === 0;
    const shouldClearPreviousContext =
      [CONVERSATION_INTENTS.COMPLAINT, CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION, CONVERSATION_INTENTS.POPULAR_NAME_QUESTION, CONVERSATION_INTENTS.METHODOLOGY_QUESTION, CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION].includes(intent) ||
      [SCOPES.GENERAL, SCOPES.BRAZIL].includes(scope);
    const dataScope =
      intent === CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY ? DATA_SCOPES.STRUCTURED_MUNICIPAL_DATA
        : intent === CONVERSATION_INTENTS.SAFETY_QUESTION ? DATA_SCOPES.SAFETY
          : [CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION, CONVERSATION_INTENTS.POPULAR_NAME_QUESTION].includes(intent) ? DATA_SCOPES.TAXONOMY_INDEX
            : intent === CONVERSATION_INTENTS.METHODOLOGY_QUESTION ? DATA_SCOPES.GLOSSARY
              : [CONVERSATION_INTENTS.REGIONAL_CONTEXT_QUESTION, CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION].includes(intent) ? DATA_SCOPES.LITERATURE_RAG
                : DATA_SCOPES.NONE;
    const thematicScope = scope === SCOPES.UNKNOWN && [CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION, CONVERSATION_INTENTS.POPULAR_NAME_QUESTION].includes(intent) ? SCOPES.GENERAL : scope;
    return {
      intent,
      thematicScope,
      scope: thematicScope,
      dataScope,
      taxon,
      municipality: municipalities[0]?.name || null,
      municipalities,
      municipalityRequired: intent === CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY,
      shouldAskMunicipality,
      shouldClearPreviousContext,
      corrections: typo.corrections,
      suggestions: typo.suggestions,
    };
  }

  function queryPlanner(parsed) {
    return {
      intent: parsed.intent,
      municipalities: parsed.municipalities.map((item) => item.name),
      groups: parsed.taxonomicGroups,
      subgroupTerms: parsed.subgroupTerms,
      commonTaxonTerms: parsed.commonTaxonTerms,
      taxonFilter: parsed.conversationTaxon?.rank === "genus" ? parsed.conversationTaxon.normalized : null,
      speciesQuery: parsed.speciesQuery,
      sourcesRequested: parsed.sources,
      responseMode: parsed.responseMode || parsed.detailLevel || "medium",
      wantsFullList: Boolean(parsed.wantsFullList),
      wantsContinuation: Boolean(parsed.wantsContinuation),
      filters: {
        verifiable: parsed.sources.includes("iNaturalist"),
        coordinates: parsed.wantsCoordinates,
        basisOfRecord: parsed.wantsVoucher ? "PreservedSpecimen" : null,
      },
    };
  }

  function createEvidenceBundle(queryPlan) {
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
    };
  }

  function scientificGuardrails(answer) {
    const forbidden = [
      /\bundefined\b/i, /\bnull\b/i, /\bNaN\b/, /\[object Object\]/, /usando e/i,
      /pra usando/i, /\bent usando\b/i, /não ocorre/i, /\bnão existe\b/i,
      /não tem (essa|a) espécie na cidade/i, /ausente da fauna/i,
      /\b(maior biodiversidade real|biodiversidade real maior)\b/i, /SPECIESLINK_API_KEY\s*=/i,
      /\bAPI[_ -]?KEY\s*[:=]\s*\S+/i, /\bat .+\(.+:\d+:\d+\)/i, /observação\(ões\)/i,
      /\bregistro\(s\)/i, /\btáxon\(s\)/i,
    ];
    return !forbidden.some((pattern) => pattern.test(String(answer || "")));
  }

  function answerLengthPolicy(parsed = null) {
    if (parsed?.wantsFullList || parsed?.responseMode === "full" || parsed?.responseMode === "detailed") {
      return { maxItems: Number.MAX_SAFE_INTEGER, fullList: true };
    }
    return { maxItems: parsed?.responseMode === "short" ? 5 : 8, fullList: false };
  }

  function styleValidator(answer, parsed = null) {
    const text = String(answer || "");
    const normalized = normalizeText(text);
    const { maxItems, fullList } = answerLengthPolicy(parsed);
    const numberedItems = (text.match(/^\d+\.\s/gm) || []).length;
    const repeatedItemSources = (text.match(/^\s+(iNaturalist|speciesLink):/gm) || []).length;
    const methodologyNotes = (text.match(/\b(Nota:|Nota metodol[oó]gica:)/gi) || []).length;
    const forbiddenStyle = [
      /vou considerar anfibios anuros para a expressao/i,
      /quando a base nao separa apenas/i,
      /a resposta abaixo usa apenas/i,
      /a lista abaixo reune/i,
      /apenas inaturalist/i,
      /\b(amphibia|reptilia)\s+inaturalist/i,
    ];
    return (
      !forbiddenStyle.some((pattern) => pattern.test(normalized)) &&
      repeatedItemSources === 0 &&
      methodologyNotes <= 1 &&
      (fullList || numberedItems <= maxItems)
    );
  }

  function responseValidator(answer, parsed = null, sourceStatus = null) {
    const text = String(answer || "").trim();
    const falselyClaimsBoth =
      sourceStatus &&
      (!sourceStatus.iNaturalist?.success || !sourceStatus.speciesLink?.success) &&
      /(Fontes (consultadas|usadas): iNaturalist e speciesLink\.|Os dados combinam registros do iNaturalist e do speciesLink|Combinei iNaturalist e speciesLink)/i.test(text);
    const falselyShowsZero =
      sourceStatus?.speciesLink?.requested &&
      !sourceStatus.speciesLink?.success &&
      /speciesLink\s*(\||:)\s*0\b/i.test(text);
    const oversizedShortList =
      parsed?.responseMode === "short" &&
      (text.match(/^\d+\.\s/gm) || []).length > 12;
    const oversizedPreview =
      !parsed?.wantsFullList &&
      (text.match(/^\d+\.\s/gm) || []).length > 15;
    if (!text || falselyClaimsBoth || falselyShowsZero || oversizedShortList || oversizedPreview || !scientificGuardrails(text) || !styleValidator(text, parsed)) {
      return "Entendi a pergunta, mas tive um problema ao montar a resposta completa. Vou te passar o resumo seguro: não apareceu registro para esse filtro nas fontes consultadas. Isso não significa ausência real na natureza.";
    }
    return text;
  }

  class ConversationState {
    constructor() { this.clear(); }
    update(parsed, evidence = null) {
      if (parsed.municipalities?.length) this.lastMunicipalities = parsed.municipalities;
      if (parsed.taxonomicGroups?.length) this.lastTaxonomicGroups = parsed.taxonomicGroups;
      if (parsed.subgroupTerms?.length) this.lastSubgroupTerms = parsed.subgroupTerms;
      if (parsed.sources?.length) this.lastSources = parsed.sources;
      if (parsed.intent) this.lastIntent = parsed.intent;
      if (parsed.speciesQuery) this.lastSpeciesQuery = parsed.speciesQuery;
      else if (![INTENTS.SEARCH_SPECIES, INTENTS.VOUCHERS, INTENTS.COORDINATES].includes(parsed.intent)) this.lastSpeciesQuery = null;
      this.lastQuestion = parsed.rawText;
      this.lastTaxon = parsed.conversationTaxon?.normalized || this.lastTaxon;
      this.lastScope = parsed.scope || this.lastScope;
      this.lastUserIntent = parsed.conversationIntent || this.lastUserIntent;
      this.lastEvidenceSummary = evidence;
      this.lastSuccessfulSources = evidence?.sourcesSucceeded || [];
      this.lastFailedSources = evidence?.sourcesFailed || [];
      this.turnCount += 1;
      this.lastUpdatedAt = Date.now();
      this.resolveClarification();
    }
    clearRoutingContext() {
      this.lastMunicipalities = [];
      this.mode = null;
      this.lastClarification = null;
      this.repeatedClarificationCount = 0;
    }
    prepareForInput(classification) {
      if (this.lastUpdatedAt && Date.now() - this.lastUpdatedAt > this.contextTtlMs) this.clearRoutingContext();
      const changesTaxon = classification.taxon?.normalized && this.lastTaxon && classification.taxon.normalized !== this.lastTaxon;
      if (classification.shouldClearPreviousContext || changesTaxon) this.clearRoutingContext();
      this.lastTaxon = classification.taxon?.normalized || this.lastTaxon;
      this.lastScope = classification.scope || this.lastScope;
      this.lastUserIntent = classification.intent || this.lastUserIntent;
      this.lastUpdatedAt = Date.now();
    }
    recordClarification(question) {
      const clarification = String(question || "");
      this.repeatedClarificationCount = clarification === this.lastClarification
        ? this.repeatedClarificationCount + 1
        : 1;
      this.mode = "awaiting_municipality";
      this.lastClarification = clarification;
      this.lastUpdatedAt = Date.now();
      return this.repeatedClarificationCount;
    }
    resolveClarification() {
      this.mode = null;
      this.lastClarification = null;
      this.repeatedClarificationCount = 0;
    }
    clear() {
      this.lastMunicipalities = []; this.lastTaxonomicGroups = []; this.lastSubgroupTerms = [];
      this.lastSources = []; this.lastIntent = null; this.lastSpeciesQuery = null;
      this.lastQuestion = null; this.lastEvidenceSummary = null; this.lastSuccessfulSources = [];
      this.lastFailedSources = []; this.turnCount = 0;
      this.mode = null; this.lastClarification = null; this.repeatedClarificationCount = 0;
      this.lastTaxon = null; this.lastScope = SCOPES.UNKNOWN; this.lastUserIntent = null;
      this.lastUpdatedAt = 0; this.contextTtlMs = 1000 * 60 * 20;
      this.explainedSourceDifference = false; this.explainedInventoryLimits = false;
      this.explainedSpeciesLinkUnavailable = false; this.lastAnswerType = null;
    }
  }

  const api = {
    INTENTS, CONVERSATION_INTENTS, SCOPES, DATA_SCOPES, SLANG_MAP, SPECIES_BLACKLIST, TAXONOMIC_CORRECTIONS,
    normalizeText, slangAndAbbreviationResolver, correctTaxonomicTypos,
    levenshteinDistance, fuzzyMatch, municipalityResolver, taxonResolver, speciesQueryExtractor,
    sourceRouter, intentClassifier, queryPlanner, createEvidenceBundle, scientificGuardrails,
    responseValidator, styleValidator, answerLengthPolicy, isFollowUp, isSourceSwitch, hasContextualReference,
    detectConversationTaxon, detectConversationScope, classifyConversationIntent, ConversationState,
    detectAudienceProfile,
    textNormalizer: normalizeText,
    typoNormalizer: fuzzyMatch,
    typoCorrector: fuzzyMatch,
    slangResolver: slangAndAbbreviationResolver,
    speciesExtractor: speciesQueryExtractor,
    ambiguityResolver: municipalityResolver,
    clarificationManager: municipalityResolver,
    answerPlanner: queryPlanner,
  };
  global.HerpetoConversationCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
