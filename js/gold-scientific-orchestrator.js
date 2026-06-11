"use strict";

(function (global) {
  const coreDefault =
    global.HerpetoConversationCore ||
    (typeof require === "function" ? require("./conversation-core.js") : null);
  const herpetologyDefault =
    global.GoldHerpetologyEngine ||
    (typeof require === "function" ? require("./herpetology-engine.js") : null);
  const methodologyDefault =
    global.GoldScientificMethodologyEngine ||
    (typeof require === "function" ? require("./scientific-methodology-engine.js") : null);
  const municipalDefault =
    global.GoldMunicipalBiodiversityEngine ||
    (typeof require === "function" ? require("./municipal-biodiversity-engine.js") : null);
  const taxonomyDefault =
    global.GoldTaxonomyBackbone ||
    (typeof require === "function" ? require("./taxonomy-backbone.js") : null);
  const ragDefault =
    global.GoldScientificRagEngine ||
    (typeof require === "function" ? require("./scientific-rag-engine.js") : null);
  const composerDefault =
    global.GoldAnswerComposer ||
    (typeof require === "function" ? require("./answer-composer.js") : null);
  const uxDefault =
    global.GoldUxResponses ||
    (typeof require === "function" ? require("./gold-ux-responses.js") : null);

  function compact(text, limit = 900) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, limit).replace(/\s+\S*$/, "")}...`;
  }

  function normalizeSource(source) {
    if (source === "iNaturalist") return "inat";
    if (source === "speciesLink") return "specieslink";
    return String(source || "").toLowerCase();
  }

  function groupFromClassification(classification, question) {
    const q = coreDefault.normalizeText(question);
    if (/\b(anfibio|anfibios|sapo|sapos|ra|ras|perereca|pererecas|anuro|anuros)\b/.test(q)) return "anfibios";
    if (/\b(cobra|cobras|serpente|serpentes|jararaca|jararacas|cascavel|cascaveis|coral|corais|jiboia|jiboias|surucucu|surucucus|mucurana|mucuranas|mussurana|mussuranas|caninana|caninanas|crotalus|bothrops)\b/.test(q)) return "serpentes";
    if (/\b(lagarto|lagartos|teiu|teius)\b/.test(q)) return "lagartos";
    if (/\b(quelonio|quelonios|tartaruga|tartarugas|cagado|cagados|jabuti|jabutis)\b/.test(q)) return "quelonios";
    if (/\b(reptil|repteis)\b/.test(q)) return "repteis";
    const taxon = classification?.taxon?.normalized || "";
    if (["Rhinella", "Boana", "Scinax", "Leptodactylus", "Anura", "Amphibia"].includes(taxon)) return "anfibios";
    if (["Bothrops", "Crotalus", "Viperidae", "Elapidae", "Dipsadidae", "Colubridae", "Boidae", "Squamata", "Reptilia"].includes(taxon)) return "repteis";
    return null;
  }

  function wantsReferences(question) {
    return /\b(cite|cita|citacao|referencia|referencias|fonte|fontes|artigo|literatura|vancouver)\b/i.test(String(question || ""));
  }

  function isUnsupportedBinomial(plan, summary, ragEvidence) {
    const taxon = plan.classification?.taxon;
    const normalized = taxon?.normalized || plan.taxonForQuery || "";
    if (taxon?.rank !== "species" || !/\s/.test(normalized)) return false;
    if (summary?.taxon && ["validated", "pending", "ambiguous"].includes(summary.taxon.validationStatus)) return false;
    if (["accepted_name", "synonym", "local_context_mention", "ocr_mention"].includes(summary?.type)) return false;
    const needle = coreDefault.normalizeText(normalized);
    return !(ragEvidence || []).some((item) => {
      if (["taxonomy_index", "curated"].includes(item.sourceType)) return false;
      return coreDefault.normalizeText(`${item.title || ""} ${item.text || ""}`).includes(needle);
    });
  }

  function createMunicipalInput(plan, question) {
    const q = coreDefault.normalizeText(question);
    const includeVouchers = /\b(voucher|vouchers|colecao|colecoes|material preservado|tombo|catalogo)\b/.test(q);
    const includeCoordinates = /\b(coordenada|coordenadas|latitude|longitude|mapa|georreferenciad)\b/.test(q);
    const broadGroupTaxa = new Set(["Amphibia", "Reptilia", "Anura", "Squamata", "Serpentes", "anfibios", "repteis", "sapos", "serpentes", "lagartos", "quelonios"]);
    return {
      taxon: plan.groupForQuery && broadGroupTaxa.has(plan.taxonForQuery) ? null : plan.taxonForQuery,
      group: plan.groupForQuery,
      municipality: plan.municipalities[0]?.name || plan.classification.municipality,
      sources: (plan.sources.length ? plan.sources : ["iNaturalist", "speciesLink", "cache"]).map(normalizeSource),
      includeVouchers,
      includeCoordinates,
    };
  }

  function formatMunicipalResult(result) {
    const rows = result.recordsSummary || [];
    const preview = rows.slice(0, 8).map((record, index) => {
      const flags = [
        record.hasINaturalistObservation ? "iNaturalist" : null,
        record.hasSpeciesLinkRecord ? "speciesLink" : null,
        record.hasVoucher ? "voucher" : null,
        record.hasCoordinates ? "coordenada" : null,
      ].filter(Boolean).join(", ");
      return `${index + 1}. ${record.scientificName}${flags ? ` - ${flags}` : ""}`;
    });
    return [
      result.finalInterpretation,
      preview.length ? preview.join("\n") : null,
      result.lastCacheUpdate ? `Base local: atualizada em ${new Date(result.lastCacheUpdate).toLocaleString("pt-BR")}.` : null,
      result.uncertaintyNotes?.length ? `Notas: ${result.uncertaintyNotes.join(" ")}` : null,
    ].filter(Boolean).join("\n\n");
  }

  function formatComparison(result) {
    const blocks = (result.municipalities || []).map((municipality) => {
      const total = municipality.recordsSummary?.length || 0;
      const examples = (municipality.recordsSummary || []).slice(0, 5).map((record) => record.scientificName).join(", ");
      return `- ${municipality.municipality}: ${total} taxons recuperados${examples ? `; exemplos: ${examples}` : ""}.`;
    });
    return [result.finalInterpretation, blocks.join("\n")].filter(Boolean).join("\n\n");
  }

  function createScientificOrchestrator(dependencies = {}) {
    const core = dependencies.core || coreDefault;
    const herpetology = dependencies.herpetology || herpetologyDefault;
    const methodology = dependencies.methodology || methodologyDefault;
    const municipal = dependencies.municipal || municipalDefault;
    const taxonomy = dependencies.taxonomy || taxonomyDefault;
    const rag = dependencies.rag || ragDefault;
    const composer = dependencies.composer || composerDefault;
    const ux = dependencies.ux || uxDefault;
    const state = dependencies.conversationState || new core.ConversationState();

    function shouldUseLastTaxon(question, classification) {
      const q = core.normalizeText(question);
      const genericTaxonFollowUp = /^(quero saber (as )?especies|quais especies|liste (as )?especies|mostre (as )?especies)\b/.test(q);
      return !classification.taxon?.normalized && state.lastTaxon && (core.isFollowUp(q) || core.hasContextualReference(q) || genericTaxonFollowUp || /^(tem|e|agora|quais|qual|vouchers?|coordenadas?)\b/.test(q));
    }

    function planQuestion(question) {
      const classification = core.classifyConversationIntent(question);
      state.prepareForInput(classification);
      const inheritedTaxon = shouldUseLastTaxon(question, classification) ? state.lastTaxon : null;
      let municipalities = classification.municipalities?.length
        ? classification.municipalities
        : state.lastMunicipalities?.length && classification.intent === core.CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY
          ? state.lastMunicipalities
          : [];
      const taxonForQuery = classification.taxon?.normalized || inheritedTaxon || null;
      const groupForQuery = groupFromClassification(classification, question);
      const sources = state.lastSources || ["iNaturalist", "speciesLink"];
      const q = core.normalizeText(question);
      const contextualMunicipalFollowUp = Boolean(
        state.lastMunicipalities?.length &&
        (core.isFollowUp(q) || core.hasContextualReference(q) || /^(tem|ha|existe|existem|e|agora|quais|qual|vouchers?|coordenadas?)\b/.test(q)) &&
        ![core.CONVERSATION_INTENTS.COMPLAINT, core.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION, core.CONVERSATION_INTENTS.POPULAR_NAME_QUESTION, core.CONVERSATION_INTENTS.METHODOLOGY_QUESTION, core.CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION].includes(classification.intent) &&
        ![core.SCOPES.GENERAL, core.SCOPES.BRAZIL].includes(classification.scope)
      );
      if (!municipalities.length && contextualMunicipalFollowUp) municipalities = state.lastMunicipalities;
      const curatedMethodologyAnswerAvailable = Boolean(methodology?.shouldHandle?.(question, {
        conversationIntent: classification.intent,
        municipalities,
      }));
      const route =
        classification.intent === core.CONVERSATION_INTENTS.GREETING ? "greeting" :
        classification.intent === core.CONVERSATION_INTENTS.COMPLAINT ? "complaint" :
        classification.intent === core.CONVERSATION_INTENTS.SAFETY_QUESTION ? "safety" :
        classification.intent === core.CONVERSATION_INTENTS.METHODOLOGY_QUESTION || curatedMethodologyAnswerAvailable ? "methodology" :
        classification.intent === core.CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY || contextualMunicipalFollowUp ? "municipal" :
        [core.CONVERSATION_INTENTS.POPULAR_NAME_QUESTION, core.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION].includes(classification.intent) ? "taxon" :
        [core.CONVERSATION_INTENTS.REGIONAL_CONTEXT_QUESTION, core.CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION].includes(classification.intent) ? "rag" :
        "unknown";

      return {
        question,
        classification,
        route,
        municipalities,
        taxonForQuery,
        groupForQuery,
        sources,
        inheritedTaxon,
        shouldClearContext: classification.shouldClearPreviousContext,
      };
    }

    function updateStateFromPlan(plan, evidence = null) {
      const parsed = {
        rawText: plan.question,
        municipalities: plan.municipalities,
        taxonomicGroups: plan.groupForQuery === "anfibios" ? ["Amphibia"] : plan.groupForQuery ? ["Reptilia"] : [],
        subgroupTerms: plan.groupForQuery ? [plan.groupForQuery] : [],
        sources: plan.sources,
        intent: plan.route,
        speciesQuery: plan.taxonForQuery && /\s/.test(plan.taxonForQuery) ? plan.taxonForQuery : null,
        conversationTaxon: plan.taxonForQuery ? { normalized: plan.taxonForQuery } : plan.classification.taxon,
        scope: plan.classification.scope,
        conversationIntent: plan.classification.intent,
      };
      state.update(parsed, evidence);
    }

    function evidenceTitleLooksHerpetological(item, plan) {
      const title = core.normalizeText(item.title || item.sourceId || item.id || "");
      const taxon = core.normalizeText(plan.taxonForQuery || plan.classification?.taxon?.normalized || "");
      const popular = core.normalizeText(plan.classification?.taxon?.raw || "");
      const reptileCue = /\b(serpente|serpentes|snake|snakes|reptil|repteis|reptile|reptiles|squamata|viper|viperidae|elapidae|boidae|bothrops|crotalus|cascavel|jararaca|coral|jiboia|surucucu|mucurana|mussurana|caninana)\b/.test(title);
      const amphibianCue = /\b(anfibio|anfibios|anuro|anuros|amphibia|anura|hylidae|bufonidae|leptodactylidae|rhinella|boana|scinax|leptodactylus|sapo|sapos|perereca|pererecas)\b/.test(title);
      const broadHerpCue = /\b(herpetofauna|herpetology|herpetologia)\b/.test(title);
      const currentMention = (taxon && title.includes(taxon)) || (popular && title.includes(popular));
      const otherSpecificReptile = /\b(bothrops|crotalus|jararaca|cascavel|coral|jiboia|surucucu|mucurana|mussurana|caninana)\b/.test(title) && !currentMention;
      if (otherSpecificReptile) return false;
      const group = plan.groupForQuery || "";
      const groupCompatible =
        group === "anfibios" ? amphibianCue || broadHerpCue :
          ["serpentes", "repteis", "lagartos", "quelonios"].includes(group) ? reptileCue || broadHerpCue :
            amphibianCue || reptileCue || broadHerpCue;
      return groupCompatible || currentMention;
    }

    function summarizeEvidenceSources(evidence, plan) {
      const rows = [];
      const seen = new Set();
      (evidence || []).forEach((item) => {
        if (!evidenceTitleLooksHerpetological(item, plan)) return;
        const title = item.title || item.sourceId || item.id || item.reference;
        if (!title) return;
        const key = String(title).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const page = item.page ? `, p. ${item.page}` : "";
        rows.push(`- ${title}${page}`);
      });
      return rows.slice(0, 3);
    }

    async function answerTaxon(plan) {
      const herpetologyQuestion = plan.taxonForQuery || plan.inheritedTaxon || plan.question;
      const herp = await herpetology?.answerQuestion?.(herpetologyQuestion, {
        conversationIntent: plan.classification.intent,
        municipalities: plan.municipalities,
      });
      let ragBundle = null;
      try {
        ragBundle = await rag?.retrieve?.(plan.question, {
          classification: plan.classification,
          sourcesToSearch: ["herpetology", "taxonomy_index", "public_index", "pdf"],
          limit: 8,
        });
      } catch {
        ragBundle = null;
      }
      const ragEvidence = (ragBundle?.primaryEvidence || [])
        .filter((item) => !["curated"].includes(item.sourceType))
        .slice(0, 4);
      const target = plan.taxonForQuery || plan.question;
      const summary = await taxonomy?.getTaxonSummary?.(target);
      if (isUnsupportedBinomial(plan, summary, ragEvidence)) {
        const targetName = plan.classification?.taxon?.normalized || target;
        return {
          answer: `Nao encontrei evidencia suficiente no acervo local para tratar "${targetName}" como especie validada. O genero pode existir, mas esse binomio precisa de fonte taxonomica antes de eu afirmar biologia, distribuicao ou conservacao. Para manter rigor cientifico, posso responder sobre o genero ${targetName.split(" ")[0]} de forma geral ou tentar outra grafia/nome aceito.`,
          evidence: [],
          source: "unsupported_binomial_guard",
        };
      }
      if (herp?.answer) {
        const sourceLines = summarizeEvidenceSources(ragEvidence, plan);
        const evidenceNote = sourceLines.length
          ? `\n\nBiblioteca local consultada: encontrei mencoes relacionadas no acervo OCR/RAG. Exemplos recuperados:\n${sourceLines.join("\n")}\n\nEssas mencoes ajudam a contextualizar, mas nao substituem revisao taxonomica nem confirmam ocorrencia municipal.`
          : "";
        return { answer: `${herp.answer}${evidenceNote}`, evidence: [...(herp.evidence || []), ...ragEvidence], source: "herpetology+rag" };
      }

      if (summary?.summary) {
        if (/^n(?:a|ã)o encontrei\b/i.test(summary.summary)) {
          const targetName = plan.taxonForQuery || plan.classification?.taxon?.raw || target;
          return {
            answer: `Nao encontrei evidencia suficiente no acervo local para tratar "${targetName}" como taxon validado no Gold. Pode ser um nome fora da base, erro de digitacao, sinonimo ainda nao mapeado ou um taxon ficticio. Para manter rigor cientifico, nao vou inventar distribuicao, biologia ou referencia. Se voce quiser, posso tentar por genero, familia, nome popular ou municipio.`,
            evidence: [],
            source: "insufficient_taxon_evidence",
          };
        }
        const sourceLines = summarizeEvidenceSources(ragEvidence, plan);
        const evidenceNote = sourceLines.length
          ? `\n\nBiblioteca local consultada:\n${sourceLines.join("\n")}`
          : "";
        return { answer: `${summary.summary}${evidenceNote}`, evidence: [summary, ...ragEvidence], source: "taxonomy+rag" };
      }

      if (ragBundle?.primaryEvidence?.length) {
        const best = ragBundle.primaryEvidence[0];
        return {
          answer: `Encontrei evidencias no acervo local, mas vou responder com cautela porque o termo precisa de revisao taxonomica ou contexto adicional.\n\n${compact(best.text, 850)}`,
          evidence: ragBundle.primaryEvidence,
          source: "rag",
        };
      }

      if (plan.taxonForQuery || plan.classification?.taxon?.raw) {
        const targetName = plan.taxonForQuery || plan.classification.taxon.raw;
        return {
          answer: `Nao encontrei evidencia suficiente no acervo local para tratar "${targetName}" como taxon validado no Gold. Pode ser um nome fora da base, erro de digitacao, sinonimo ainda nao mapeado ou um taxon ficticio. Para manter rigor cientifico, nao vou inventar distribuicao, biologia ou referencia. Se voce quiser, posso tentar por genero, familia, nome popular ou municipio.`,
          evidence: [],
          source: "insufficient_taxon_evidence",
        };
      }

      return null;
    }

    async function answerWithRag(plan) {
      const bundle = await rag?.retrieve?.(plan.question, { classification: plan.classification });
      if (!bundle) return null;
      const fallback = rag.explainInsufficientEvidence?.(bundle);
      if (fallback) return { answer: fallback, evidence: bundle.primaryEvidence || [], bundle, source: "rag" };
      const best = bundle.primaryEvidence?.[0];
      const body = best?.text ? compact(best.text, plan.classification.intent === core.CONVERSATION_INTENTS.REGIONAL_CONTEXT_QUESTION ? 1100 : 850) : "";
      const refs = wantsReferences(plan.question) && bundle.evidenceReferences?.length
        ? `\n\nReferencias recuperadas:\n${bundle.evidenceReferences.join("\n")}`
        : "";
      return {
        answer: `${body}${refs}`,
        evidence: bundle.primaryEvidence || [],
        bundle,
        source: "rag",
      };
    }

    function answerSafety(plan) {
      const q = core.normalizeText(plan.question);
      if (/\bpicad|mordid|acidente\b/.test(q)) {
        return [
          "Se houve picada ou suspeita de acidente com serpente, procure atendimento medico imediatamente.",
          "Nao faca torniquete, nao corte, nao fure, nao sugue e nao aplique substancias no local. Se for seguro, registre foto a distancia para ajudar na identificacao, mas nao tente capturar o animal.",
        ].join("\n\n");
      }
      if (/\bmatar\b/.test(q)) {
        return [
          "Nao recomendo matar ou tentar manejar a serpente. Isso aumenta o risco de acidente e tambem causa dano ecologico, porque serpentes controlam presas e fazem parte da cadeia alimentar.",
          "Mantenha distancia, afaste criancas e animais domesticos, deixe uma rota livre para a serpente sair e, se ela permanecer em area de risco, acione bombeiros, defesa civil ou orgao ambiental local.",
        ].join("\n\n");
      }
      return [
        "Mantenha distancia e nao tente pegar, capturar ou encurralar a serpente.",
        "Afaste criancas e animais domesticos, deixe uma rota livre para ela sair e observe apenas de local seguro. Se o animal estiver dentro de casa, escola ou area de risco, chame bombeiros, defesa civil ou orgao ambiental local.",
      ].join("\n\n");
    }

    async function answerQuestion(question) {
      const plan = planQuestion(question);

      if (plan.route === "greeting") {
        return { handled: true, answer: "Oi! Pode perguntar sobre herpetologia, ecologia, taxonomia, metodologia, seguranca em campo ou registros dos municipios do Vale Historico.", plan };
      }

      if (plan.route === "complaint") {
        state.clearRoutingContext();
        return { handled: true, answer: `${ux?.frustration || "Entendi."} Vou limpar o contexto anterior. Posso responder de forma geral ou consultar dados locais quando voce indicar municipio.`, plan };
      }

      if (plan.route === "municipal") {
        if (!plan.municipalities.length) {
          const count = state.recordClarification("municipality");
          if (count >= 3) {
            state.clearRoutingContext();
            return { handled: true, answer: "Entendi. Vou sair do modo municipal e responder de forma geral.", plan };
          }
          return { handled: true, answer: ux?.municipalityRequired || "Para consulta municipal, preciso do municipio.", plan };
        }
        if (plan.municipalities.length > 1 && municipal?.compareMunicipalities) {
          const inputs = plan.municipalities.map((item) => ({ ...createMunicipalInput(plan, question), municipality: item.name }));
          const result = await municipal.compareMunicipalities(inputs);
          const answer = formatComparison(result);
          updateStateFromPlan(plan, result);
          return { handled: true, answer, plan, evidence: result };
        }
        if (municipal?.queryMunicipality) {
          const result = await municipal.queryMunicipality(createMunicipalInput(plan, question));
          const answer = formatMunicipalResult(result);
          updateStateFromPlan(plan, result);
          return { handled: true, answer, plan, evidence: result };
        }
        return { handled: false, plan };
      }

      if (plan.route === "safety") {
        const answer = answerSafety(plan);
        updateStateFromPlan(plan, [{ id: "seguranca_serpentes", source: "protocolo local de seguranca" }]);
        return { handled: true, answer, plan, evidence: [{ id: "seguranca_serpentes", source: "protocolo local de seguranca" }] };
      }

      if (plan.route === "methodology") {
        const method = await methodology?.answerQuestion?.(question, { conversationIntent: plan.classification.intent });
        if (method?.answer) {
          updateStateFromPlan(plan, method.evidence);
          return { handled: true, answer: method.answer, plan, evidence: method.evidence };
        }
      }

      if (plan.route === "taxon") {
        const taxonAnswer = await answerTaxon(plan);
        if (taxonAnswer) {
          updateStateFromPlan(plan, taxonAnswer.evidence);
          return { handled: true, answer: taxonAnswer.answer, plan, evidence: taxonAnswer.evidence };
        }
      }

      if (plan.route === "rag") {
        const ragAnswer = await answerWithRag(plan);
        if (ragAnswer) {
          updateStateFromPlan(plan, ragAnswer.bundle || ragAnswer.evidence);
          const validated = composer?.validateGoldAnswer
            ? composer.validateGoldAnswer({ userQuestion: question, finalText: ragAnswer.answer, evidenceUsed: ragAnswer.evidence })
            : { validation: { passed: true } };
          return { handled: true, answer: validated.validation.passed ? ragAnswer.answer : rag?.explainInsufficientEvidence?.(ragAnswer.bundle) || ragAnswer.answer, plan, evidence: ragAnswer.evidence, validation: validated.validation };
        }
      }

      return {
        handled: true,
        answer: "Consigo ajudar, mas preciso de uma pista melhor: voce quer uma explicacao geral, taxonomia, metodologia, seguranca ou consulta municipal?",
        plan,
      };
    }

    return {
      planQuestion,
      answerQuestion,
      conversationState: state,
      createMunicipalInput,
      formatMunicipalResult,
      formatComparison,
    };
  }

  const api = createScientificOrchestrator();
  api.createScientificOrchestrator = createScientificOrchestrator;
  global.GoldScientificOrchestrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
