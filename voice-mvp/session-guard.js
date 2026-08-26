// Lifecycle guard for the standalone Crédito Jus demo.
// It prevents pending mic/WebSocket/session startup from reviving resources
// after the user presses End or Logout while startup is still in flight.

let sessionGeneration = 0;

const bumpGeneration = () => {
  sessionGeneration += 1;
};

const endButton = document.querySelector("#end-button");
const logoutButton = document.querySelector("#logout-button");

// Capture phase runs before app.js click handlers call endSession().
endButton?.addEventListener("click", bumpGeneration, { capture: true });
logoutButton?.addEventListener("click", bumpGeneration, { capture: true });
window.addEventListener("beforeunload", bumpGeneration, { capture: true });

// If microphone permission resolves after the session was invalidated,
// immediately stop the returned tracks before app.js can attach them.
if (navigator.mediaDevices?.getUserMedia) {
  const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = (...args) => {
    const generationAtRequest = sessionGeneration;

    return nativeGetUserMedia(...args).then((stream) => {
      if (generationAtRequest !== sessionGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("Voice session was ended during microphone startup.", "AbortError");
      }
      return stream;
    });
  };
}

// Prevent an old /api/session response from becoming the credential used by
// a session that has already been ended/logged out.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const [input] = args;
  const requestUrl = typeof input === "string" ? input : input?.url || "";
  const guardsVoiceSession = requestUrl === "/api/session" || requestUrl.endsWith("/api/session");

  if (!guardsVoiceSession) return nativeFetch(...args);

  const generationAtRequest = sessionGeneration;
  const response = await nativeFetch(...args);

  if (generationAtRequest === sessionGeneration) return response;

  return new Response(JSON.stringify({ error: "Sessão encerrada antes da conexão ser concluída." }), {
    status: 409,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

// Wrap WebSocket event delivery. A socket created for an old generation is
// closed and its late open/message/close/error callbacks are not delivered to
// app.js after End/Logout invalidates that generation.
const NativeWebSocket = window.WebSocket;

class GuardedWebSocket extends NativeWebSocket {
  constructor(...args) {
    super(...args);
    this.__creditoJusGeneration = sessionGeneration;
  }

  addEventListener(type, listener, options) {
    if (typeof listener !== "function") {
      return super.addEventListener(type, listener, options);
    }

    const generationAtSocketCreation = this.__creditoJusGeneration;
    const guardedTypes = new Set(["open", "message", "close", "error"]);

    if (!guardedTypes.has(type)) {
      return super.addEventListener(type, listener, options);
    }

    const guardedListener = (event) => {
      if (generationAtSocketCreation !== sessionGeneration) {
        if (type === "open") {
          try { this.close(1000, "Stale voice session"); } catch {}
        }
        return;
      }
      listener.call(this, event);
    };

    return super.addEventListener(type, guardedListener, options);
  }
}

window.WebSocket = GuardedWebSocket;
