"use strict";

(function (global) {
  const BAD_TEXT_PATTERNS = [
    /\bnull\b/i,
    /\bundefined\b/i,
    /\[documento local\]/i,
    /Arquivo:/i,
    /(?:\/C\d{2,3}){2,}/i,
    /[A-Z]{4,}\$/i,
    /ï¿½/,
    /\uFFFD/,
  ];

  const MOJIBAKE_MARKERS = [
    "Ãƒ",
    "Ã‚",
    "Ã¢",
    "â€",
    "â€™",
    "â€œ",
    "â€",
    "ï¿½",
    "\uFFFD",
  ];

  const EXCLUDED_SOURCE_PATTERNS = [
    /Apostila_Taxidermia/i,
    /Wiki Aves/i,
    /Teste artigo/i,
    /\bpit fall\b/i,
    /PITTFALLS/i,
    /ToxiconCobras/i,
    /queimado_cobras/i,
  ];

  function packedEvidenceText(item) {
    return [item?.title, item?.text, item?.sourceId, item?.sourceType, item?.origin]
      .filter(Boolean)
      .join(" ");
  }

  function evidenceIdentity(item) {
    return String(item?.sourceId || item?.title || item?.sourceType || "unknown").toLowerCase();
  }

  function evidenceIssues(item) {
    const packed = packedEvidenceText(item);
    const issues = [];
    if (!String(item?.text || "").trim()) issues.push("empty_text");
    if (String(item?.text || "").replace(/\s+/g, " ").trim().length < 50) issues.push("too_short");
    if (!item?.title && !item?.sourceId) issues.push("missing_source");
    if (BAD_TEXT_PATTERNS.some((pattern) => pattern.test(packed))) issues.push("broken_text");
    if (MOJIBAKE_MARKERS.some((marker) => packed.includes(marker))) issues.push("mojibake");
    if (EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(packed))) issues.push("excluded_source");
    if ((item?.qualityScore ?? 1) < 0.32) issues.push("low_text_quality");
    if ((item?.score ?? 1) < 0.34) issues.push("low_retrieval_score");
    return [...new Set(issues)];
  }

  function isUsableEvidence(item) {
    return evidenceIssues(item).length === 0;
  }

  function summarizeEvidence(items = []) {
    const total = items.length;
    const usable = items.filter(isUsableEvidence);
    const identities = new Set(usable.map(evidenceIdentity));
    const sourceTypes = new Set(usable.map((item) => item.sourceType || "unknown"));
    const avgScore = usable.length
      ? usable.reduce((sum, item) => sum + Number(item.score || item.baseScore || 0), 0) / usable.length
      : 0;
    const avgQuality = usable.length
      ? usable.reduce((sum, item) => sum + Number(item.qualityScore ?? 0.5), 0) / usable.length
      : 0;
    return {
      total,
      usableCount: usable.length,
      rejectedCount: total - usable.length,
      sourceIdentityCount: identities.size,
      sourceTypeCount: sourceTypes.size,
      avgScore,
      avgQuality,
      citationReady: usable.length > 0 && usable.every((item) => item.title || item.sourceId),
    };
  }

  function assessEvidenceBundle(bundle = {}) {
    const primary = bundle.primaryEvidence || [];
    const evidence = primary.length ? primary : (bundle.evidence || []);
    const summary = summarizeEvidence(evidence);
    const rejected = evidence
      .map((item) => ({ item, issues: evidenceIssues(item) }))
      .filter((entry) => entry.issues.length > 0)
      .map((entry) => ({
        title: entry.item.title || entry.item.sourceId || "fonte sem titulo",
        sourceType: entry.item.sourceType || "unknown",
        issues: entry.issues,
      }));

    let level = "none";
    if (summary.usableCount >= 2 && summary.sourceIdentityCount >= 2 && summary.avgScore >= 0.58 && summary.citationReady) {
      level = "strong";
    } else if (summary.usableCount >= 1 && summary.avgScore >= 0.48 && summary.citationReady) {
      level = "moderate";
    } else if (summary.usableCount >= 1) {
      level = "weak";
    }

    const canAnswerSpecific = level === "strong" || level === "moderate";
    const shouldQualify = level !== "strong";
    const issues = [];
    if (!summary.usableCount) issues.push("no_usable_evidence");
    if (!summary.citationReady) issues.push("not_citation_ready");
    if (summary.sourceIdentityCount < 2 && level === "moderate") issues.push("single_source_answer");
    if (rejected.length) issues.push("some_evidence_rejected");

    return {
      level,
      canAnswerSpecific,
      shouldQualify,
      citationReady: summary.citationReady,
      summary,
      issues: [...new Set(issues)],
      rejected,
    };
  }

  function fallbackForWeakEvidence(bundle = {}) {
    const assessment = bundle.reliability || assessEvidenceBundle(bundle);
    if (assessment.canAnswerSpecific) return null;
    return "Nao encontrei evidencia limpa e citavel o suficiente para sustentar uma resposta especifica. Posso explicar o conceito de forma geral, mas nao vou apresentar isso como dado confirmado pela biblioteca local.";
  }

  function formatEvidenceReferences(evidence = [], limit = 4) {
    return evidence
      .filter(isUsableEvidence)
      .slice(0, limit)
      .map((item, index) => {
        const title = item.title || item.sourceId || "Fonte local sem titulo";
        const page = item.page ? ` p. ${item.page}` : "";
        const type = item.sourceType ? ` (${item.sourceType})` : "";
        return `${index + 1}. ${title}${page}${type}.`;
      });
  }

  const api = {
    BAD_TEXT_PATTERNS,
    MOJIBAKE_MARKERS,
    EXCLUDED_SOURCE_PATTERNS,
    packedEvidenceText,
    evidenceIssues,
    isUsableEvidence,
    summarizeEvidence,
    assessEvidenceBundle,
    fallbackForWeakEvidence,
    formatEvidenceReferences,
  };

  global.GoldScientificReliability = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
