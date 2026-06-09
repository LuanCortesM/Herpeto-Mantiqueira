"use strict";

(function (global) {
  const coreDefault =
    global.HerpetoConversationCore ||
    (typeof require === "function" ? require("./conversation-core.js") : null);
  const uxDefault =
    global.GoldUxResponses ||
    (typeof require === "function" ? require("./gold-ux-responses.js") : null);

  function splitClaims(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((claim) => claim.trim())
      .filter((claim) => claim.length > 12);
  }

  function includesAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function createIssue(validator, code, severity, message) {
    return { validator, code, severity, message };
  }

  function createAnswerComposer(dependencies = {}) {
    const core = dependencies.core || coreDefault;
    const ux = dependencies.ux || uxDefault;

    function createEnvelope(input = {}) {
      const userQuestion = input.userQuestion || input.question || "";
      const classifiedIntent = input.classifiedIntent || core.classifyConversationIntent(userQuestion);
      const finalText = String(input.finalText || input.answer || "").trim();
      return {
        userQuestion,
        classifiedIntent,
        evidenceUsed: input.evidenceUsed || input.evidence || [],
        claims: input.claims || splitClaims(finalText),
        uncertainty: input.uncertainty || [],
        safetyNotes: input.safetyNotes || [],
        scopeNotes: input.scopeNotes || [],
        finalText,
      };
    }

    function validateScope(envelope) {
      const issues = [];
      const text = envelope.finalText.toLowerCase();
      const intent = envelope.classifiedIntent?.intent;
      const generalIntent = [
        "general_scientific_question",
        "general_taxon_question",
        "popular_name_question",
        "methodology_question",
        "safety_question",
      ].includes(intent);
      if (generalIntent && /preciso.*munic[ií]pio|precisa.*cidade/.test(text)) {
        issues.push(createIssue("scope", "unneeded_municipality", "error", "A resposta pediu município para uma pergunta geral."));
      }
      if (/brasil/.test(text) && /preciso.*munic[ií]pio/.test(text)) {
        issues.push(createIssue("scope", "brazil_as_municipal", "error", "A resposta confundiu escopo Brasil com consulta municipal."));
      }
      if (/s[oó] consigo|sou limitado|apenas.*munic[ií]pios/.test(text) && generalIntent) {
        issues.push(createIssue("scope", "regional_focus_as_total_limit", "warning", "O foco regional apareceu como limitação conversacional total."));
      }
      return issues;
    }

    function validateTaxonomy(envelope) {
      const issues = [];
      const question = core.normalizeText(envelope.userQuestion);
      const text = core.normalizeText(envelope.finalText);
      if (/\bjararacas?\b/.test(question) && /\bjararaca e uma especie unica\b|\bjararaca e a especie\b/.test(text)) {
        issues.push(createIssue("taxonomy", "popular_name_as_unique_species", "error", "Nome popular tratado como espécie única."));
      }
      const extracted = core.speciesQueryExtractor(envelope.userQuestion);
      if (extracted.rejectedSpeciesCandidates?.length && /bothrops voce|rhinella quais|viperidae que|anura o/.test(text)) {
        issues.push(createIssue("taxonomy", "false_binomial_accepted", "error", "Falso binômio apareceu como táxon aceito."));
      }
      if (/\bbothrops voce\b|\bbothrops existem\b|\bbothrops tem\b|\brhinella quais\b|\bviperidae que\b|\banura o\b/.test(text)) {
        issues.push(createIssue("taxonomy", "false_binomial_accepted", "error", "A resposta aceitou uma palavra funcional como epíteto específico."));
      }
      return issues;
    }

    function validateBiodiversity(envelope) {
      const issues = [];
      const text = envelope.finalText.toLowerCase();
      if (/api.*(falh|indispon)|fonte.*(falh|indispon)/.test(text) && /n[aã]o ocorre|aus[eê]ncia real|n[aã]o existe na natureza/.test(text)) {
        issues.push(createIssue("biodiversity", "api_failure_as_absence", "error", "Falha externa foi tratada como ausência biológica real."));
      }
      if (/inaturalist/.test(text) && /voucher/.test(text) && /observa[cç][aã]o.*voucher|voucher.*observa[cç][aã]o/.test(text)) {
        issues.push(createIssue("biodiversity", "citizen_science_as_voucher", "error", "Observação de ciência cidadã foi confundida com voucher."));
      }
      if (/cache antigo/.test(text) && !/sinaliz|cuidado|limita/.test(text)) {
        issues.push(createIssue("biodiversity", "stale_cache_not_flagged", "warning", "Cache antigo apareceu sem nota de limitação."));
      }
      return issues;
    }

    function validateEvidence(envelope) {
      const issues = [];
      const evidence = envelope.evidenceUsed || [];
      const scientific = envelope.claims.some((claim) => /esp[eé]cie|t[aá]xon|ecolog|conserva|metodolog|registro|voucher/i.test(claim));
      const weak = evidence.length && evidence.every((item) => (item.qualityScore ?? 1) < 0.32 || (item.score ?? 1) < 0.34);
      if (scientific && !evidence.length && /fonte|artigo|literatura|segundo/i.test(envelope.finalText)) {
        issues.push(createIssue("evidence", "citation_without_evidence", "error", "A resposta citou fonte sem evidência estruturada."));
      }
      if (weak) {
        issues.push(createIssue("evidence", "weak_ocr_as_evidence", "error", "A evidência disponível é fraca demais para sustentar a resposta."));
      }
      return issues;
    }

    function validateSafety(envelope) {
      const issues = [];
      const question = core.normalizeText(envelope.userQuestion);
      const text = core.normalizeText(envelope.finalText);
      const venomousContext = /\b(jararaca|bothrops|picad|mordid|peconhent|veneno)\b/.test(question);
      if (venomousContext && /\bpicad|mordid\b/.test(question) && !/atendimento medico|servico de saude|hospital|samu|192/.test(text)) {
        issues.push(createIssue("safety", "missing_bite_urgent_care", "error", "Pergunta sobre picada sem orientação de atendimento imediato."));
      }
      if (/\b(pegar|capturar|matar|manusear)\b/.test(question) && /pode pegar|capture|mate|manuseie/.test(text)) {
        issues.push(createIssue("safety", "dangerous_handling_advice", "error", "A resposta estimula manejo perigoso de serpente."));
      }
      return issues;
    }

    function validateStyle(envelope) {
      const issues = [];
      if (ux.repeatedSentenceIssues(envelope.finalText).length) {
        issues.push(createIssue("style", "repeated_sentence_loop", "error", "A mesma frase foi repetida três vezes ou mais."));
      }
      if (ux.hasRoboticMunicipalityLoop(envelope.finalText)) {
        issues.push(createIssue("style", "municipality_loop", "error", "Resposta entrou em loop de município."));
      }
      if (!envelope.finalText) {
        issues.push(createIssue("style", "empty_answer", "error", "Resposta vazia."));
      }
      return issues;
    }

    function validateEnvelope(envelope) {
      return [
        ...validateScope(envelope),
        ...validateTaxonomy(envelope),
        ...validateBiodiversity(envelope),
        ...validateEvidence(envelope),
        ...validateSafety(envelope),
        ...validateStyle(envelope),
      ];
    }

    function validateGoldAnswer(input) {
      const envelope = createEnvelope(input);
      const issues = validateEnvelope(envelope);
      return {
        ...envelope,
        validation: {
          passed: !issues.some((issue) => issue.severity === "error"),
          issues,
        },
      };
    }

    return {
      createEnvelope,
      validateScope,
      validateTaxonomy,
      validateBiodiversity,
      validateEvidence,
      validateSafety,
      validateStyle,
      validateEnvelope,
      validateGoldAnswer,
      splitClaims,
    };
  }

  const api = createAnswerComposer();
  api.createAnswerComposer = createAnswerComposer;
  global.GoldAnswerComposer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
