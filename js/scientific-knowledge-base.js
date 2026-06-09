(function (global) {
  const PATHS = {
    master: "../IAAprendaAqui/base_cientifica_master_unificada.json",
    glossary: "../IAAprendaAqui/glossario_ecologia_zoologia_normalizado.json",
    chunks: "../IAAprendaAqui/base_cientifica_chunks_rag_clean.jsonl",
    semanticComplement: "../IAAprendaAqui/base_cientifica_complemento_semantico_10x.json",
    taxonomy: "../IAAprendaAqui/taxonomy_local_index.json",
    publicScientificIndex: "../IAAprendaAqui/gold_scientific_presentation_index.json",
  };

  const STOPWORDS = new Set([
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
    "em", "entre", "essa", "esse", "isso", "na", "nas", "no", "nos", "o", "os",
    "para", "por", "qual", "que", "se", "sobre", "um", "uma",
  ]);

  const GLOSSARY_ALIASES = {
    loreal: ["fosseta lacrimal", "fosseta loreal", "fosseta"],
  };
  const CURATED_CONCEPTS = {
    ecossistema: {
      term: "Ecossistema",
      definition: "É o conjunto formado pelos seres vivos, pelo ambiente físico e pelas relações entre eles. Em um ecossistema, energia, água, nutrientes, abrigo e interações ecológicas conectam organismos e paisagem.",
      source_json: "síntese curada da base científica local",
    },
    ectotermico: {
      term: "Ectotérmico",
      definition: "É o animal cuja temperatura corporal varia principalmente conforme as condições externas. Anfíbios e répteis são ectotérmicos: comportamento, abrigo, exposição ao sol e umidade ajudam a regular sua atividade.",
      source_json: "síntese curada da base científica local",
    },
    pecilotermico: {
      term: "Pecilotérmico",
      definition: "É um termo usado para animais cuja temperatura corporal pode variar. Em herpetologia, a explicação mais útil costuma ser a ectotermia: anfíbios e répteis dependem fortemente das condições ambientais para regular sua temperatura.",
      source_json: "síntese curada da base científica local",
    },
  };

  const COMMON_TAXON_PROFILES = [
    {
      id: "jararaca",
      match: /\bjararacas?\b/,
      answer: [
        "Jararaca é um nome popular usado para serpentes peçonhentas do grupo Bothrops. Na Mata Atlântica e na Mantiqueira, Bothrops jararaca é uma referência importante, mas o nome popular sozinho não confirma a identificação.",
        "Em uma explicação geral, vale separar nome popular de espécie: o gênero Bothrops inclui, entre outras, Bothrops jararaca, Bothrops jararacussu, Bothrops alternatus, Bothrops moojeni, Bothrops neuwiedi, Bothrops atrox, Bothrops erythromelas e Bothrops leucurus. Essa seleção é introdutória, não um checklist completo nem uma lista de ocorrência municipal.",
        "Elas têm papel ecológico relevante como predadoras, inclusive de pequenos vertebrados. Podem ocorrer em áreas florestais, bordas e ambientes rurais. Se encontrar uma, mantenha distância, não tente capturar nem matar e deixe uma rota livre para o animal se afastar.",
        "Em caso de picada, procure atendimento médico imediatamente. Não faça torniquete, não corte, não fure e não aplique substâncias no local. Fonte de segurança: Ministério da Saúde, Acidentes Ofídicos.",
        "Posso aprofundar por identificação, segurança, hábitos, conservação ou registros em um município da Mantiqueira.",
      ].join("\n\n"),
      source: "Ministério da Saúde: https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/acidentes-ofidicos",
    },
    {
      id: "sapos",
      match: /\bsapos?\b/,
      answer: [
        "Sapo é um nome popular amplo, não uma identificação taxonômica precisa. No uso cotidiano brasileiro, ele costuma lembrar anuros mais terrestres e robustos, muitas vezes associados à família Bufonidae, como espécies do gênero Rhinella.",
        "Mas Anura é uma ordem diversa: inclui animais chamados popularmente de sapos, rãs e pererecas. Esses nomes ajudam na conversa, porém não substituem características diagnósticas, localidade, fotos adequadas e revisão especializada.",
        "Posso explicar a diferença geral entre esses nomes, aprofundar Bufonidae e Rhinella ou consultar registros de anuros em um município.",
      ].join("\n\n"),
      source: "síntese curada da base científica local",
    },
    {
      id: "bothrops",
      match: /\bbothrops\b/,
      answer: [
        "Bothrops é um gênero de serpentes peçonhentas da família Viperidae. No Brasil, nomes populares como jararaca, jararacuçu, urutu e caiçaca podem ser usados para espécies desse grupo.",
        "Alguns exemplos conhecidos são Bothrops jararaca, Bothrops jararacussu, Bothrops alternatus, Bothrops moojeni, Bothrops neuwiedi, Bothrops atrox, Bothrops erythromelas e Bothrops leucurus. Essa é uma seleção introdutória, não uma lista completa: a diversidade e a taxonomia do grupo exigem consulta atualizada.",
        "Posso explicar diferenças gerais entre essas espécies ou consultar quais registros aparecem em um município da Mantiqueira.",
      ].join("\n\n"),
      source: "Ministério da Saúde: https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/acidentes-ofidicos; The Reptile Database: https://reptile-database.reptarium.cz/advanced_search?genus=bothrops&location=brazil&submit=search",
    },
  ];

  const EDUCATIONAL_QUESTION =
    /\b(o que(?: e)?|oq(?: e)?|o que sao|sao o que|e o que|defina|definicao|significa|explique|explica|me explica|me explique|fale sobre|conte sobre|tenho duvida|duvida sobre|para que serve|qual a funcao|funcao d|como funciona|qual a diferenca|diferenca entre|conceito)\b/;

  const HIGHER_TAXON_PROFILES = {
    animalia: { rank: "reino", answer: "Animalia é o reino dos animais: organismos eucariontes, multicelulares e heterotróficos." },
    chordata: { rank: "filo", answer: "Chordata é o filo que inclui animais com notocorda em alguma fase do desenvolvimento. Vertebrados, incluindo anfíbios e répteis, pertencem a esse filo." },
    amphibia: { rank: "classe", answer: "Amphibia é a classe dos anfíbios. Inclui anuros, como sapos, rãs e pererecas, além de cecílias e salamandras." },
    reptilia: { rank: "classe", answer: "Reptilia é a classe tradicionalmente usada para répteis. Em perguntas locais do Gold, ela organiza registros de serpentes, lagartos, quelônios e outros répteis." },
    anura: { rank: "ordem", answer: "Anura é a ordem dos anfíbios adultos sem cauda, como sapos, rãs e pererecas." },
    squamata: { rank: "ordem", answer: "Squamata é a ordem que inclui serpentes, lagartos e anfisbenas." },
    serpentes: { rank: "subordem", answer: "Serpentes é o grupo zoológico das serpentes, dentro de Squamata." },
  };

  const TOPICS = [
    {
      id: "museum_data",
      match: /\b(colecao|colecoes|museu|museus|voucher|vouchers|material preservado|specieslink|darwin core|dados secundarios)\b/,
      title: "registros de coleções e vouchers",
      summary: "Registros de coleções são evidências documentais valiosas: preservam histórico de coleta, instituição, catálogo e, em muitos casos, localidade. Eles ajudam a reconstruir distribuições e mudanças ao longo do tempo. Ainda assim, precisam de revisão taxonômica, checagem de coordenadas e leitura do esforço amostral.",
      themes: ["biodiversity_informatics", "conservacao"],
    },
    {
      id: "citizen_science",
      match: /\b(ciencia cidada|inaturalist|observadores|observacoes publicas|foto|fotografias)\b/,
      title: "ciência cidadã",
      summary: "A ciência cidadã amplia muito a cobertura espacial e temporal das observações, especialmente quando há fotos e identificação comunitária. Ela é ótima para acompanhar o que foi observado publicamente, mas a intensidade dos registros varia com acesso, interesse dos usuários e esforço de observação.",
      themes: ["ciencia_cidada", "biodiversity_informatics"],
    },
    {
      id: "sampling_bias",
      match: /\b(vies|amostragem|esforco amostral|georreferenciamento|coordenada|coordenadas|incerteza espacial|qualidade de dados)\b/,
      title: "viés amostral e qualidade espacial",
      summary: "Mais registros não significam automaticamente mais biodiversidade. Trilhas acessíveis, estradas, cidades, expedições e observadores ativos podem concentrar dados em certos locais. Coordenadas também precisam de cuidado: precisão, origem e consistência espacial influenciam qualquer interpretação.",
      themes: ["biodiversity_informatics", "sdm_modelagem_distribuicao", "conservacao"],
    },
    {
      id: "sdm",
      match: /\b(modelagem|modelo de distribuicao|distribuicao potencial|nicho ecologico|sdm|adequabilidade ambiental)\b/,
      title: "modelagem de distribuição de espécies",
      summary: "Modelos de distribuição relacionam registros de ocorrência com variáveis ambientais para estimar áreas potencialmente adequadas. São úteis para formular hipóteses e apoiar conservação, mas não provam presença, não substituem campo e são sensíveis à qualidade dos registros e ao desenho analítico.",
      themes: ["sdm_modelagem_distribuicao", "ecologia", "conservacao"],
    },
    {
      id: "atlantic_forest",
      match: /\b(mata atlantica|mantiqueira|itaguar[eé]|vale historico|floresta|fragmentacao|remanescente)\b/,
      title: "Mata Atlântica e herpetofauna",
      summary: "A herpetofauna responde fortemente às condições locais da paisagem. Umidade, disponibilidade de riachos, altitude, cobertura florestal, micro-hábitats e fragmentação podem alterar quais anfíbios e répteis são registrados. Por isso, listas municipais são uma porta de entrada, não uma descrição completa da comunidade.",
      themes: ["mata_atlantica", "serra_da_mantiqueira", "herpetologia", "ecologia"],
    },
    {
      id: "conservation",
      match: /\b(conservacao|preservacao|rppn|reserva|ameaca|ameacada|prioridade|manejo)\b/,
      title: "conservação",
      summary: "Dados de biodiversidade ajudam a identificar lacunas, orientar novas buscas e reconhecer áreas que merecem atenção. Para decisões de conservação, o ideal é combinar registros públicos, vouchers, validação taxonômica, conhecimento local e levantamentos de campo planejados.",
      themes: ["conservacao", "ecologia", "herpetologia"],
    },
    {
      id: "local_ecology",
      match: /\b(altitude|umidade|riacho|riachos|agua|microhabitat|micro-habitat|habitat|temperatura|chuva|sazonalidade|paisagem|comunidade)\b/,
      title: "ecologia local da herpetofauna",
      summary: "Anfíbios e répteis não respondem apenas ao limite administrativo de um município. Umidade, temperatura, altitude, riachos, cobertura vegetal, micro-hábitats e sazonalidade ajudam a explicar onde diferentes táxons podem ser observados. A lista de registros mostra pistas da paisagem, mas a interpretação ecológica precisa de amostragem planejada.",
      themes: ["herpetologia", "ecologia", "mata_atlantica", "serra_da_mantiqueira"],
    },
    {
      id: "field_inventory_methods",
      match: /\b(inventario|levantamento|amostragem ativa|busca ativa|procura visual|pitfall|armadilha de interceptacao|encontro ocasional|metodologia de campo|esforco amostral)\b/,
      title: "inventários e métodos de campo",
      summary: "Um inventário exige desenho amostral, recorte espacial, período de estudo, esforço documentado e métodos adequados ao grupo investigado. Busca ativa, encontros ocasionais e armadilhas de interceptação podem contribuir de maneiras diferentes. Uma lista recuperada de bases públicas ajuda a planejar o trabalho, mas não equivale a um inventário padronizado.",
      themes: ["herpetologia", "ecologia", "conservacao"],
    },
    {
      id: "ecosystem_ecology",
      match: /\b(ecologia|ecossistema|ecossistemas|cadeia alimentar|teia alimentar|predador|presa|decompositor|simbiose|habitat|nicho)\b/,
      title: "ecologia de ecossistemas",
      summary: "A ecologia observa relações: organismos, ambiente, recursos e interações. Habitat descreve onde uma espécie vive; nicho envolve como ela usa recursos e se relaciona com o ambiente. Cadeias e teias alimentares ajudam a entender fluxos de energia, enquanto predação, competição e simbiose mostram como as espécies influenciam umas às outras.",
      themes: ["ecologia", "conservacao"],
    },
    {
      id: "herpetofauna_zoology",
      match: /\b(zoologia|anfibio|anfibios|reptil|repteis|anuro|anuros|girino|girinos|serpente|serpentes|quelonio|quelonios|lagarto|lagartos|herpetofauna)\b/,
      title: "zoologia da herpetofauna",
      summary: "Anfíbios e répteis são vertebrados ectotérmicos, mas formam linhagens distintas. Anfíbios costumam ter pele mais permeável e ciclos de vida fortemente ligados à água ou à umidade. Répteis apresentam pele queratinizada e estratégias reprodutivas mais independentes da água livre, embora cada grupo tenha grande diversidade ecológica.",
      themes: ["herpetologia", "zoologia", "ecologia"],
    },
  ];

  function removeAccents(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalize(text) {
    return removeAccents(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(text) {
    return normalize(text)
      .split(" ")
      .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  }

  function compact(text, limit = 220) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, limit).replace(/\s+\S*$/, "")}...`;
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function adaptAnswerToAudience(answer, parsed = {}) {
    const text = String(answer || "").trim();
    const audience = parsed.audienceProfile || parsed.audience;
    if (audience === "child") {
      return `Vou explicar de um jeito simples.\n\n${compact(text, 760)}`;
    }
    if (audience === "technical") {
      return `${text}\n\nLeitura técnica: diferencie hipótese ecológica, evidência observacional e inferência causal ao interpretar os dados.`;
    }
    return text;
  }

  function createKnowledgeBase(dependencies = {}) {
    const isBrowser = typeof window !== "undefined";
    const searchPdfKnowledge = dependencies.searchPdfKnowledge || (isBrowser
      ? async (question, limit = 4) => {
          try {
            const response = await fetch(`/api/gold/neural/search?q=${encodeURIComponent(question)}&limit=${limit}`);
            if (!response.ok) return [];
            return (await response.json()).results || [];
          } catch {
            return [];
          }
        }
      : async (question, limit = 4) => {
          try {
            return await require("./knowledge-pdf-index.js").searchPdfKnowledge(question, { limit });
          } catch {
            return [];
          }
        });
    const loadJson = dependencies.loadJson || (isBrowser
      ? async (path) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`knowledge_http_${response.status}`);
          return response.json();
        }
      : async (path) => {
          const fs = require("fs/promises");
          const nodePath = require("path");
          return JSON.parse(await fs.readFile(nodePath.join(__dirname, path), "utf8"));
        });
    const loadText = dependencies.loadText || (isBrowser
      ? async (path) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`knowledge_http_${response.status}`);
          return response.text();
        }
      : async (path) => {
          const fs = require("fs/promises");
          const nodePath = require("path");
          return fs.readFile(nodePath.join(__dirname, path), "utf8");
        });
    let masterPromise;
    let glossaryPromise;
    let chunksPromise;
    let semanticComplementPromise;
    let taxonomyPromise;
    let publicScientificIndexPromise;

    const loadMaster = () => masterPromise ||= loadJson(PATHS.master);
    const loadGlossary = () => glossaryPromise ||= loadJson(PATHS.glossary);
    const loadChunks = () => chunksPromise ||= loadText(PATHS.chunks).then((text) =>
      text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    );
    const loadSemanticComplement = () => semanticComplementPromise ||= loadJson(PATHS.semanticComplement);
    const emptyTaxonomyIndex = { species_by_genus: {}, genera: [], families: [] };
    const loadTaxonomyIndex = () => taxonomyPromise ||= loadJson(PATHS.taxonomy)
      .then((index) => index || emptyTaxonomyIndex)
      .catch(() => emptyTaxonomyIndex);
    const loadPublicScientificIndex = () => publicScientificIndexPromise ||= loadJson(PATHS.publicScientificIndex)
      .then((index) => index || { entries: [] })
      .catch(() => ({ entries: [] }));

    function semanticExpansionTerms(complement, question, themes = []) {
      const q = normalize(question);
      return unique(
        Object.entries(complement?.controlled_themes || {})
          .filter(([themeId, theme]) =>
            themes.includes(themeId) ||
            q.includes(normalize(themeId)) ||
            (theme.query_expansions || []).some((term) => q.includes(normalize(term)))
          )
          .flatMap(([, theme]) => theme.query_expansions || [])
          .map(normalize)
      );
    }

    function scoreDocument(queryTokens, searchableText, boosts = []) {
      const haystack = normalize(searchableText);
      return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0) +
        boosts.reduce((score, token) => score + (haystack.includes(normalize(token)) ? 3 : 0), 0);
    }

    function glossaryAliases(term) {
      const normalizedTerm = normalize(term);
      return unique([
        ...normalizedTerm.split(/\s+ou\s+/),
        ...(GLOSSARY_ALIASES[normalizedTerm] || []),
      ].map((alias) => alias.trim()).filter((alias) => alias.length > 3));
    }

    function glossaryDisplayTerm(entry) {
      return normalize(entry.term) === "loreal" ? "Fosseta lacrimal ou loreal" : entry.term;
    }

    function containsAlias(text, alias) {
      const escaped = normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(normalize(text));
    }

    function findCuratedConcept(question) {
      return Object.entries(CURATED_CONCEPTS)
        .filter(([alias]) => containsAlias(question, alias))
        .sort(([left], [right]) => right.length - left.length)[0]?.[1] || null;
    }

    function findCommonTaxonProfile(question) {
      const q = normalize(question);
      return COMMON_TAXON_PROFILES.find((profile) => profile.match.test(q)) || null;
    }

    function taxonomyRequest(question) {
      const raw = String(question || "");
      const q = normalize(raw);
      const family = raw.match(/\b([A-Z][a-z]+idae)\b/)?.[1] || null;
      const explicitGenus = raw.match(/\b(?:g[eê]nero|especies?\s+de|espécies?\s+de)\s+([A-Z][a-z]{2,})\b/i)?.[1] || null;
      const singleTaxon = raw.match(/^\s*(?:o que [ée]\s+|fale sobre\s+|explique\s+)?([A-Z][a-z]{2,})\??\s*$/i)?.[1] || null;
      const higherTaxon = Object.entries(HIGHER_TAXON_PROFILES)
        .find(([name]) => new RegExp(`\\b${name}\\b`, "i").test(q));
      if (family) return { rank: "família", name: family };
      if (explicitGenus) return { rank: "gênero", name: explicitGenus };
      if (higherTaxon) return { rank: higherTaxon[1].rank, name: higherTaxon[0], profile: higherTaxon[1] };
      if (singleTaxon && /^[A-Z]/.test(singleTaxon)) return { rank: "táxon", name: singleTaxon };
      return null;
    }

    function looksLikeTaxonomyQuestion(question) {
      const q = normalize(question);
      return Boolean(
        taxonomyRequest(question) ||
        /\b(taxonomia|taxonomico|classificacao|reino|filo|classe|ordem|familia|genero|especies de)\b/.test(q)
      );
    }

    async function answerTaxonomyQuestion(question, parsed = {}) {
      const request = taxonomyRequest(question);
      if (!request) return null;
      if (request.profile) {
        return {
          answer: adaptAnswerToAudience(`${request.profile.answer}\n\nPosso aprofundar a classificação, a ecologia ou os registros locais desse grupo.`, parsed),
          kind: "higher_taxon_profile",
          evidence: [request.profile],
        };
      }
      const taxonomy = await loadTaxonomyIndex();
      if (request.rank === "família") {
        const family = (taxonomy.families || []).find((item) => normalize(item.name) === normalize(request.name));
        if (!family) return null;
        return {
          answer: adaptAnswerToAudience([
            `${family.name} é uma família taxonômica mencionada na biblioteca herpetológica local.`,
            `O índice local encontrou ${family.mentions} menções distribuídas em ${family.documents} documentos.`,
            "Essa contagem mede presença textual na biblioteca, não riqueza de espécies nem ocorrência em um município. Posso aprofundar a família ou consultar registros locais com um filtro geográfico.",
          ].join("\n\n"), parsed),
          kind: "taxonomy_index_family",
          evidence: [family],
        };
      }
      const genus = (taxonomy.genera || []).find((item) => normalize(item.name) === normalize(request.name));
      const species = (taxonomy.species_by_genus?.[request.name] || []).slice(0, 12);
      if (!genus || !species.length) return null;
      return {
        answer: adaptAnswerToAudience([
          `${genus.name} aparece como gênero na biblioteca herpetológica local.`,
          `Algumas espécies mencionadas na base:\n${species.map((item) => `- ${item.name}`).join("\n")}`,
          "Esta é uma lista de menções recuperadas da biblioteca local, não um checklist oficial nem uma revisão taxonômica completa. Para confirmar validade nomenclatural, distribuição ou ocorrência municipal, é preciso consultar uma fonte taxonômica atualizada e aplicar o filtro adequado.",
        ].join("\n\n"), parsed),
        kind: "taxonomy_index_genus",
        evidence: [genus, ...species],
      };
    }

    async function findGlossaryEntry(question) {
      const q = normalize(question);
      const asksDefinition = /\b(o que(?: e)?|oq(?: e)?|o que sao|defina|definicao|significa|explique o termo|conceito de)\b/.test(q);
      if (!asksDefinition) return null;
      const glossary = await loadGlossary();
      const entries = glossary.entries || [];
      return entries
        .map((entry) => ({ entry, aliases: glossaryAliases(entry.term) }))
        .map(({ entry, aliases }) => ({ entry, matchedAlias: aliases.find((alias) => containsAlias(q, alias)) }))
        .filter(({ matchedAlias }) => matchedAlias)
        .sort((a, b) => b.matchedAlias.length - a.matchedAlias.length)[0]?.entry || null;
    }

    async function findGlossaryMentions(question, limit = 3) {
      const q = normalize(question);
      const glossary = await loadGlossary();
      const seen = new Set();
      return (glossary.entries || [])
        .map((entry) => ({ entry, aliases: glossaryAliases(entry.term) }))
        .map(({ entry, aliases }) => ({ entry, matchedAlias: aliases.find((alias) => containsAlias(q, alias)) }))
        .filter(({ matchedAlias }) => matchedAlias)
        .filter(({ matchedAlias }) => {
          if (seen.has(matchedAlias)) return false;
          seen.add(matchedAlias);
          return true;
        })
        .sort((a, b) => b.matchedAlias.length - a.matchedAlias.length)
        .slice(0, limit)
        .map(({ entry }) => entry);
    }

    async function retrieveArticles(question, themes = [], limit = 4) {
      const master = await loadMaster();
      const complement = await loadSemanticComplement();
      const semanticTerms = semanticExpansionTerms(complement, question, themes);
      const queryTokens = unique([...tokens(question), ...semanticTerms.flatMap(tokens)]);
      return (master.articles || [])
        .map((article) => {
          const searchable = [article.title, article.abstract, article.keywords?.join(" "), article.themes?.join(" ")].join(" ");
          const themeBoost = themes.filter((theme) => article.themes?.includes(theme)).length * 4;
          const semanticSummary = (complement.article_semantic_summaries || []).find((summary) =>
            summary.article_id === article.article_id ||
            normalize(summary.title || summary.source_file) === normalize(article.title || article.source_file)
          );
          const semanticBoost = semanticSummary
            ? scoreDocument(queryTokens, [
                semanticSummary.semantic_summary,
                semanticSummary.summary,
                semanticSummary.keywords?.join(" "),
                semanticSummary.themes?.join(" "),
              ].join(" "))
            : 0;
          return { ...article, score: scoreDocument(queryTokens, searchable) + themeBoost + semanticBoost };
        })
        .filter((article) => article.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    async function retrieveChunks(question, themes = [], limit = 3) {
      const complement = await loadSemanticComplement();
      const semanticTerms = semanticExpansionTerms(complement, question, themes);
      const queryTokens = unique([...tokens(question), ...semanticTerms.flatMap(tokens)]);
      const chunks = await loadChunks();
      return chunks
        .map((chunk) => {
          const searchable = [chunk.title, chunk.keywords?.join(" "), chunk.themes?.join(" "), chunk.text].join(" ");
          const themeBoost = themes.filter((theme) => chunk.themes?.includes(theme)).length * 3;
          return { ...chunk, score: scoreDocument(queryTokens, searchable) + themeBoost };
        })
        .filter((chunk) => chunk.score > 2)
        .sort((a, b) => b.score - a.score)
        .filter((chunk, index, all) => all.findIndex((item) => item.article_id === chunk.article_id) === index)
        .slice(0, limit);
    }

    async function retrievePublicScientificIndex(question, themes = [], limit = 5) {
      const index = await loadPublicScientificIndex();
      const complement = await loadSemanticComplement();
      const semanticTerms = semanticExpansionTerms(complement, question, themes);
      const queryTokens = unique([...tokens(question), ...semanticTerms.flatMap(tokens)]);
      if (!queryTokens.length) return [];
      return (index.entries || [])
        .map((entry) => {
          const searchable = [
            entry.title,
            entry.text,
            entry.themes?.join(" "),
            entry.keywords?.join(" "),
            entry.taxa?.join(" "),
            entry.methods?.join(" "),
            entry.citation?.reference,
          ].join(" ");
          const themeBoost = themes.filter((theme) => entry.themes?.includes(theme)).length * 4;
          const score = scoreDocument(queryTokens, searchable) + themeBoost + (entry.score || 0);
          return {
            ...entry,
            sourceType: "scientific_presentation_index",
            sourceId: entry.documentId || entry.id,
            source_file: entry.sourceFile,
            article_id: entry.documentId,
            year: entry.citation?.year,
            doi: entry.citation?.doi,
            reference: entry.citation?.reference,
            score,
          };
        })
        .filter((entry) => entry.score > 3)
        .sort((a, b) => b.score - a.score)
        .filter((entry, index, all) => all.findIndex((item) => item.documentId === entry.documentId) === index)
        .slice(0, limit);
    }

    function articleLabel(article) {
      const title = compact(article.title || article.source_file || "Documento científico", 92);
      return article.year ? `${title} (${article.year})` : title;
    }

    function shouldHandle(question, parsed = {}) {
      const q = normalize(question);
      return looksLikeTaxonomyQuestion(question) ||
        (!parsed.municipalities?.length && COMMON_TAXON_PROFILES.some((profile) => profile.match.test(q))) ||
        TOPICS.some((topic) => topic.match.test(q)) ||
        EDUCATIONAL_QUESTION.test(q) ||
        /\b(ecologia|zoologia|conservacao|preservacao|rppn|reserva|mata atlantica|mantiqueira|vies|amostragem|georreferenciamento|modelo de distribuicao|nicho ecologico|ciencia cidada|darwin core|colecao cientifica|voucher|serve para artigo|aprofund|referencias|fontes cientificas)\b/.test(q);
    }

    function analyzeQuestion(question, parsed = {}) {
      const q = normalize(question);
      const matchedTopics = TOPICS.filter((topic) => topic.match.test(q));
      const asksDefinition = /\b(o que(?: e)?|oq(?: e)?|o que sao|defina|definicao|significa|explique o termo|conceito de)\b/.test(q);
      const asksDeep = /\b(aprofund|referencias|fontes cientificas|discuta|artigo|evidencias|metodologia|vies)\b/.test(q);
      const asksInterpretation = /\b(explique|por que|porque|como|relacao|impacto|importancia|afeta|influencia|discuta|analise|interpret\w*)\b/.test(q);
      const hasMunicipality = Boolean(parsed.municipalities?.length);
      const hasScientificContext = matchedTopics.length > 0 || shouldHandle(question, parsed);
      const mode = hasMunicipality && hasScientificContext && (asksInterpretation || asksDeep)
        ? "hybrid"
        : hasMunicipality
          ? "data"
          : hasScientificContext || asksDefinition
          ? asksDeep ? "scientific_deep" : "scientific"
          : "data";
      return { q, matchedTopics, asksDefinition, asksDeep, asksInterpretation, hasMunicipality, hasScientificContext, mode };
    }

    function planQuestion(question, parsed = {}) {
      const analysis = analyzeQuestion(question, parsed);
      return {
        mode: analysis.mode,
        useBiodiversityData: analysis.mode === "hybrid" || analysis.mode === "data",
        useGlossary: analysis.asksDefinition,
        useArticles: analysis.mode !== "data",
        useChunks: analysis.asksDeep,
        topicIds: analysis.matchedTopics.map((topic) => topic.id),
        themes: unique(analysis.matchedTopics.flatMap((topic) => topic.themes)),
      };
    }

    async function buildScientificContext(question, options = {}) {
      const analysis = analyzeQuestion(question, options.parsed || {});
      const matchedTopics = analysis.matchedTopics;
      if (!matchedTopics.length) return null;
      const themes = unique(matchedTopics.flatMap((topic) => topic.themes));
      const deep = options.deep ?? analysis.asksDeep;
      const articles = await retrieveArticles(question, themes, deep ? 5 : 3);
      const chunks = deep ? await retrieveChunks(question, themes, 3) : [];
      const publicScientificIndex = await retrievePublicScientificIndex(question, themes, deep ? 6 : 4);
      return { matchedTopics, themes, deep, articles, chunks, publicScientificIndex };
    }

    async function answerQuestion(question, parsed = {}) {
      const commonTaxonProfile = findCommonTaxonProfile(question);
      if (commonTaxonProfile && commonTaxonProfile.id !== "bothrops") {
        return {
          answer: adaptAnswerToAudience(commonTaxonProfile.answer, parsed),
          kind: "common_taxon_profile",
          evidence: [commonTaxonProfile],
        };
      }

      const taxonomyAnswer = await answerTaxonomyQuestion(question, parsed);
      if (taxonomyAnswer) return taxonomyAnswer;

      if (commonTaxonProfile) {
        return {
          answer: adaptAnswerToAudience(commonTaxonProfile.answer, parsed),
          kind: "common_taxon_profile",
          evidence: [commonTaxonProfile],
        };
      }

      const curatedConcept = findCuratedConcept(question);
      if (curatedConcept && EDUCATIONAL_QUESTION.test(normalize(question))) {
        return {
          answer: adaptAnswerToAudience([
            `Boa pergunta. ${curatedConcept.term} é:`,
            curatedConcept.definition,
            `Fonte local: ${curatedConcept.source_json}.`,
          ].join("\n\n"), parsed),
          kind: "glossary",
          evidence: [curatedConcept],
        };
      }
      const glossaryEntry = await findGlossaryEntry(question);
      if (glossaryEntry) {
        return {
          answer: adaptAnswerToAudience([
            `Boa pergunta. ${glossaryDisplayTerm(glossaryEntry)} é:`,
            compact(glossaryEntry.definition, 620),
            `Fonte local: glossário científico (${glossaryEntry.source_json}).`,
          ].join("\n\n"), parsed),
          kind: "glossary",
          evidence: [glossaryEntry],
        };
      }

      const glossaryMentions = await findGlossaryMentions(question, 3);
      if (glossaryMentions.length && EDUCATIONAL_QUESTION.test(normalize(question))) {
        return {
          answer: adaptAnswerToAudience([
            "Boa pergunta. Encontrei estes conceitos na base local:",
            ...glossaryMentions.map((entry) => `${glossaryDisplayTerm(entry)}: ${compact(entry.definition, 420)}`),
            "Fonte local: glossário científico de ecologia e zoologia.",
          ].join("\n\n"), parsed),
          kind: "glossary",
          evidence: glossaryMentions,
        };
      }

      const context = await buildScientificContext(question, { parsed });
      if (!context) return null;
      const { matchedTopics, deep, articles, chunks, publicScientificIndex } = context;
      const pdfChunks = await searchPdfKnowledge(question, deep ? 5 : 2);
      const summaries = matchedTopics.slice(0, 2).map((topic) => topic.summary);
      const sourceLines = articles.slice(0, deep ? 5 : 3).map((article) => `- ${articleLabel(article)}`);
      const evidenceLines = chunks.map((chunk) => `- ${articleLabel(chunk)}: ${compact(chunk.text, 180)}`);
      const indexLines = publicScientificIndex.map((chunk) => {
        const label = chunk.reference || chunk.citation?.reference || articleLabel(chunk);
        const page = chunk.page ? `, p. ${chunk.page}` : "";
        return `- ${compact(label, 120)}${page}: ${compact(chunk.text, 180)}`;
      });
      const pdfLines = pdfChunks.map((chunk) => `- ${compact(chunk.title, 92)}, p. ${chunk.page}: ${compact(chunk.text, 180)}`);
      const sections = [
        "Vamos olhar isso com cuidado.",
        summaries.join("\n\n"),
      ];
      if (sourceLines.length) sections.push(`Materiais relacionados na base local:\n${sourceLines.join("\n")}`);
      if (deep && evidenceLines.length) sections.push(`Pistas recuperadas para aprofundamento:\n${evidenceLines.join("\n")}`);
      if (indexLines.length) sections.push(`Índice científico ampliado do Gold:\n${indexLines.join("\n")}`);
      if (pdfLines.length) sections.push(`Biblioteca herpetológica local:\n${pdfLines.join("\n")}`);
      if (deep) sections.push("Para uso científico, vale documentar filtros, data da consulta, fontes utilizadas, qualidade dos registros e limitações da análise.");
      sections.push("Nota: a base local apoia a interpretação científica, mas não substitui a leitura integral dos artigos nem a validação de campo.");
      return { answer: adaptAnswerToAudience(sections.join("\n\n"), parsed), kind: deep ? "rag" : "topic", evidence: [...articles, ...chunks, ...publicScientificIndex, ...pdfChunks] };
    }

    async function enrichDataAnswer(question, dataAnswer, parsed = {}) {
      const context = await buildScientificContext(question, { parsed });
      if (!context) return { answer: dataAnswer, evidence: [] };
      const summaries = context.matchedTopics.slice(0, 2).map((topic) => topic.summary);
      const articleLines = context.articles.slice(0, context.deep ? 4 : 2).map((article) => `- ${articleLabel(article)}`);
      const indexLines = context.publicScientificIndex.slice(0, context.deep ? 4 : 2).map((chunk) => {
        const label = chunk.reference || chunk.citation?.reference || articleLabel(chunk);
        return `- ${compact(label, 120)}${chunk.page ? `, p. ${chunk.page}` : ""}`;
      });
      const pdfChunks = await searchPdfKnowledge(question, context.deep ? 4 : 2);
      const pdfLines = pdfChunks.map((chunk) => `- ${compact(chunk.title, 92)}, p. ${chunk.page}`);
      const sections = [
        dataAnswer,
        `Leitura ecológica:\n${summaries.join("\n\n")}`,
      ];
      if (articleLines.length) sections.push(`Base científica local relacionada:\n${articleLines.join("\n")}`);
      if (indexLines.length) sections.push(`Índice científico ampliado relacionado:\n${indexLines.join("\n")}`);
      if (pdfLines.length) sections.push(`Biblioteca herpetológica local relacionada:\n${pdfLines.join("\n")}`);
      sections.push("Cuidado na interpretação: registros disponíveis ajudam a formular hipóteses locais, mas não demonstram causa ecológica nem substituem levantamento de campo.");
      return { answer: adaptAnswerToAudience(sections.join("\n\n"), parsed), evidence: [...context.articles, ...context.chunks, ...context.publicScientificIndex, ...pdfChunks] };
    }

    return {
      PATHS, TOPICS, normalize, tokens, shouldHandle, analyzeQuestion, planQuestion,
      answerQuestion, enrichDataAnswer, buildScientificContext, findGlossaryEntry,
      findGlossaryMentions, findCommonTaxonProfile, retrieveArticles, retrieveChunks, loadMaster, loadGlossary, loadChunks,
      retrievePublicScientificIndex, loadPublicScientificIndex, loadSemanticComplement, loadTaxonomyIndex, taxonomyRequest, looksLikeTaxonomyQuestion,
      answerTaxonomyQuestion, semanticExpansionTerms, adaptAnswerToAudience, searchPdfKnowledge,
    };
  }

  const api = createKnowledgeBase();
  api.createKnowledgeBase = createKnowledgeBase;
  global.HerpetoScientificKnowledge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
