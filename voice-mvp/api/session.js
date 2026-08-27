import { COOKIE_NAME, readCookies, resolveSessionSecret, verifySession } from "../lib/auth.js";

// This deployment is intentionally dedicated to Crédito Jus only.
// The ID is not a credential. XAI_API_KEY remains server-side and secret.
const CREDITOJUS_AGENT_ID = process.env.CREDITOJUS_XAI_AGENT_ID || "agent_XrzC3PUBPY9m5pEs";

function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  const sessionSecret = resolveSessionSecret();
  const cookies = readCookies(req.headers.cookie || "");
  if (!verifySession(cookies[COOKIE_NAME], sessionSecret)) {
    return json(res, 401, { error: "Authentication required." });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: "Voice runtime is not configured." });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error("xAI client secret request failed", response.status, await response.text());
      return json(res, 502, { error: "Unable to start the voice session." });
    }

    const clientSecret = await response.json();
    const url = new URL("wss://api.x.ai/v1/realtime");
    url.searchParams.set("agent_id", CREDITOJUS_AGENT_ID);

    const reasoningEffort = process.env.XAI_REASONING_EFFORT;
    if (reasoningEffort === "none" || reasoningEffort === "high") {
      url.searchParams.set("reasoning.effort", reasoningEffort);
    }

    return json(res, 200, {
      token: clientSecret.value,
      expiresAt: clientSecret.expires_at,
      wsUrl: url.toString(),
      runtime: "credito-jus",
    });
  } catch (error) {
    console.error("xAI client secret request error", error);
    return json(res, 502, { error: "Unable to start the voice session." });
  }
}
