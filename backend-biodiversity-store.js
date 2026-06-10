const fs = require("fs");
const path = require("path");

const DEFAULT_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7;
const DATA_DIRECTORY = process.env.BIODIVERSITY_DATA_DIRECTORY
  ? path.resolve(process.env.BIODIVERSITY_DATA_DIRECTORY)
  : path.join(__dirname, "backend-data", "biodiversity-cache");
const DATABASE_PATH = path.join(DATA_DIRECTORY, "database.json");

function emptyDatabase() {
  return {
    version: 1,
    updatedAt: null,
    sources: {
      inaturalist: { snapshots: {}, lastAttemptAt: null, lastSuccessAt: null },
      specieslink: { snapshots: {}, lastAttemptAt: null, lastSuccessAt: null },
      iucn: { snapshots: {}, lastAttemptAt: null, lastSuccessAt: null },
    },
  };
}

function ensureDirectory() {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
}

function readDatabase() {
  try {
    if (!fs.existsSync(DATABASE_PATH)) return emptyDatabase();
    const parsed = JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8"));
    const database = emptyDatabase();
    return {
      ...database,
      ...parsed,
      sources: {
        ...database.sources,
        ...(parsed.sources || {}),
      },
    };
  } catch (error) {
    console.warn("Banco local de biodiversidade ilegivel; iniciando uma copia limpa:", error.message);
    return emptyDatabase();
  }
}

function writeDatabase(database) {
  ensureDirectory();
  const next = { ...database, updatedAt: new Date().toISOString() };
  const temporaryPath = `${DATABASE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, DATABASE_PATH);
  return next;
}

function snapshotKey(parts) {
  return parts.filter((part) => part !== undefined && part !== null && part !== "").join(":");
}

function getSnapshot(source, key) {
  return readDatabase().sources?.[source]?.snapshots?.[key] || null;
}

function setSnapshot(source, key, snapshot) {
  const database = readDatabase();
  if (!database.sources[source]) database.sources[source] = { snapshots: {} };
  if (!database.sources[source].snapshots) database.sources[source].snapshots = {};
  database.sources[source].snapshots[key] = {
    ...snapshot,
    source,
    key,
    updatedAt: new Date().toISOString(),
  };
  database.sources[source].lastAttemptAt = new Date().toISOString();
  database.sources[source].lastSuccessAt = new Date().toISOString();
  return writeDatabase(database).sources[source].snapshots[key];
}

function recordAttempt(source, details = {}) {
  const database = readDatabase();
  if (!database.sources[source]) database.sources[source] = { snapshots: {} };
  database.sources[source].lastAttemptAt = new Date().toISOString();
  database.sources[source].lastAttempt = {
    ...details,
    recordedAt: new Date().toISOString(),
  };
  return writeDatabase(database);
}

function isStale(snapshot, refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {
  if (!snapshot?.updatedAt) return true;
  return Date.now() - new Date(snapshot.updatedAt).getTime() >= refreshIntervalMs;
}

function summary() {
  const database = readDatabase();
  const sources = {};
  Object.entries(database.sources || {}).forEach(([name, source]) => {
    const snapshots = Object.values(source.snapshots || {});
    sources[name] = {
      snapshots: snapshots.length,
      records: snapshots.reduce((sum, snapshot) => {
        const payload = snapshot.payload;
        const records = payload?.records || payload?.results || [];
        return sum + (Array.isArray(records) ? records.length : 0);
      }, 0),
      lastAttemptAt: source.lastAttemptAt || null,
      lastSuccessAt: source.lastSuccessAt || null,
    };
  });
  return {
    success: true,
    databasePath: DATABASE_PATH,
    updatedAt: database.updatedAt,
    refreshIntervalDays: DEFAULT_REFRESH_INTERVAL_MS / (1000 * 60 * 60 * 24),
    sources,
  };
}

module.exports = {
  DATA_DIRECTORY,
  DATABASE_PATH,
  DEFAULT_REFRESH_INTERVAL_MS,
  emptyDatabase,
  readDatabase,
  writeDatabase,
  snapshotKey,
  getSnapshot,
  setSnapshot,
  recordAttempt,
  isStale,
  summary,
};
