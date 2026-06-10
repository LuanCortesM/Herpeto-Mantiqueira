(function (global) {
  const managerDefault =
    global.HerpetoDataSourceManager ||
    (typeof require === "function" ? require("./biodiversity-manager.js") : null);
  const core =
    global.HerpetoConversationCore ||
    (typeof require === "function" ? require("./conversation-core.js") : null);
  const knowledgeDefault =
    global.HerpetoScientificKnowledge ||
    (typeof require === "function" ? require("./scientific-knowledge-base.js") : null);
  const herpetologyDefault =
    global.GoldHerpetologyEngine ||
    (typeof require === "function" ? require("./herpetology-engine.js") : null);
  const methodologyDefault =
    global.GoldScientificMethodologyEngine ||
    (typeof require === "function" ? require("./scientific-methodology-engine.js") : null);
  const municipalEngineDefault =
    global.GoldMunicipalBiodiversityEngine ||
    (typeof require === "function" ? require("./municipal-biodiversity-engine.js") : null);
  const orchestratorDefault =
    global.GoldScientificOrchestrator ||
    (typeof require === "function" ? require("./gold-scientific-orchestrator.js") : null);
  const uxDefault =
    global.GoldUxResponses ||
    (typeof require === "function" ? require("./gold-ux-responses.js") : null);

  const { INTENTS } = core;
  INTENTS.LIST_SPECIES = INTENTS.LIST_TAXA;
  const SUPPORTED_MUNICIPALITIES =
    "Cruzeiro, Lavrinhas, Queluz, Silveiras, Bananal, Areias, São José do Barreiro e Arapeí";

  function createBrain(dependencies = {}) {
    const manager = dependencies.manager || managerDefault;
    const knowledge = dependencies.knowledge || knowledgeDefault;
    const herpetology = dependencies.herpetology || herpetologyDefault;
    const methodology = dependencies.methodology || methodologyDefault;
    const municipalEngine = dependencies.municipalEngine || municipalEngineDefault?.createMunicipalBiodiversityEngine?.({ manager }) || municipalEngineDefault;
    const ux = dependencies.ux || uxDefault;
    const conversationState = dependencies.conversationState || new core.ConversationState();
    const orchestrator = dependencies.orchestrator || orchestratorDefault?.createScientificOrchestrator?.({
      core,
      herpetology,
      methodology,
      municipal: municipalEngine,
      conversationState,
      ux,
    });

    function inferGroupFromSpecies(speciesQuery, groups) {
      if (!speciesQuery || groups.length !== 2) return groups;
      const genus = core.normalizeText(speciesQuery).split(" ")[0];
      if (["boana", "rhinella", "scinax", "dendropsophus", "leptodactylus", "physalaemus"].includes(genus)) return ["Amphibia"];
      if (["bothrops", "micrurus", "philodryas", "salvator", "tupinambis"].includes(genus)) return ["Reptilia"];
      return groups;
    }

    function debugConversation(label, payload) {
      const enabled = global.GOLD_DEBUG === true ||
        (typeof global.localStorage !== "undefined" && global.localStorage.getItem("gold-debug") === "1");
      if (enabled && global.console?.debug) global.console.debug(`[Gold:${label}]`, payload);
    }

    function parseQuestion(question, state = conversationState, classification = null) {
      const rawText = String(question || "");
      const normalizedText = core.normalizeText(rawText);
      const taxonomicTypos = core.correctTaxonomicTypos(rawText);
      const correctedRawText = taxonomicTypos.correctedText;
      const correctedText = core.slangAndAbbreviationResolver(correctedRawText);
      const conversationClassification = classification || core.classifyConversationIntent(correctedRawText);
      const audienceProfile = core.detectAudienceProfile(rawText);
      const wantsFullList = /\b(liste todos|listar todos|lista completa|tabela completa|todos os registros|relatorio|pode mandar tudo|quero completo|mostra todos|mostrar todos)\b/.test(correctedText);
      const wantsContinuation = /^(mais|continua|continue)\b/.test(correctedText);
      const contextualAllRecords =
        /^(todos|liste todos|listar todos)$/.test(correctedText) &&
        state.lastMunicipalities?.length === 1 &&
        ![INTENTS.COMPARE_MUNICIPALITIES, INTENTS.COMPARE_SOURCES].includes(state.lastIntent);
      const municipality = contextualAllRecords
        ? {
            municipalities: state.lastMunicipalities,
            warnings: [],
            unresolved: [],
            usesContext: true,
            contextFieldsUsed: ["municipalities"],
            confidence: 0.92,
          }
        : core.municipalityResolver(correctedText, state);
      const taxon = core.taxonResolver(correctedText, state);
      const species = core.speciesQueryExtractor(rawText);
      const contextualSpecies =
        !species.speciesQuery &&
        !taxon.commonTaxonTerms.length &&
        (core.isFollowUp(correctedText) || core.hasContextualReference(correctedText))
          ? state.lastSpeciesQuery
          : null;
      const speciesQuery = species.speciesQuery || contextualSpecies || null;
      const taxonomicGroups = inferGroupFromSpecies(speciesQuery, taxon.taxonomicGroups);
      const intentResult = core.intentClassifier(correctedText, municipality.municipalities, speciesQuery);
      let intent = intentResult.intent;
      if (intent === INTENTS.UNKNOWN && core.isFollowUp(correctedText) && state.lastIntent) intent = state.lastIntent;
      if (core.isSourceSwitch(correctedText) && state.lastIntent) intent = state.lastIntent;
      if (
        contextualSpecies &&
        core.isFollowUp(correctedText) &&
        ![INTENTS.VOUCHERS, INTENTS.COORDINATES].includes(intent)
      ) intent = INTENTS.SEARCH_SPECIES;
      const source = core.sourceRouter(correctedText, intent, state);
      const contextFieldsUsed = [...municipality.contextFieldsUsed];
      if (taxon.usesContext) contextFieldsUsed.push("taxonomicGroups");
      if (contextualSpecies) contextFieldsUsed.push("speciesQuery");
      if (source.usesContext) contextFieldsUsed.push("sources");
      const missingRequiredInfo = [];
      if (conversationClassification.shouldAskMunicipality && !municipality.municipalities.length) missingRequiredInfo.push("municipality");
      if (intent === INTENTS.SEARCH_SPECIES && !speciesQuery) missingRequiredInfo.push("speciesQuery");
      const needsClarification = missingRequiredInfo.length > 0 || intent === INTENTS.UNKNOWN;

      const detailLevel = audienceProfile.audience === "technical" || /\b(vies|metodolog|artigo|cientific|basisofrecord|georreferenciamento|taxonom|riqueza|relatorio|tabela completa|liste todos|listar todos)\b/.test(correctedText)
        ? "technical"
        : /\b(resumo|compare|lista|liste)\b/.test(correctedText) ? "medium" : "short";
      const hasExplicitTaxon = taxon.commonTaxonTerms.length > 0 || taxon.subgroupTerms.length > 0;
      const responseMode =
        wantsFullList || contextualAllRecords ? "detailed"
          : wantsContinuation ? "detailed"
            : detailLevel === "technical" ? "detailed"
              : hasExplicitTaxon || /\b(lista|liste|quais)\b/.test(correctedText) ? "medium"
                : "short";
      const parsed = {
        rawText,
        rawQuestion: rawText,
        correctedRawText,
        normalizedText,
        normalizedQuestion: normalizedText,
        correctedText,
        detectedLanguage: "pt-BR",
        municipalities: municipality.municipalities,
        municipalityConfidence: municipality.confidence,
        unresolvedMunicipalityMentions: municipality.unresolved,
        taxonomicGroups,
        subgroupTerms: taxon.subgroupTerms,
        commonTaxonTerms: taxon.commonTaxonTerms,
        taxonConfidence: taxon.confidence,
        speciesQuery,
        possibleSpeciesQuery: species.possibleSpeciesQuery,
        commonNameQuery: species.commonNameQuery,
        rejectedSpeciesCandidates: species.rejectedSpeciesCandidates,
        sources: source.sources,
        sourcePreference: source.sources,
        sourceConfidence: source.confidence,
        intent,
        intentConfidence: intentResult.confidence,
        conversationIntent: conversationClassification.intent,
        scope: conversationClassification.scope,
        conversationTaxon: conversationClassification.taxon,
        contextualGeneralTaxon: conversationClassification.taxon?.normalized || state.lastTaxon || null,
        taxonomicCorrections: conversationClassification.corrections,
        taxonomicSuggestions: conversationClassification.suggestions,
        wantsList: intent === INTENTS.LIST_TAXA,
        wantsSummary: intent === INTENTS.SUMMARY,
        wantsComparison: intent === INTENTS.COMPARE_MUNICIPALITIES,
        wantsSourceComparison: intent === INTENTS.COMPARE_SOURCES,
        wantsVoucher: intent === INTENTS.VOUCHERS,
        wantsVouchers: intent === INTENTS.VOUCHERS,
        wantsCoordinates: intent === INTENTS.COORDINATES,
        wantsPhotos: /\b(foto|fotos|fotografad)\b/.test(correctedText),
        wantsRecentRecords: /\b(recente|recentes)\b/.test(correctedText),
        wantsScientificUse: /\b(artigo|cientific|pesquisa)\b/.test(correctedText),
        wantsMethodology: intent === INTENTS.EXPLAIN_METHOD,
        wantsMethodologicalExplanation: intent === INTENTS.EXPLAIN_METHOD,
        wantsHelp: intent === INTENTS.HELP,
        wantsInventory: /\binventario\b/.test(correctedText),
        wantsFullList: wantsFullList || contextualAllRecords,
        wantsContinuation,
        detailLevel,
        responseMode,
        audience: audienceProfile.audience === "technical" ? "technical" : "accessible",
        audienceProfile: audienceProfile.audience,
        audienceConfidence: audienceProfile.confidence,
        usesContext: contextFieldsUsed.length > 0,
        usedContext: contextFieldsUsed.length > 0,
        contextFieldsUsed,
        missingRequiredInfo,
        needsClarification,
        clarificationQuestion: missingRequiredInfo.includes("municipality")
          ? (speciesQuery || conversationClassification.taxon?.normalized || taxon.commonTaxonTerms.length || taxon.subgroupTerms.length
            ? ux.municipalityRequired
            : "Consigo ajudar. Diga o táxon, grupo ou tema. Para consulta de ocorrência local, acrescente também o município.")
          : missingRequiredInfo.includes("speciesQuery")
            ? "Consigo verificar, mas preciso do nome científico da espécie que você quer procurar."
            : intent === INTENTS.UNKNOWN
              ? "Não tenho contexto suficiente para continuar. Diga o tema, táxon ou grupo; se quiser dados locais, inclua o município."
              : null,
        assumptions: [],
        warnings: [
          ...taxonomicTypos.corrections.map((item) => `Entendi “${item.raw}” como ${item.normalized}.`),
          ...municipality.warnings,
        ],
      };
      parsed.queryPlan = core.queryPlanner(parsed);
      return parsed;
    }

    function groupPhrase(groups) {
      if (groups.length === 1 && groups[0] === "Amphibia") return "anfíbios";
      if (groups.length === 1 && groups[0] === "Reptilia") return "répteis";
      return "anfíbios e répteis";
    }

    function sourcePhrase(sources) {
      if (sources.length === 1 && sources[0] === "iNaturalist") return "somente no iNaturalist";
      if (sources.length === 1 && sources[0] === "speciesLink") return "somente no speciesLink";
      return "usando iNaturalist e speciesLink";
    }

    function buildResolvedQuestion(parsed) {
      const names = parsed.municipalities.map((item) => item.name.replace("-SP", "")).join(" e ");
      const group = groupPhrase(parsed.taxonomicGroups);
      const source = sourcePhrase(parsed.sources);
      if (parsed.intent === INTENTS.SEARCH_SPECIES) return `Tem ${parsed.speciesQuery} em ${names} ${source}?`;
      if (parsed.intent === INTENTS.COMPARE_MUNICIPALITIES) return `Compare os municípios ${names} para ${group} ${source}.`;
      if (parsed.intent === INTENTS.COMPARE_SOURCES) return `Compare fontes para ${group} em ${names} usando iNaturalist e speciesLink.`;
      if (parsed.intent === INTENTS.SUMMARY) return `Faça um resumo de ${group} em ${names} ${source}.`;
      if (parsed.intent === INTENTS.TOP_RECORDED) return `Quais são os táxons mais registrados de ${group} em ${names} ${source}?`;
      if (parsed.intent === INTENTS.VOUCHERS) return `Quais vouchers ou materiais preservados de ${group} existem em ${names} somente no speciesLink?`;
      if (parsed.intent === INTENTS.COORDINATES) return `Quais registros com coordenadas de ${group} existem em ${names} somente no speciesLink?`;
      if (parsed.conversationTaxon?.rank === "genus") return `Liste espécies de ${parsed.conversationTaxon.normalized} registradas em ${names} ${source}.`;
      if (parsed.commonTaxonTerms.includes("sapos")) return `Liste sapos registrados em ${names} ${source}.`;
      if (parsed.subgroupTerms.includes("serpentes")) return `Liste serpentes registradas em ${names} ${source}.`;
      return `Liste ${group} registrados em ${names} ${source}.`;
    }

    function introductionFor(parsed) {
      const correction = parsed.warnings.length ? parsed.warnings.join(" ") : "";
      let intro = "";
      if (parsed.intent === INTENTS.VOUCHERS) intro = "Boa pergunta. Para vouchers e material preservado, a fonte mais adequada é o speciesLink.";
      return [correction, intro].filter(Boolean).join(" ");
    }

    function generateHelpAnswer() {
      return [
        `Posso consultar registros de anfíbios e répteis para ${SUPPORTED_MUNICIPALITIES}.`,
        "Consigo usar iNaturalist, speciesLink ou as duas fontes juntas. Você pode perguntar, por exemplo:",
        "- Quais anfíbios existem em Bananal?",
        "- q q tem de sapo em Cruzeiro?",
        "- Tem Bothrops jararaca em Queluz?",
        "- Quais espécies têm voucher em Lavrinhas?",
        "- Compare iNaturalist e speciesLink para Areias.",
        "- Quais registros têm coordenadas?",
      ].join("\n");
    }

    function generateMethodExplanationAnswer() {
      return [
        "Serve como base preliminar, mas com cuidado.",
        "Para artigo, eu usaria esses dados para:",
        "- levantar registros disponíveis;",
        "- comparar lacunas entre municípios;",
        "- discutir esforço amostral;",
        "- indicar espécies com registros públicos ou vouchers;",
        "- planejar checagem de campo.",
        "Como bom sapinho desconfiado, eu não chamaria isso de inventário completo. Um inventário exige desenho amostral, esforço padronizado, validação taxonômica e análise espacial.",
        "Para uso científico, registre a data da consulta. Também é essencial documentar filtros usados, fonte, qualidade dos registros e possíveis vieses. O iNaturalist reflete principalmente observações de ciência cidadã; o speciesLink reúne coleções, vouchers e histórico de coleta.",
      ].join("\n\n");
    }

    function generateSafetyAnswer(parsed) {
      const text = core.normalizeText(parsed.rawText);
      if (/\bpicad|mordid|acidente\b/.test(text)) {
        return [
          "Se houve picada ou suspeita de acidente com serpente, procure atendimento médico imediatamente.",
          "Não faça torniquete, não corte, não fure, não sugue e não aplique substâncias no local. Se for seguro, registre foto à distância para ajudar na identificação, mas não tente capturar o animal.",
        ].join("\n\n");
      }
      if (/\bmatar\b/.test(text)) {
        return [
          "Não recomendo matar ou tentar manejar a serpente. Isso aumenta o risco de acidente e também pode causar dano desnecessário ao animal.",
          "Mantenha distância, afaste crianças e animais domésticos, deixe uma rota livre para a serpente sair e, se ela permanecer em área de risco, acione bombeiros, defesa civil ou órgão ambiental local.",
        ].join("\n\n");
      }
      return [
        "Mantenha distância e não tente pegar, capturar ou encurralar a serpente.",
        "Afaste crianças e animais domésticos, deixe uma rota livre para ela sair e observe apenas de local seguro. Se o animal estiver dentro de casa ou em área de risco, chame bombeiros, defesa civil ou órgão ambiental local.",
      ].join("\n\n");
    }

    async function generateNaturalAnswer(parsed) {
      if (parsed.taxonomicSuggestions?.length) {
        const suggestion = parsed.taxonomicSuggestions[0];
        return `Você quis dizer ${suggestion.normalized}? Se confirmar, eu continuo com esse táxon.`;
      }
      if (parsed.intent === INTENTS.HELP) return generateHelpAnswer();
      if (parsed.conversationIntent === core.CONVERSATION_INTENTS.SAFETY_QUESTION) return generateSafetyAnswer(parsed);
      let methodologyAnswer = null;
      try {
        methodologyAnswer = await methodology?.answerQuestion?.(parsed.correctedRawText, parsed);
      } catch (error) {
        if (global.console?.warn) global.console.warn("Modulo metodologico indisponivel; seguindo para outras rotas.", error);
      }
      if (methodologyAnswer?.answer) {
        return { answer: methodologyAnswer.answer, evidence: { localKnowledge: methodologyAnswer.evidence, source: "módulo metodológico local" } };
      }
      let herpetologyAnswer = null;
      try {
        herpetologyAnswer = await herpetology?.answerQuestion?.(parsed.correctedRawText, parsed);
      } catch (error) {
        if (global.console?.warn) global.console.warn("Herpetology Engine indisponivel; seguindo para outras rotas.", error);
      }
      if (herpetologyAnswer?.answer) {
        return { answer: herpetologyAnswer.answer, evidence: { localKnowledge: herpetologyAnswer.evidence, source: "Herpetology Engine local" } };
      }
      let scientificPlan = null;
      try {
        scientificPlan = knowledge?.planQuestion?.(parsed.correctedRawText, parsed);
      } catch (error) {
        if (global.console?.warn) global.console.warn("Planejador cientifico indisponivel; evitando queda indevida.", error);
      }
      const normalizedQuestion = core.normalizeText(parsed.rawText);
      const asksForRegionalRecords = /\b(quais|liste|listar|aparec\w*|registr\w*|observad\w*|foto|fotos|tem em|ha em)\b/i
        .test(normalizedQuestion);
      const asksForGeneralTaxonKnowledge = /\b(conhece|conhecem|geral|genero|quais especies de)\b/i
        .test(normalizedQuestion);
      if (
        scientificPlan &&
        ["scientific", "scientific_deep"].includes(scientificPlan.mode) &&
        (
          [core.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION, core.CONVERSATION_INTENTS.POPULAR_NAME_QUESTION].includes(parsed.conversationIntent) ||
          !(parsed.needsClarification && asksForRegionalRecords && !asksForGeneralTaxonKnowledge)
        )
      ) {
        let localAnswer = null;
        try {
          localAnswer = await knowledge.answerQuestion(parsed.correctedRawText, parsed);
        } catch (error) {
          if (global.console?.warn) global.console.warn("Base cientifica local indisponivel; seguindo com fallback conversacional.", error);
        }
        if (localAnswer?.answer) return { answer: localAnswer.answer, evidence: { localKnowledge: localAnswer.evidence, source: "base científica local" } };
      }
      if (
        parsed.conversationIntent === core.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION &&
        !parsed.conversationTaxon?.normalized &&
        parsed.contextualGeneralTaxon
      ) {
        let contextualAnswer = null;
        try {
          contextualAnswer = await knowledge.answerQuestion(parsed.contextualGeneralTaxon, parsed);
        } catch (error) {
          if (global.console?.warn) global.console.warn("Base cientifica contextual indisponivel; seguindo com fallback conversacional.", error);
        }
        if (contextualAnswer?.answer) return { answer: contextualAnswer.answer, evidence: { localKnowledge: contextualAnswer.evidence, source: "base científica local" } };
      }
      if (/^(geral|de forma geral|no geral|brasil|no brasil|geral no brasil)$/.test(normalizedQuestion)) {
        return parsed.scope === core.SCOPES.BRAZIL
          ? `${ux.exitMunicipalContext} Minha base local não é um checklist oficial completo do Brasil; diga qual espécie, gênero ou tema você quer explorar.`
          : `${ux.exitMunicipalContext} Diga qual espécie, gênero ou tema você quer explorar.`;
      }
      if (parsed.intent === INTENTS.EXPLAIN_METHOD && scientificPlan?.mode !== "hybrid") return generateMethodExplanationAnswer();
      if (parsed.needsClarification && scientificPlan?.mode !== "hybrid") return parsed.clarificationQuestion;
      if (parsed.intent === INTENTS.CITY_SUPPORT) {
        return `${parsed.municipalities[0].name} está configurado nas consultas automáticas. Posso usar iNaturalist, speciesLink ou as duas fontes juntas.`;
      }
      try {
        const resolvedQuestion = buildResolvedQuestion(parsed);
        const supportsEvidence =
          manager.answerBiodiversityQuestionWithEvidence &&
          (!manager.answerUnifiedHerpetofaunaQuestion ||
            manager.answerBiodiversityQuestion === manager.answerUnifiedHerpetofaunaQuestion);
        const result = supportsEvidence
          ? await manager.answerBiodiversityQuestionWithEvidence(resolvedQuestion, { queryPlan: parsed.queryPlan })
          : { answer: await manager.answerBiodiversityQuestion(resolvedQuestion), evidence: core.createEvidenceBundle(parsed.queryPlan) };
        let answer = [introductionFor(parsed), result.answer].filter(Boolean).join("\n\n");
        if (scientificPlan?.mode === "hybrid") {
          const enriched = await knowledge.enrichDataAnswer(parsed.rawText, answer, parsed);
          answer = enriched.answer;
          result.evidence.localKnowledge = enriched.evidence;
        }
        return { answer: core.responseValidator(answer, parsed, result.sourceStatus), evidence: result.evidence };
      } catch (error) {
        console.error("Falha interna ao responder pergunta conversacional:", error);
        return { answer: "Não consegui consultar as fontes de dados agora. Tente novamente mais tarde ou verifique a configuração das APIs.", evidence: core.createEvidenceBundle(parsed.queryPlan) };
      }
    }

    async function receiveUserQuestion(question) {
      if (orchestrator?.answerQuestion) {
        const lightClassification = core.classifyConversationIntent(question);
        const canUseNonMunicipalOrchestrator = [
          core.CONVERSATION_INTENTS.SAFETY_QUESTION,
          core.CONVERSATION_INTENTS.POPULAR_NAME_QUESTION,
          core.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION,
          core.CONVERSATION_INTENTS.COMPLAINT,
        ].includes(lightClassification.intent);
        const normalizedQuestion = core.normalizeText(question);
        const explicitSpecies = core.speciesQueryExtractor(question).speciesQuery;
        const canUseContextualMunicipalOrchestrator =
          lightClassification.intent === core.CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY &&
          Boolean(conversationState.lastTaxon) &&
          !explicitSpecies &&
          !lightClassification.taxon?.normalized &&
          /^(tem|ha|existe|existem|e|agora|quais|qual)\b/.test(normalizedQuestion);
        const canUseExplicitMunicipalOrchestrator =
          lightClassification.intent === core.CONVERSATION_INTENTS.MUNICIPAL_OCCURRENCE_QUERY &&
          Boolean(lightClassification.municipalities?.length) &&
          !explicitSpecies &&
          !dependencies.manager;
        const canUseOrchestrator = canUseNonMunicipalOrchestrator || canUseContextualMunicipalOrchestrator || canUseExplicitMunicipalOrchestrator;
        let orchestrated = null;
        if (canUseOrchestrator) {
          try {
            orchestrated = await orchestrator.answerQuestion(question);
          } catch (error) {
            if (global.console?.warn) {
              global.console.warn("Orquestrador cientifico indisponivel; usando fluxo conversacional classico.", error);
            }
          }
        }
        if (orchestrated?.handled) {
          conversationState.lastAnswerType = orchestrated.plan?.route || conversationState.lastAnswerType;
          return core.responseValidator(orchestrated.answer, null, orchestrated.evidence?.sourceStatus);
        }
      }
      const classification = core.classifyConversationIntent(question);
      conversationState.prepareForInput(classification);
      debugConversation("classification", classification);
      if (classification.intent === core.CONVERSATION_INTENTS.COMPLAINT) {
        conversationState.clearRoutingContext();
        return `${ux.frustration} Posso responder de forma geral sobre o grupo citado ou consultar registros se você indicar uma cidade.`;
      }
      if (/^(sem municipio|sem cidade|geral|de forma geral|no geral|nao geral|nao quero municipio|eu falei geral)$/.test(core.normalizeText(question))) {
        conversationState.clearRoutingContext();
        return `${ux.exitMunicipalContext} Diga qual espécie, gênero ou tema você quer explorar.`;
      }
      const parsed = parseQuestion(question, conversationState, classification);
      const generated = await generateNaturalAnswer(parsed);
      let answer = typeof generated === "string" ? generated : generated.answer;
      const evidence = typeof generated === "string" ? null : generated.evidence;
      if (parsed.needsClarification && parsed.missingRequiredInfo.includes("municipality")) {
        const clarificationCount = conversationState.recordClarification(answer);
        if (clarificationCount >= 3) {
          const taxon = parsed.conversationTaxon?.normalized || conversationState.lastTaxon || "o grupo";
          conversationState.clearRoutingContext();
          answer = `${ux.exitMunicipalContext} Posso explicar ${taxon} agora; para consultar ocorrências locais depois, basta informar uma cidade.`;
        }
      }
      if (!parsed.needsClarification || evidence?.localKnowledge?.length) conversationState.update(parsed, evidence);
      if (/iNaturalist.*speciesLink|speciesLink.*iNaturalist/i.test(answer)) conversationState.explainedSourceDifference = true;
      if (/invent[aá]rio/i.test(answer)) conversationState.explainedInventoryLimits = true;
      if (/speciesLink.*indispon[ií]vel|speciesLink ainda n[aã]o est[aá]/i.test(answer)) conversationState.explainedSpeciesLinkUnavailable = true;
      conversationState.lastAnswerType = parsed.responseMode;
      return core.responseValidator(answer, parsed, evidence?.sourceStatus);
    }

    return {
      INTENTS, conversationState, normalizeText: core.normalizeText, parseQuestion, buildResolvedQuestion,
      generateHelpAnswer, generateMethodExplanationAnswer, generateNaturalAnswer,
      responseValidator: core.responseValidator, validateAnswer: core.responseValidator,
      textNormalizer: core.textNormalizer, typoNormalizer: core.typoNormalizer,
      slangAndAbbreviationResolver: core.slangAndAbbreviationResolver,
      municipalityResolver: core.municipalityResolver, taxonResolver: core.taxonResolver,
      speciesQueryExtractor: core.speciesQueryExtractor, intentClassifier: core.intentClassifier,
      sourceRouter: core.sourceRouter, queryPlanner: core.queryPlanner,
      classifyConversationIntent: core.classifyConversationIntent,
      herpetologyEngine: herpetology, methodologyEngine: methodology, municipalBiodiversityEngine: municipalEngine,
      scientificKnowledge: knowledge,
      scientificGuardrails: core.scientificGuardrails,
      styleValidator: core.styleValidator, answerLengthPolicy: core.answerLengthPolicy,
      receiveUserQuestion, answerQuestion: receiveUserQuestion, clearConversation: () => conversationState.clear(),
    };
  }

  const api = createBrain();
  api.createBrain = createBrain;
  api.ConversationState = core.ConversationState;
  api.INTENTS = INTENTS;
  global.HerpetoChatBrain = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
