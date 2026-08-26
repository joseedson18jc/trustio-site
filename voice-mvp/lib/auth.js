import crypto from "node:crypto";

export const COOKIE_NAME = "trustio_voice_demo";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

export function safeEqual(left, right) {
  return crypto.timingSafeEqual(digest(left), digest(right));
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const signature = parts[2];
  if (!safeEqual(signature, sign(payload, secret))) return false;

  const exp = Number(parts[1]);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export function readCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        const key = index >= 0 ? part.slice(0, index) : part;
        const value = index >= 0 ? part.slice(index + 1) : "";
        return [decodeURIComponent(key), decodeURIComponent(value)];
      }),
  );
}

export function sessionCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
