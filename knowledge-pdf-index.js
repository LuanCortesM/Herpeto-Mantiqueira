"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

const CLEAN_INDEX_PATH = path.join(__dirname, "IAAprendaAqui", "herpetology_pdf_chunks_clean.jsonl");
const LEGACY_INDEX_PATH = path.join(__dirname, "IAAprendaAqui", "herpetology_pdf_chunks.jsonl");
const CLEAN_INDEX_GZIP_PATH = `${CLEAN_INDEX_PATH}.gz`;
const LEGACY_INDEX_GZIP_PATH = `${LEGACY_INDEX_PATH}.gz`;
const INDEX_CANDIDATES = [
  CLEAN_INDEX_PATH,
  CLEAN_INDEX_GZIP_PATH,
  LEGACY_INDEX_PATH,
  LEGACY_INDEX_GZIP_PATH,
];
const INDEX_PATH = INDEX_CANDIDATES.find((indexPath) => fs.existsSync(indexPath)) || LEGACY_INDEX_PATH;
const OCR_SUPPLEMENT_PATH = path.join(__dirname, "IAAprendaAqui", "herpetology_pdf_ocr_supplement.jsonl");
const OCR_SUPPLEMENT_GZIP_PATH = `${OCR_SUPPLEMENT_PATH}.gz`;
const CATALOG_PATH = path.join(__dirname, "IAAprendaAqui", "herpetology_pdf_catalog.json");
const EXCLUSIONS_PATH = path.join(__dirname, "IAAprendaAqui", "pdf_rag_exclusions.json");
const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
  "em", "entre", "essa", "esse", "isso", "na", "nas", "no", "nos", "o", "os",
  "para", "por", "qual", "que", "se", "sobre", "um", "uma",
]);
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 30;
const searchCache = new Map();
let exclusionCache = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token)))];
}

function scoreChunk(chunk, queryTokens) {
  const title = normalize(chunk.title);
  const text = normalize(chunk.text);
  return queryTokens.reduce((score, token) => {
    if (title.includes(token)) score += 5;
    if (text.includes(token)) score += 2;
    return score;
  }, 0);
}

function loadExclusions() {
  if (exclusionCache) return exclusionCache;
  const fileNames = new Set();
  if (fs.existsSync(EXCLUSIONS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(EXCLUSIONS_PATH, "utf8"));
      (data.items || []).forEach((item) => {
        if (item.fileName) fileNames.add(normalize(item.fileName));
      });
    } catch {
      // If the exclusion file is malformed, keep search available instead of failing the chat.
    }
  }
  exclusionCache = { fileNames };
  return exclusionCache;
}

function fileNameFromChunk(chunk) {
  const candidates = [chunk.source_file, chunk.fileName, chunk.relative_path, chunk.title].filter(Boolean);
  for (const candidate of candidates) {
    const parts = String(candidate).split(/[\\/]/);
    const last = parts[parts.length - 1];
    if (last && /\.pdf$/i.test(last)) return last;
  }
  return candidates[0] || "";
}

function isExcludedChunk(chunk) {
  const exclusions = loadExclusions();
  const fileName = normalize(fileNameFromChunk(chunk));
  return fileName && exclusions.fileNames.has(fileName);
}

function openJsonlStream(indexPath) {
  const stream = fs.createReadStream(indexPath, { encoding: indexPath.endsWith(".gz") ? undefined : "utf8" });
  if (indexPath.endsWith(".gz")) {
    return stream.pipe(zlib.createGunzip()).setEncoding("utf8");
  }
  return stream;
}

function catalogSummary() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return { available: false, documents_total: 0, chunks_total: 0 };
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  return {
    available: true,
    generated_at: catalog.generated_at,
    documents_total: catalog.documents_total,
    documents_with_text: catalog.documents_with_text,
    documents_failed: catalog.documents_failed,
    chunks_total: catalog.chunks_total,
  };
}

async function searchPdfKnowledge(query, options = {}) {
  const queryTokens = tokens(query);
  const limit = Math.min(Math.max(Number(options.limit || 4), 1), 8);
  const indexPaths = [INDEX_PATH];
  if (INDEX_PATH !== CLEAN_INDEX_PATH && INDEX_PATH !== CLEAN_INDEX_GZIP_PATH) {
    if (fs.existsSync(OCR_SUPPLEMENT_PATH)) indexPaths.push(OCR_SUPPLEMENT_PATH);
    else if (fs.existsSync(OCR_SUPPLEMENT_GZIP_PATH)) indexPaths.push(OCR_SUPPLEMENT_GZIP_PATH);
  }
  const availableIndexPaths = indexPaths.filter((indexPath) => fs.existsSync(indexPath));
  if (!queryTokens.length || !availableIndexPaths.length) return [];
  const cacheKey = `${queryTokens.sort().join("|")}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) return cached.results;
  const best = [];
  for (const indexPath of availableIndexPaths) {
    const input = openJsonlStream(indexPath);
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }
      if (isExcludedChunk(chunk)) continue;
      const score = scoreChunk(chunk, queryTokens) + (chunk.origin === "heavy_ocr_supplement" ? 1 : 0);
      if (score <= 0) continue;
      best.push({ ...chunk, score });
      best.sort((left, right) => right.score - left.score);
      if (best.length > limit * 8) best.length = limit * 8;
    }
  }
  const seen = new Set();
  const results = best
    .filter((chunk) => {
      if (seen.has(chunk.document_id)) return false;
      seen.add(chunk.document_id);
      return true;
    })
    .slice(0, limit)
    .map((chunk) => ({
      document_id: chunk.document_id,
      title: chunk.title,
      page: chunk.page,
      text: chunk.text,
      score: chunk.score,
    }));
  searchCache.set(cacheKey, { timestamp: Date.now(), results });
  return results;
}

module.exports = {
  INDEX_PATH, CLEAN_INDEX_PATH, CLEAN_INDEX_GZIP_PATH, LEGACY_INDEX_PATH, LEGACY_INDEX_GZIP_PATH, OCR_SUPPLEMENT_PATH, OCR_SUPPLEMENT_GZIP_PATH, CATALOG_PATH, EXCLUSIONS_PATH, SEARCH_CACHE_TTL_MS, normalize, tokens, scoreChunk,
  catalogSummary, searchPdfKnowledge, clearSearchCache: () => searchCache.clear(),
};
