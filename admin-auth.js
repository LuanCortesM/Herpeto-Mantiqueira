"use strict";

const crypto = require("crypto");

const DEFAULT_ADMIN_EMAIL = "";
const DEFAULT_ADMIN_PASSWORD_HASH = "";

const COOKIE_NAME = "herpeto_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map();

function getAdminEmail() {
  return String(process.env.HERPETO_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

function getPasswordHash() {
  return String(process.env.HERPETO_ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_PASSWORD_HASH).trim();
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, encodedHash = getPasswordHash()) {
  const [algorithm, salt, expected] = String(encodedHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return timingSafeEqualText(actual, expected);
}

function parseCookies(request) {
  return String(request.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf("=");
      if (separator <= 0) return cookies;
      cookies[decodeURIComponent(item.slice(0, separator))] = decodeURIComponent(item.slice(separator + 1));
      return cookies;
    }, {});
}

function createSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    email,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return token;
}

function getSession(request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastSeenAt = Date.now();
  return { ...session, token };
}

function destroySession(request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (token) sessions.delete(token);
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function expiredSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function authenticate(email, password) {
  const expectedEmail = getAdminEmail();
  const passwordHash = getPasswordHash();
  if (!expectedEmail || !passwordHash) return false;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!timingSafeEqualText(normalizedEmail, expectedEmail)) return false;
  return verifyPassword(password, passwordHash);
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  authenticate,
  createSession,
  getSession,
  destroySession,
  sessionCookie,
  expiredSessionCookie,
};
