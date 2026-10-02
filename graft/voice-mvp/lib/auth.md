# voice-mvp/lib/auth.js

- digest · function · L7-L9 — function digest(value)
- safeEqual · function · L11-L13 — function safeEqual(left, right)
- resolveSessionSecret · function · L15-L30 — function resolveSessionSecret(env = process.env)
- sign · function · L32-L34 — function sign(payload, secret)
- createSession · function · L36-L40 — function createSession(secret)
- verifySession · function · L42-L53 — function verifySession(token, secret)
- readCookies · function · L55-L68 — function readCookies(header = "")
- sessionCookie · function · L70-L72 — function sessionCookie(value)
- clearSessionCookie · function · L74-L76 — function clearSessionCookie()
