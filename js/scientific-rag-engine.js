"use strict";

(function (global) {
  const coreDefault =
    global.HerpetoConversationCore ||
    (typeof require === "function" ? require("./conversation-core.js") : null);
  const knowledgeDefault =
    global.HerpetoScientificKnowledge ||
    (typeof require === "function" ? require("./scientific-knowledge-base.js") : null);
  const methodologyDefault =
    global.GoldScientificMethodologyEngine ||
    (typeof require === "function" ? require("./scientific-methodology-engine.js") : null);
  const herpetologyDefault =
    global.GoldHerpetologyEngine ||
    (typeof require === "function" ? require("./herpetology-engine.js") : null);
  const taxonomyDefault =
    global.GoldTaxonomyBackbone ||
    (typeof require === "function" ? require("./taxonomy-backbone.js") : null);
  const reliabilityDefault =
    global.GoldScientificReliability ||
    (typeof require === "function" ? require("./gold-scientific-reliability.js") : null);

  const STOPWORDS = new Set([
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
    "em", "entre", "essa", "esse", "isso", "na", "nas", "no", "nos", "o", "os",
    "para", "por", "qual", "que", "se", "sobre", "um", "uma", "fale", "explique",
  ]);

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
    return [...new Set(normalize(text).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token)))];
  }

  function compact(text, limit = 360) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, limit).replace(/\s+\S*$/, "")}...`;
  }

  function textQuality(text) {
    const value = String(text || "");
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) return 0;
    const words = clean.split(/\s+/);
    const weird = (clean.match(/[�□■_]{1,}|[A-Z]{12,}|\d{5,}/g) || []).length;
    const punctuationNoise = (clean.match(/[|{}<>~^=]{1,}/g) || []).length;
    const alpha = (clean.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    const chars = clean.length || 1;
    let score = 0.35;
    if (words.length >= 14) score += 0.18;
    if (words.length >= 35) score += 0.12;
    if (/[.!?]/.test(clean)) score += 0.08;
    if (alpha / chars > 0.62) score += 0.15;
    score -= Math.min(0.36, weird * 0.09 + punctuationNoise * 0.05);
    if (/(copyright|doi:|issn|figura\s+\d+|page\s+\d+|vol\.\s*\d+)/i.test(clean)) score -= 0.12;
    return Math.max(0, Math.min(1, score));
  }

  function genericPenalty(text) {
    const normalized = normalize(text);
    const genericPatterns = [
      /\bdados disponiveis\b/,
      /\bmais estudos sao necessarios\b/,
      /\bnao substitui\b/,
      /\bimportante para a conservacao\b/,
      /\bbase local apoia\b/,
    ];
    return genericPatterns.reduce((penalty, pattern) => penalty + (pattern.test(normalized) ? 0.08 : 0), 0);
  }

  function centralTerms(classification, query) {
    return [
      classification?.taxon?.normalized,
      ...tokens(query).filter((token) => token.length > 4),
    ].filter(Boolean);
  }

  function scoreEvidence(evidence, queryTokens, central) {
    const searchable = normalize([evidence.title, evidence.text, evidence.sourceId].join(" "));
    const lexical = queryTokens.reduce((score, token) => score + (searchable.includes(token) ? 0.08 : 0), 0);
    const centralBoost = central.some((term) => searchable.includes(normalize(term))) ? 0.18 : 0;
    const titleBoost = evidence.title ? 0.07 : 0;
    const pageBoost = evidence.page ? 0.04 : 0;
    const sourceBoost = evidence.sourceId || evidence.sourceType ? 0.05 : 0;
    const curatedBoost = evidence.sourceType === "curated" || evidence.sourceType === "glossary" ? 0.22 : 0;
    const quality = evidence.qualityScore ?? textQuality(evidence.text);
    const score = evidence.baseScore + lexical + centralBoost + titleBoost + pageBoost + sourceBoost + curatedBoost + quality * 0.34 - genericPenalty(evidence.text);
    return Math.max(0, Math.min(1, score));
  }

  function relevanceOverlap(evidence, queryTokens, central) {
    const searchable = [evidence.title, evidence.text, evidence.sourceId].join(" ");
    const searchableTokens = new Set(tokens(searchable));
    const tokenOverlap = queryTokens.reduce((count, token) => count + (searchableTokens.has(token) ? 1 : 0), 0);
    const centralOverlap = central.some((term) => {
      const parts = tokens(term);
      return parts.length > 0 && parts.every((part) => searchableTokens.has(part));
    }) ? 1 : 0;
    return tokenOverlap + centralOverlap;
  }

  function evidenceItem(item) {
    return {
      sourceType: item.sourceType || "unknown",
      title: item.title || item.term || item.name || item.source_file || "Evidência local",
      text: compact(item.text || item.definition || item.summary || item.semantic_summary || item.answer || item.notes || ""),
      page: item.page || null,
      score: item.score || 0,
      baseScore: item.baseScore || item.score || 0,
      qualityScore: item.qualityScore,
      sourceId: item.sourceId || item.article_id || item.document_id || item.id || item.source_json || null,
      origin: item.origin || null,
    };
  }

  function dedupeEvidence(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = normalize([item.sourceType, item.sourceId, item.title, item.page, item.text.slice(0, 80)].join("|"));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createScientificRagEngine(dependencies = {}) {
    const core = dependencies.core || coreDefault;
    const knowledge = dependencies.knowledge || knowledgeDefault;
    const methodology = dependencies.methodology || methodologyDefault;
    const herpetology = dependencies.herpetology || herpetologyDefault;
    const taxonomy = dependencies.taxonomy || taxonomyDefault;
    const reliability = dependencies.reliability || reliabilityDefault;
    const searchNeural = dependencies.searchNeural || null;

    function decideSources(classification, question = "") {
      const sources = ["curated", "glossary", "herpetology"];
      const q = normalize(question);
      const methodologyConcept =
        /\b(voucher|darwin core|specieslink|inaturalist|inventario|busca ativa|pitfall|esforco amostral|vies amostral|curva de acumulacao|ciencia cidada)\b/.test(q);
      if ([core?.DATA_SCOPES?.TAXONOMY_INDEX, "taxonomy_index"].includes(classification.dataScope)) sources.push("taxonomy_index");
      if (classification.dataScope === "literature_rag" || classification.intent === "general_scientific_question") sources.push("master", "chunks", "public_index", "pdf", "neural");
      if (classification.intent === "methodology_question" || methodologyConcept) sources.push("methodology", "master", "chunks", "public_index", "pdf");
      if (classification.intent === "popular_name_question" || classification.intent === "general_taxon_question") sources.push("herpetology", "taxonomy_index", "public_index", "pdf");
      if (classification.intent === "safety_question" || classification.dataScope === "safety") sources.push("herpetology", "master", "chunks", "public_index", "pdf");
      return [...new Set(sources)];
    }

    async function retrieve(question, options = {}) {
      const classification = options.classification || core.classifyConversationIntent(question);
      const sourcesToSearch = options.sourcesToSearch || decideSources(classification, question);
      const queryTokens = tokens(question);
      const central = centralTerms(classification, question);
      const evidence = [];
      const sourceFailures = [];

      async function attempt(sourceType, fn) {
        if (!sourcesToSearch.includes(sourceType)) return;
        try {
          await fn();
        } catch (error) {
          sourceFailures.push({ sourceType, error: error.message || String(error) });
        }
      }

      await attempt("methodology", async () => {
        const response = await methodology?.answerQuestion?.(question, { conversationIntent: classification.intent });
        if (response?.answer) evidence.push(evidenceItem({ sourceType: "curated", title: "Módulo metodológico local", text: response.answer, baseScore: 0.7, sourceId: "methodology" }));
      });

      await attempt("herpetology", async () => {
        const response = await herpetology?.answerQuestion?.(question, { conversationIntent: classification.intent });
        if (response?.answer) evidence.push(evidenceItem({ sourceType: "curated", title: "Herpetology Engine local", text: response.answer, baseScore: 0.72, sourceId: "herpetology" }));
      });

      await attempt("glossary", async () => {
        const entry = await knowledge?.findGlossaryEntry?.(question);
        if (entry) evidence.push(evidenceItem({ ...entry, sourceType: "glossary", title: entry.term, text: entry.definition, baseScore: 0.76 }));
        const mentions = await knowledge?.findGlossaryMentions?.(question, 3);
        (mentions || []).forEach((mention) => evidence.push(evidenceItem({ ...mention, sourceType: "glossary", title: mention.term, text: mention.definition, baseScore: 0.6 })));
      });

      await attempt("taxonomy_index", async () => {
        const taxon = classification.taxon?.normalized;
        if (!taxon) return;
        const summary = taxonomy?.getTaxonSummary ? await taxonomy.getTaxonSummary(taxon) : null;
        if (summary?.summary) evidence.push(evidenceItem({ sourceType: "taxonomy_index", title: taxon, text: summary.summary, baseScore: 0.68, sourceId: summary.id || taxon }));
      });

      await attempt("master", async () => {
        const plan = knowledge?.planQuestion?.(question, { conversationIntent: classification.intent }) || {};
        const articles = await knowledge?.retrieveArticles?.(question, plan.themes || [], 5);
        (articles || []).forEach((article) => evidence.push(evidenceItem({
          ...article,
          sourceType: "master",
          title: article.title || article.source_file,
          text: article.abstract || article.summary || "",
          baseScore: 0.42,
        })));
      });

      await attempt("chunks", async () => {
        const plan = knowledge?.planQuestion?.(question, { conversationIntent: classification.intent }) || {};
        const chunks = await knowledge?.retrieveChunks?.(question, plan.themes || [], 5);
        (chunks || []).forEach((chunk) => evidence.push(evidenceItem({
          ...chunk,
          sourceType: "chunk",
          title: chunk.title || chunk.source_file,
          text: chunk.text,
          baseScore: 0.36,
        })));
      });

      await attempt("public_index", async () => {
        const plan = knowledge?.planQuestion?.(question, { conversationIntent: classification.intent }) || {};
        const chunks = await knowledge?.retrievePublicScientificIndex?.(question, plan.themes || [], 7);
        (chunks || []).forEach((chunk) => evidence.push(evidenceItem({
          ...chunk,
          sourceType: "scientific_presentation_index",
          title: chunk.title || chunk.source_file,
          text: chunk.text,
          sourceId: chunk.documentId || chunk.id,
          baseScore: 0.46,
        })));
      });

      await attempt("pdf", async () => {
        const chunks = await knowledge?.searchPdfKnowledge?.(question, 5);
        (chunks || []).forEach((chunk) => evidence.push(evidenceItem({
          ...chunk,
          sourceType: "pdf",
          title: chunk.title,
          text: chunk.text,
          baseScore: 0.3,
        })));
      });

      await attempt("neural", async () => {
        if (!searchNeural) return;
        const results = await searchNeural(question, { limit: 5 });
        (results || []).forEach((result) => evidence.push(evidenceItem({
          ...result,
          sourceType: "neural",
          title: result.title,
          text: result.text || result.content,
          baseScore: 0.32,
        })));
      });

      const ranked = dedupeEvidence(evidence)
        .map((item) => {
          const qualityScore = textQuality(item.text);
          const score = scoreEvidence({ ...item, qualityScore, baseScore: item.baseScore || item.score || 0 }, queryTokens, central);
          const overlap = relevanceOverlap(item, queryTokens, central);
          return { ...item, qualityScore, score, relevanceOverlap: overlap };
        })
        .filter((item) => {
          if (item.qualityScore < 0.32 || item.score < 0.34) return false;
          if (["curated", "glossary", "taxonomy_index", "scientific_presentation_index"].includes(item.sourceType)) return true;
          return item.relevanceOverlap > 0;
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, options.limit || 8);

      const strongEvidence = ranked.filter((item) => item.score >= 0.58 || ["curated", "glossary", "taxonomy_index", "scientific_presentation_index"].includes(item.sourceType));
      const draftBundle = {
        evidence: ranked,
        primaryEvidence: strongEvidence.slice(0, 4),
      };
      const reliabilityAssessment = reliability?.assessEvidenceBundle
        ? reliability.assessEvidenceBundle(draftBundle)
        : null;
      return {
        userQuestion: question,
        classifiedIntent: classification,
        sourcesSearched: sourcesToSearch,
        sourceFailures,
        evidence: ranked,
        primaryEvidence: draftBundle.primaryEvidence,
        sufficientEvidence: reliabilityAssessment ? reliabilityAssessment.canAnswerSpecific : strongEvidence.length > 0,
        reliability: reliabilityAssessment,
        evidenceReferences: reliability?.formatEvidenceReferences
          ? reliability.formatEvidenceReferences(draftBundle.primaryEvidence)
          : [],
        notes: strongEvidence.length
          ? ["Conhecimento curado e trechos recuperados foram mantidos separados no pacote de evidências."]
          : ["Não há evidência local forte o suficiente para sustentar uma resposta específica."],
      };
    }

    function explainInsufficientEvidence(bundle) {
      if (bundle.sufficientEvidence) return null;
      if (bundle.reliability && reliability?.fallbackForWeakEvidence) return reliability.fallbackForWeakEvidence(bundle);
      return "Não encontrei evidência local forte o suficiente para responder com segurança. Posso dar uma explicação geral, mas não vou inventar citação nem tratar trecho fraco de OCR como fonte principal.";
    }

    return {
      normalize,
      tokens,
      textQuality,
      genericPenalty,
      scoreEvidence,
      decideSources,
      retrieve,
      explainInsufficientEvidence,
    };
  }

  const api = createScientificRagEngine();
  api.createScientificRagEngine = createScientificRagEngine;
  global.GoldScientificRagEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
