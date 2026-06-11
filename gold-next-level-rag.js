"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const conversationCore = require("./conversation-core.js");
const scientificOrchestrator = require("./gold-scientific-orchestrator.js");

const ROOT = __dirname;
const LOG_DIRECTORY = path.join(ROOT, "logs");
const LOG_PATH = process.env.GOLD_NEXT_LEVEL_RAG_LOG || path.join(LOG_DIRECTORY, "gold-next-level-rag.jsonl");
const PYTHON = process.env.GOLD_NEXT_LEVEL_PYTHON || path.join(ROOT, ".venv", "Scripts", "python.exe");
const ENDPOINT_SCRIPT = path.join(ROOT, "scripts", "gold_next_level_endpoint.py");
const DEFAULT_TIMEOUT_MS = Number(process.env.GOLD_NEXT_LEVEL_RAG_TIMEOUT_MS || 90000);

function isEnabled() {
  return String(process.env.GOLD_NEXT_LEVEL_RAG || "false").toLowerCase() === "true";
}

function routeFor(question) {
  const classification = conversationCore.classifyConversationIntent(question);
  const normalized = conversationCore.normalizeText(question);
  if (/\b(edna|dna ambiental)\b/.test(normalized) && classification.intent === conversationCore.CONVERSATION_INTENTS.UNKNOWN) {
    classification.intent = conversationCore.CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION;
    classification.thematicScope = conversationCore.SCOPES.GENERAL;
    classification.scope = conversationCore.SCOPES.GENERAL;
    classification.dataScope = conversationCore.DATA_SCOPES.LITERATURE_RAG;
    classification.municipalityRequired = false;
    classification.shouldAskMunicipality = false;
    classification.shouldClearPreviousContext = true;
  }
  const scientificCue = /\b(edna|dna ambiental|bioacustic|monitoramento acustico|inventario|amostragem|ecologia|conservacao|taxon|especie|genero|familia|anuro|anfibio|reptil|serpente|bothrops|jararaca|cascavel|cascaveis|crotalus|coral|corais|jiboia|jiboias|surucucu|mucurana|mussurana|caninana)\b/.test(normalized);
  const possibleNameMatch = String(question || "").match(/\b([A-Z][a-z]{2,})\s+([a-z][a-z-]{2,})\b/);
  const possibleScientificName = Boolean(possibleNameMatch && !new Set(["Como", "Qual", "Quais", "Onde", "Quando", "Porque", "Explique", "Fale"]).has(possibleNameMatch[1]));
  const eligibleIntents = new Set([
    conversationCore.CONVERSATION_INTENTS.GENERAL_SCIENTIFIC_QUESTION,
    conversationCore.CONVERSATION_INTENTS.GENERAL_TAXON_QUESTION,
    conversationCore.CONVERSATION_INTENTS.POPULAR_NAME_QUESTION,
    conversationCore.CONVERSATION_INTENTS.METHODOLOGY_QUESTION,
    conversationCore.CONVERSATION_INTENTS.REGIONAL_CONTEXT_QUESTION,
  ]);
  const preservedLegacyIntents = new Set([
    conversationCore.CONVERSATION_INTENTS.SAFETY_QUESTION,
    conversationCore.CONVERSATION_INTENTS.COMPLAINT,
    conversationCore.CONVERSATION_INTENTS.GREETING,
  ]);
  return {
    classification,
    eligible: !preservedLegacyIntents.has(classification.intent) && (eligibleIntents.has(classification.intent) || scientificCue || possibleScientificName),
    strategy: classification.dataScope !== "none" ? classification.dataScope : scientificCue || possibleScientificName ? "experimental_scientific_classifier" : "none",
  };
}

function writeLog(entry) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function invokeScientificLayer(question, options = {}) {
  return new Promise((resolve, reject) => {
    if (String(process.env.GOLD_NEXT_LEVEL_RAG_FORCE_FAILURE || "").toLowerCase() === "true") {
      reject(new Error("forced_next_level_failure"));
      return;
    }
    const child = spawn(PYTHON, [ENDPOINT_SCRIPT], {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("next_level_timeout"));
    }, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`next_level_process_failed:${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("next_level_invalid_json"));
      }
    });
    child.stdin.end(JSON.stringify({ question }));
  });
}

async function answer(question, options = {}) {
  const started = Date.now();
  const route = routeFor(question);
  const baseLog = {
    timestamp: new Date().toISOString(),
    question,
    feature_enabled: isEnabled(),
    intent_detected: route.classification.intent,
    thematic_scope: route.classification.thematicScope,
    data_scope: route.classification.dataScope,
    search_strategy: route.strategy,
  };

  if (!isEnabled()) {
    const result = { handled: false, fallback: true, fallbackReason: "feature_disabled", classification: route.classification };
    writeLog({ ...baseLog, chunks_retrieved: [], documents_used: [], evidence_sufficiency: null, citations_used: [], response_time_ms: Date.now() - started, fallback_triggered: true, fallback_reason: result.fallbackReason });
    return result;
  }

  if (!route.eligible) {
    const result = { handled: false, fallback: true, fallbackReason: "legacy_route_preserved", classification: route.classification };
    writeLog({ ...baseLog, chunks_retrieved: [], documents_used: [], evidence_sufficiency: null, citations_used: [], response_time_ms: Date.now() - started, fallback_triggered: true, fallback_reason: result.fallbackReason });
    return result;
  }

  if (String(process.env.GOLD_NEXT_LEVEL_RAG_FORCE_FAILURE || "").toLowerCase() === "true") {
    const result = { handled: false, fallback: true, fallbackReason: "experimental_layer_failure", classification: route.classification };
    writeLog({ ...baseLog, chunks_retrieved: [], documents_used: [], evidence_sufficiency: null, citations_used: [], response_time_ms: Date.now() - started, fallback_triggered: true, fallback_reason: result.fallbackReason, error: "forced_next_level_failure" });
    return result;
  }

  if (options.preferPython !== true) {
    try {
      const orchestrated = await scientificOrchestrator.answerQuestion(question);
      if (orchestrated?.handled && orchestrated.answer) {
        const evidence = Array.isArray(orchestrated.evidence)
          ? orchestrated.evidence
          : orchestrated.evidence?.primaryEvidence || [];
        const citations = evidence
          .map((item) => item.title || item.sourceId || item.id || item.reference)
          .filter(Boolean)
          .slice(0, 8);
        const insufficient = /nao encontrei evidencia|não encontrei evidência|evidencia local forte o suficiente|evidência local forte o suficiente/i.test(orchestrated.answer || "");
        const result = {
          handled: true,
          fallback: false,
          fallbackReason: null,
          answer: orchestrated.answer,
          classification: route.classification,
          traceability: {
            scientificIntent: orchestrated.plan?.classification?.intent || route.classification.intent,
            strategy: ["javascript_scientific_orchestrator"],
            sufficiency: {
              canAnswerSpecific: !insufficient,
              confidence: insufficient ? "insufficient" : "sufficient",
              evidenceCount: evidence.length,
              route: orchestrated.plan?.route || route.strategy,
            },
            chunks: evidence,
            documents: citations,
            citations,
          },
        };
        writeLog({
          ...baseLog,
          scientific_intent: result.traceability.scientificIntent,
          search_strategy: result.traceability.strategy,
          chunks_retrieved: evidence.map((item) => item.sourceId || item.id || item.document_id || item.title).filter(Boolean).slice(0, 20),
          documents_used: result.traceability.documents,
          evidence_sufficiency: result.traceability.sufficiency,
          citations_used: citations,
          response_time_ms: Date.now() - started,
          fallback_triggered: false,
          fallback_reason: null,
        });
        return result;
      }
    } catch (error) {
      writeLog({
        ...baseLog,
        chunks_retrieved: [],
        documents_used: [],
        evidence_sufficiency: null,
        citations_used: [],
        response_time_ms: Date.now() - started,
        fallback_triggered: true,
        fallback_reason: "javascript_orchestrator_failure",
        error: String(error.message || error).slice(0, 500),
      });
    }
  }

  try {
    const scientific = await invokeScientificLayer(question, options);
    const result = {
      handled: true,
      fallback: false,
      fallbackReason: null,
      answer: scientific.answer,
      classification: route.classification,
      traceability: {
        scientificIntent: scientific.classification?.intent,
        strategy: scientific.classification?.retrieval_strategy || [],
        sufficiency: scientific.sufficiency,
        chunks: scientific.chunks || [],
        documents: scientific.sufficiency?.documents_used || [],
        citations: scientific.citations || [],
      },
    };
    writeLog({
      ...baseLog,
      scientific_intent: scientific.classification?.intent,
      search_strategy: scientific.classification?.retrieval_strategy || [],
      chunks_retrieved: (scientific.chunks || []).map((item) => item.chunk_id),
      documents_used: scientific.sufficiency?.documents_used || [],
      evidence_sufficiency: scientific.sufficiency || null,
      citations_used: (scientific.citations || []).map((item) => item.short || item.reference),
      response_time_ms: Date.now() - started,
      fallback_triggered: false,
      fallback_reason: null,
    });
    return result;
  } catch (error) {
    writeLog({
      ...baseLog,
      chunks_retrieved: [],
      documents_used: [],
      evidence_sufficiency: null,
      citations_used: [],
      response_time_ms: Date.now() - started,
      fallback_triggered: true,
      fallback_reason: "experimental_layer_failure",
      error: String(error.message || error).slice(0, 500),
    });
    return { handled: false, fallback: true, fallbackReason: "experimental_layer_failure", classification: route.classification };
  }
}

module.exports = { answer, isEnabled, routeFor, invokeScientificLayer, writeLog, LOG_PATH };
