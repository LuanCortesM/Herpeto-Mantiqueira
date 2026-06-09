"use strict";

(function (global) {
  const SUPPORTED_MUNICIPALITIES =
    "Cruzeiro, Lavrinhas, Queluz, Silveiras, Bananal, Areias, São José do Barreiro e Arapeí";

  const responses = {
    supportedMunicipalities: SUPPORTED_MUNICIPALITIES,
    exitMunicipalContext:
      "Entendi. Vou responder de forma geral, sem restringir a um município.",
    municipalityRequired:
      `Posso consultar registros locais, mas preciso do município. Trabalho com ${SUPPORTED_MUNICIPALITIES}.`,
    generalQuestion:
      "Posso responder de forma geral. Para registros locais do Vale Histórico, aí sim preciso do município.",
    popularName:
      "Esse é um nome popular e pode variar regionalmente.",
    frustration:
      "Você tem razão em reclamar. Eu fiquei preso em um fluxo municipal. Vou limpar esse contexto.",
    localStructuredLimit:
      "Tenho dados estruturados locais para os municípios do Vale Histórico. Fora disso, posso responder por literatura e conhecimento científico, mas não como checklist municipal validado.",
  };

  function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function splitSentences(text) {
    return normalizeWhitespace(text)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  function repeatedSentenceIssues(text) {
    const counts = new Map();
    splitSentences(text).forEach((sentence) => {
      const key = sentence.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([sentence, count]) => ({ sentence, count }));
  }

  function hasRoboticMunicipalityLoop(text) {
    const normalized = normalizeWhitespace(text).toLowerCase();
    const asksMunicipality = (normalized.match(/munic[ií]pio/g) || []).length;
    return asksMunicipality >= 3 || repeatedSentenceIssues(text).length > 0;
  }

  function repairRepeatedDisclaimers(text) {
    const seen = new Set();
    return splitSentences(text)
      .filter((sentence) => {
        const key = sentence.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(" ");
  }

  const api = {
    ...responses,
    normalizeWhitespace,
    splitSentences,
    repeatedSentenceIssues,
    hasRoboticMunicipalityLoop,
    repairRepeatedDisclaimers,
  };

  global.GoldUxResponses = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
