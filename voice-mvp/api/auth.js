import {
  COOKIE_NAME,
  clearSessionCookie,
  createSession,
  readCookies,
  safeEqual,
  sessionCookie,
  verifySession,
} from "../lib/auth.js";

function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(body);
}

export default async function handler(req, res) {
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret) {
    return json(res, 503, { error: "Demo session secret is not configured." });
  }

  const cookies = readCookies(req.headers.cookie || "");
  const authenticated = verifySession(cookies[COOKIE_NAME], secret);

  if (req.method === "GET") {
    return json(res, 200, { authenticated });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return json(res, 200, { authenticated: false });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return json(res, 405, { error: "Method not allowed." });
  }

  const expectedCode = process.env.DEMO_ACCESS_CODE;
  if (!expectedCode) {
    return json(res, 503, { error: "Demo access code is not configured." });
  }

  const suppliedCode = String(req.body?.code || "").trim();
  if (!suppliedCode || !safeEqual(suppliedCode, expectedCode)) {
    return json(res, 401, { error: "Invalid access code." });
  }

  res.setHeader("Set-Cookie", sessionCookie(createSession(secret)));
  return json(res, 200, { authenticated: true });
}
