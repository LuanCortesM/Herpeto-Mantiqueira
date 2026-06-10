"use strict";

const fs = require("fs");
const path = require("path");

const CONTENT_DIRECTORY = path.join(__dirname, "content");
const BACKUP_DIRECTORY = path.join(CONTENT_DIRECTORY, "backups");
const CONTENT_PATH = path.join(CONTENT_DIRECTORY, "site-content.json");

function defaultContent() {
  return {
    version: 1,
    updatedAt: null,
    updatedBy: null,
    site: {
      title: "HerpetoMantiqueira",
      subtitle: "Biodiversidade & Conservacao",
    },
    pages: {
      "index.html": {
        title: "HerpetoMantiqueira",
        patches: [],
      },
      "sobre-gold.html": {
        title: "Sobre o Gold",
        patches: [],
      },
      "oikos-fieldbook.html": {
        title: "Oikos FieldBook",
        patches: [],
      },
      "sigmai.html": {
        title: "SIGMAI",
        patches: [],
      },
      "topotrail.html": {
        title: "TopoTrail",
        patches: [],
      },
      "herpetofauna-cruzeiro.html": {
        title: "Herpetofauna de Cruzeiro",
        patches: [],
      },
    },
    notes: [
      "Use patches para editar textos sem alterar HTML.",
      "Exemplo: { \"selector\": \".home-hero h1\", \"text\": \"Novo titulo\" }",
    ],
  };
}

function ensureContent() {
  fs.mkdirSync(CONTENT_DIRECTORY, { recursive: true });
  fs.mkdirSync(BACKUP_DIRECTORY, { recursive: true });
  if (!fs.existsSync(CONTENT_PATH)) {
    writeContent(defaultContent(), { updatedBy: "system", backup: false });
  }
}

function readContent() {
  ensureContent();
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTENT_PATH, "utf8"));
    return { ...defaultContent(), ...parsed };
  } catch {
    return defaultContent();
  }
}

function backupCurrentContent() {
  ensureContent();
  if (!fs.existsSync(CONTENT_PATH)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIRECTORY, `site-content-${stamp}.json`);
  fs.copyFileSync(CONTENT_PATH, backupPath);
  return backupPath;
}

function validateContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("O conteudo precisa ser um objeto JSON.");
  }
  if (content.pages && (typeof content.pages !== "object" || Array.isArray(content.pages))) {
    throw new Error("pages precisa ser um objeto.");
  }
  Object.entries(content.pages || {}).forEach(([page, config]) => {
    if (!/^[a-z0-9._-]+\.html$/i.test(page)) throw new Error(`Pagina invalida: ${page}`);
    if (config?.patches && !Array.isArray(config.patches)) throw new Error(`patches precisa ser lista em ${page}`);
    (config?.patches || []).forEach((patch, index) => {
      if (!patch || typeof patch !== "object") throw new Error(`Patch invalido em ${page} #${index + 1}`);
      if (!patch.selector || typeof patch.selector !== "string") throw new Error(`Patch sem selector em ${page} #${index + 1}`);
    });
  });
}

function writeContent(content, options = {}) {
  validateContent(content);
  ensureContent();
  const backupPath = options.backup === false ? null : backupCurrentContent();
  const next = {
    ...content,
    version: Number(content.version || 1),
    updatedAt: new Date().toISOString(),
    updatedBy: options.updatedBy || content.updatedBy || "admin",
  };
  const temporaryPath = `${CONTENT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, CONTENT_PATH);
  return { content: next, backupPath };
}

function publicContent() {
  const content = readContent();
  const { admin, drafts, ...safe } = content;
  return safe;
}

module.exports = {
  CONTENT_DIRECTORY,
  BACKUP_DIRECTORY,
  CONTENT_PATH,
  defaultContent,
  ensureContent,
  readContent,
  writeContent,
  publicContent,
  validateContent,
};

