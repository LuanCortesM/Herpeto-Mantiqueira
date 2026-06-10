(function (global) {
  const MUNICIPALITIES = [
    {
      id: "cruzeiro_sp",
      name: "Cruzeiro-SP",
      aliases: ["cruzeiro", "cruzeiro sp", "cruzeiro-sp"],
      fuzzyAliases: ["cruzero", "cruzeir", "cruzeio", "cruzeiroo"],
      inaturalistPlaceId: 24896,
      speciesLinkCountyQueries: ["Cruzeiro"],
    },
    {
      id: "lavrinhas_sp",
      name: "Lavrinhas-SP",
      aliases: ["lavrinhas", "lavrinhas sp"],
      fuzzyAliases: ["lavrinas", "lavrinha", "lavrnhas"],
      inaturalistPlaceId: 25048,
      speciesLinkCountyQueries: ["Lavrinhas"],
    },
    {
      id: "queluz_sp",
      name: "Queluz-SP",
      aliases: ["queluz", "queluz sp"],
      fuzzyAliases: ["qeluz", "quelus"],
      inaturalistPlaceId: 25220,
      speciesLinkCountyQueries: ["Queluz"],
    },
    {
      id: "silveiras_sp",
      name: "Silveiras-SP",
      aliases: ["silveiras", "silveiras sp"],
      fuzzyAliases: ["silveira", "silveras", "silvveiras"],
      inaturalistPlaceId: 25328,
      speciesLinkCountyQueries: ["Silveiras"],
    },
    {
      id: "bananal_sp",
      name: "Bananal-SP",
      aliases: ["bananal", "bananal sp"],
      fuzzyAliases: ["bananl", "bannanal"],
      inaturalistPlaceId: 24803,
      speciesLinkCountyQueries: ["Bananal"],
    },
    {
      id: "areias_sp",
      name: "Areias-SP",
      aliases: ["areias", "areias sp"],
      fuzzyAliases: ["areia"],
      inaturalistPlaceId: 24788,
      speciesLinkCountyQueries: ["Areias"],
    },
    {
      id: "sao_jose_do_barreiro_sp",
      name: "São José do Barreiro-SP",
      aliases: [
        "são josé do barreiro",
        "sao jose do barreiro",
        "sao jose barreiro",
        "são jose barreiro",
        "sj barreiro",
        "s jose barreiro",
        "jose do barreiro",
      ],
      fuzzyAliases: ["sao j do barreiro", "sao jose do barero"],
      inaturalistPlaceId: 25303,
      speciesLinkCountyQueries: ["Sao Jose do Barreiro", "São José do Barreiro"],
    },
    {
      id: "arapei_sp",
      name: "Arapeí-SP",
      aliases: ["arapeí", "arapei", "arapeí sp", "arapei sp"],
      fuzzyAliases: ["arapey", "arape"],
      inaturalistPlaceId: 24783,
      speciesLinkCountyQueries: ["Arapei", "Arapeí"],
    },
  ];

  function removeAccents(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeAlias(text) {
    return removeAccents(text)
      .toLowerCase()
      .replace(/[-_/.,;:()[\]?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toINaturalistMap() {
    const map = {};
    MUNICIPALITIES.forEach((municipality) => {
      municipality.aliases.forEach((alias) => {
        map[alias] = { id: municipality.id, name: municipality.name, placeId: municipality.inaturalistPlaceId };
      });
    });
    return map;
  }

  function toSpeciesLinkMap() {
    const map = {};
    MUNICIPALITIES.forEach((municipality) => {
      municipality.aliases.forEach((alias) => {
        map[alias] = {
          id: municipality.id,
          name: removeAccents(municipality.name),
          displayName: municipality.name,
          countyQueries: municipality.speciesLinkCountyQueries,
        };
      });
    });
    return map;
  }

  function getUniqueMunicipalities() {
    return MUNICIPALITIES.map((municipality) => ({
      id: municipality.id,
      name: municipality.name,
      placeId: municipality.inaturalistPlaceId,
      inaturalistPlaceId: municipality.inaturalistPlaceId,
      speciesLinkCountyQueries: municipality.speciesLinkCountyQueries,
    }));
  }

  const api = { MUNICIPALITIES, removeAccents, normalizeAlias, toINaturalistMap, toSpeciesLinkMap, getUniqueMunicipalities };
  global.HerpetoMunicipalities = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
