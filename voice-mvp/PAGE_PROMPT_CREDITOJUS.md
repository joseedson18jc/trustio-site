# Prompt — Crédito Jus Private Voice Sales Demo

Create a production-ready private web page for **Crédito Jus × Trustio** that immediately runs the dedicated Crédito Jus xAI Voice Agent after authenticated access.

## Non-negotiable agent binding

This page is for **Crédito Jus only**.

Use this saved xAI Voice Agent ID exclusively for this deployment:

`agent_XrzC3PUBPY9m5pEs`

Do not reuse this agent ID for any other Trustio customer, demo, tenant, route, template, environment, or white-label deployment. Do not offer an agent selector in the UI. The backend route for this page must resolve only to the Crédito Jus agent.

The xAI API key must remain server-side. Never expose `XAI_API_KEY` in HTML, JavaScript bundles, localStorage, logs, or network responses. Use a short-lived xAI Realtime client secret for the browser connection.

## Page URL

Primary route:

`/credito-jus`

Recommended production hostname:

`https://voice.trustio.com.br/credito-jus`

The root route may redirect to `/credito-jus` while this deployment remains dedicated to Crédito Jus.

## Purpose

This is a private commercial demonstration for prospects evaluating Crédito Jus sales automation. It must support realistic B2C consumer-credit conversations and B2B partnership conversations while preserving the behavior, tools, voice, knowledge, and instructions already configured in the saved xAI Voice Agent.

Do not recreate the agent prompt in the frontend. Connect to the saved agent by `agent_id`.

## Experience

Build a premium, dark, mobile-first interface inspired by high-end realtime AI voice products, but do not copy proprietary xAI artwork or assets.

Branding:

- Crédito Jus × Trustio
- Private Voice AI Experience
- Voice Sales Agent · Crédito Jus
- Minimal, executive, premium visual language
- Dark graphite/black background
- Trustio blue accents
- Excellent Safari/iPhone behavior

The page should have:

1. Private access screen with code authentication.
2. Main voice interaction screen.
3. Premium animated voice orb centered on the page.
4. B2C and B2B scenario shortcuts.
5. Start/pause microphone control.
6. End-session control.
7. Live transcript.
8. Optional text input.
9. 10-minute demo timer.
10. Clear privacy notice telling testers not to use real CPF, banking, or sensitive personal data.

## Premium orb behavior

Create the orb entirely with local HTML/CSS/Canvas/WebGL primitives. No remote image asset is required.

The orb should look like a translucent cosmic glass sphere with:

- deep black/graphite interior
- blue and violet nebula-like light
- subtle cyan chromatic edge
- internal star-like particles
- glass highlight/refraction
- soft volumetric aura
- multiple extremely subtle orbital rings
- smooth high-frame-rate animation

It must have clearly different realtime states:

### Idle
Slow breathing and almost imperceptible internal motion.

### Connecting
Slightly brighter blue aura and faster orbital motion.

### Listening
React to microphone amplitude. The orb should breathe and expand by a small amount based on the actual input volume. Keep the effect elegant, not cartoonish.

### Thinking
This is the visual centerpiece. When the user finishes speaking and before the first agent audio frame arrives:

- intensify the inner blue/violet plasma
- accelerate internal nebula motion
- accelerate rings at different speeds
- brighten small star particles
- create a soft central thought pulse
- increase the aura radius
- preserve a smooth, premium glass-sphere appearance

The transition into Thinking must happen immediately on the realtime `input_audio_buffer.speech_stopped` event.

Keep the orb in Thinking through `response.created` and until either the first `response.output_audio_transcript.delta` or first returned audio frame is received.

### Speaking
As soon as the first audio frame arrives, switch from Thinking to Speaking. Use a rhythmic but subtle pulse and flowing internal light. Do not wait for the full answer.

### Interruption
When `input_audio_buffer.speech_started` is received while the agent is speaking, immediately stop local playback, switch to Listening, and allow server VAD/barge-in to continue naturally.

## Latency requirements

Optimize primarily for lowest perceived voice latency.

Architecture:

`browser → xAI Realtime WebSocket`

Do not proxy the continuous audio stream through the application server.

The server is used only for authentication and issuance of short-lived xAI client secrets.

Required optimizations:

- prefetch the ephemeral xAI credential immediately after private login
- request microphone permission and initialize the realtime socket in parallel after the user taps Start
- use an `AudioContext` with `latencyHint: "interactive"`
- capture with `AudioWorklet`, not deprecated ScriptProcessorNode
- mono PCM16 at 24 kHz
- use small ~50 ms microphone frames
- prefer binary WebSocket audio transport where supported
- begin audio playback on the first returned frame
- schedule PCM chunks continuously to avoid gaps
- avoid waiting for transcript completion before playing speech
- stop playback immediately on barge-in
- keep frontend dependencies near zero
- keep the critical audio path free of analytics, database calls, and UI blocking work

For Brazil, host token/auth serverless functions close to the tester when possible, but remember that this server is not in the continuous audio hot path.

## Realtime state mapping

Use xAI realtime events approximately as follows:

- socket open → Listening/Ready
- `input_audio_buffer.speech_started` → Listening
- `input_audio_buffer.speech_stopped` → Thinking
- `response.created` → Thinking
- first response audio frame → Speaking
- `response.output_audio_transcript.delta` → Speaking
- `response.done` → Listening/Ready
- socket close/error → Idle/Error

## Privacy and security

- private code access
- signed HttpOnly Secure SameSite=Strict cookie
- `noindex`, `nofollow`, `noarchive`, `nosnippet`
- no audio persistence
- no transcript persistence in MVP
- no API key in frontend
- strict CSP allowing only the app origin plus xAI API/WebSocket endpoints
- microphone permission only for self
- `Cache-Control: private, no-store`
- session UI timeout of 10 minutes

## Initial scenario shortcuts

B2C:

`Sou consumidor e quero entender quais opções de crédito vocês oferecem e como funciona o processo.`

B2B:

`Represento uma empresa interessada em parceria comercial com a Crédito Jus. Como funcionaria uma parceria B2B?`

These shortcuts should populate or send a realistic opening message without altering the saved agent configuration.

## Definition of done

The page is successful when a prospect can open the private URL on iPhone Safari or desktop Chrome, authenticate, tap one button, grant microphone permission, speak naturally, see the orb instantly enter Listening and Thinking states, hear the Crédito Jus agent begin speaking with minimal perceived delay, interrupt it naturally, and continue a realtime sales conversation without the page ever exposing the xAI API key or using another customer's agent.
