(function (global) {
  const DEFAULT_PATH = "../IAAprendaAqui/taxonomy_backbone_initial.json";
  const OCR_PATH = "../IAAprendaAqui/taxonomy_local_index.json";
  const CONTEXT_INDEX_PATH = "../IAAprendaAqui/taxonomic_context_index.json";

  function removeAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalize(value) {
    return removeAccents(value).toLowerCase().replace(/[^a-z0-9\s.-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function createTaxonomyBackbone(dependencies = {}) {
    const isBrowser = typeof window !== "undefined";
    const loadJson = dependencies.loadJson || (isBrowser
      ? async (path) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`taxonomy_backbone_http_${response.status}`);
          return response.json();
        }
      : async (path) => {
          const fs = require("fs/promises");
          const nodePath = require("path");
          return JSON.parse(await fs.readFile(nodePath.join(__dirname, path), "utf8"));
        });
    let backbonePromise;
    let ocrPromise;
    let contextPromise;
    const loadBackbone = () => backbonePromise ||= loadJson(DEFAULT_PATH);
    const loadOCRIndex = () => ocrPromise ||= loadJson(OCR_PATH).catch(() => ({ species: [], genera: [], families: [] }));
    const loadContextIndex = () => contextPromise ||= loadJson(CONTEXT_INDEX_PATH).catch(() => ({ ranks: {}, speciesByGenus: {} }));
    const findOne = async (predicate) => (await loadBackbone()).taxa.find(predicate) || null;

    async function findTaxonByAcceptedName(name) {
      const target = normalize(name);
      return findOne((taxon) => taxon.acceptedName && normalize(taxon.acceptedName) === target);
    }

    async function findTaxonBySynonym(name) {
      const target = normalize(name);
      return findOne((taxon) => (taxon.synonyms || []).some((synonym) => normalize(synonym) === target));
    }

    async function findTaxonByPopularName(name) {
      const target = normalize(name).replace(/s$/, "");
      return (await loadBackbone()).taxa.filter((taxon) =>
        (taxon.popularNames || []).some((popular) => normalize(popular).replace(/s$/, "") === target)
      );
    }

    async function findTaxaByGenus(genus) {
      const target = normalize(genus);
      return (await loadBackbone()).taxa.filter((taxon) => normalize(taxon.genus) === target);
    }

    async function findTaxaByFamily(family) {
      const target = normalize(family);
      return (await loadBackbone()).taxa.filter((taxon) => normalize(taxon.family) === target);
    }

    async function findOCRMention(name) {
      const target = normalize(name);
      const index = await loadOCRIndex();
      return [...(index.species || []), ...(index.genera || []), ...(index.families || [])]
        .find((mention) => normalize(mention.name) === target) || null;
    }

    async function findTaxonContext(name) {
      const target = normalize(name);
      const index = await loadContextIndex();
      const ranks = index.ranks || {};
      const rankOrder = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];
      return Object.values(ranks)
        .flat()
        .sort((left, right) => rankOrder.indexOf(left.rank) - rankOrder.indexOf(right.rank))
        .find((entry) => normalize(entry.name) === target || normalize(entry.canonicalName) === target) || null;
    }

    async function findTaxaByRank(rank, options = {}) {
      const index = await loadContextIndex();
      const items = (index.ranks || {})[normalize(rank)] || [];
      const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
      return items.slice(0, limit);
    }

    function explainTaxonomicRank(rank) {
      const explanations = {
        kingdom: "Reino e um nivel amplo de classificacao biologica. Para o Gold, a herpetofauna tratada fica em Animalia.",
        phylum: "Filo agrupa grandes planos corporais. Anfibios e repteis ficam em Chordata.",
        class: "Classe separa grandes linhagens, como Amphibia e Reptilia.",
        order: "Ordem agrupa familias relacionadas, como Anura nos anfibios e Squamata nos repteis.",
        family: "Familia agrupa generos proximos e ajuda a interpretar morfologia, ecologia e risco.",
        genus: "Genero agrupa especies aparentadas, como Bothrops ou Rhinella. Nao e o mesmo que especie.",
        species: "Especie e o nivel usado para nomes binomiais, como Bothrops jararaca. Exige cuidado taxonomico e fonte.",
      };
      return explanations[normalize(rank)] || "Nivel taxonomico nao reconhecido pelo explicador local.";
    }

    async function distinguishValidatedFromOCRMention(name) {
      const taxon = await findTaxonByAcceptedName(name);
      const ocrMention = await findOCRMention(name);
      return {
        name,
        taxon,
        ocrMention,
        classification: taxon?.validationStatus === "validated"
          ? "validated"
          : taxon
            ? taxon.validationStatus
            : ocrMention
              ? "ocr_mention"
              : "unknown",
        note: ocrMention ? "Menção recuperada da biblioteca local, não checklist oficial." : null,
      };
    }

    async function classifyTaxonMention(text) {
      const raw = String(text || "").trim();
      const corrected = normalize(raw).replace(/\b(bopthrops|botrops|bothropes)\b/g, "bothrops").replace(/\b(rinella|rhinela)\b/g, "rhinella");
      const popular = await findTaxonByPopularName(corrected);
      if (popular.length) return { type: "popular_name", raw, normalized: corrected, ambiguous: true, matches: popular };
      const accepted = await findTaxonByAcceptedName(corrected);
      if (accepted) return { type: "accepted_name", raw, normalized: accepted.acceptedName, rank: accepted.rank, taxon: accepted };
      const synonym = await findTaxonBySynonym(corrected);
      if (synonym) return { type: "synonym", raw, normalized: synonym.acceptedName, rank: synonym.rank, taxon: synonym };
      const contextMention = await findTaxonContext(corrected);
      if (contextMention) return { type: "local_context_mention", raw, normalized: contextMention.name, rank: contextMention.rank, mention: contextMention, note: "Mencao recuperada da biblioteca limpa local, nao checklist oficial." };
      const ocrMention = await findOCRMention(corrected);
      if (ocrMention) return { type: "ocr_mention", raw, normalized: ocrMention.name, mention: ocrMention, note: "Menção recuperada da biblioteca local, não checklist oficial." };
      return { type: "unknown", raw, normalized: corrected };
    }

    async function getTaxonSummary(name) {
      const mention = await classifyTaxonMention(name);
      if (mention.type === "popular_name") {
        return { ...mention, summary: `${name} é nome popular ambíguo; não deve ser convertido automaticamente em espécie ou família.` };
      }
      if (mention.taxon) {
        return {
          ...mention,
          summary: `${mention.taxon.acceptedName} é um táxon de nível ${mention.taxon.rank}. Status local: ${mention.taxon.validationStatus}.`,
        };
      }
      if (mention.type === "ocr_mention") return { ...mention, summary: `${mention.normalized}: menção recuperada da biblioteca local, não checklist oficial.` };
      return { ...mention, summary: `Não encontrei ${name} no backbone inicial nem no índice OCR local.` };
    }

    return {
      DEFAULT_PATH, OCR_PATH, CONTEXT_INDEX_PATH, normalize, loadBackbone, loadOCRIndex, loadContextIndex,
      findTaxonByAcceptedName, findTaxonBySynonym, findTaxonByPopularName,
      findTaxonContext, findTaxaByRank, explainTaxonomicRank,
      findTaxaByGenus, findTaxaByFamily, classifyTaxonMention,
      distinguishValidatedFromOCRMention, getTaxonSummary,
    };
  }

  const api = createTaxonomyBackbone();
  api.createTaxonomyBackbone = createTaxonomyBackbone;
  global.GoldTaxonomyBackbone = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
