# Phase 1.5A — E2EE architecture and library assessment

**Status:** Architecture approved for an implementation spike; production cryptography selection is **not yet approved**  
**Date:** 2026-11-24  
**Scope:** Next.js 15 + TypeScript + Capacitor 7 (Android and iOS), plus desktop web

## Executive decision

1. Do not write cryptographic primitives or a ratchet implementation in Binary Chat.
2. Do not install a cryptography SDK or change message persistence in this phase.
3. Use a maintained, established protocol implementation behind a narrow client-side adapter. The server must never receive plaintext or private identity/session keys.
4. Treat `@open-e2ee/signal-protocol-sdk` 14.7.x as a **candidate for a time-boxed compatibility spike only**, not as an approved production dependency. Its own security documentation says it has not been audited by an independent firm, is not FIPS 140 validated, and is not wire-compatible with Signal Messenger or libsignal. It deliberately diverges in some encodings/profile details. These are material product/security constraints.
5. Keep the current plaintext messaging path explicitly marked as **not E2EE** until a later phase replaces it end-to-end and all acceptance gates pass.

## Library assessment

| Candidate | Advantages | Blocking concerns | Decision |
|---|---|---|---|
| Signal `libsignal` | Used by official Signal clients; Rust implementation with Java, Swift and TypeScript interfaces | Signal says use outside Signal is unsupported; current Node addon is not a browser/Capacitor WebView solution. A supported native bridge and web strategy would be separate engineering work | Do not integrate directly in the current web client |
| `@open-e2ee/signal-protocol-sdk` 14.7.x | Pure TypeScript; documented browser storage; WebView evidence for Tauri Android WebView and iOS simulators; includes sessions, ratchets, trust and safety-number flows | No independent audit; not interoperable with Signal/libsignal; its Tauri evidence is not Capacitor physical-device validation; browser same-origin script can access local key material; SDK's published assurance is not a substitute for independent review | Candidate only; run compatibility, threat-model and independent-review gates before production |
| Custom crypto / ad-hoc Double Ratchet | None that justify the risk | High probability of protocol, state, nonce, key lifecycle and downgrade mistakes | Rejected |

Sources reviewed:
- Signal libsignal README: https://github.com/signalapp/libsignal
- OpenE2EE SDK: https://github.com/open-e2ee/signal-protocol-js
- Runtime support: https://docs.open-e2ee.dev/reference/runtime-support
- Browser storage threat model: https://docs.open-e2ee.dev/start/browser
- Security/protocol policy: https://docs.open-e2ee.dev/reference/security-policy

## Trust and compatibility constraints

- Binary Chat is not intended to interoperate with Signal Messenger. If that product requirement changes, the OpenE2EE candidate is not suitable because its identity format, message encoding and safety numbers do not interoperate with Signal/libsignal.
- First contact must be visibly **unverified** until users compare a safety number or another authenticated verification method. TOFU alone does not authenticate the first contact.
- Identity key changes must fail closed and require an explicit user decision. Never silently trust a replacement key.
- Never claim an independent security audit, FIPS validation, or Signal Messenger interoperability for the candidate SDK.
- Binary encoding remains a presentation format only. It is not encryption.

## Target architecture

### Client trust boundary

- Encryption and decryption run only on the sender's and recipient's devices.
- Device identity private keys, signed-prekey private keys, one-time-prekey private keys, session/ratchet state, and trust decisions remain in device-local storage.
- Encrypt the UTF-8 message before it enters fetch/API/Ably. The binary display is derived locally from the decrypted plaintext.
- The five-second reveal timer remains a UI-only behavior. It must never alter or persist cryptographic state.
- Do not place plaintext, private keys, session state, or safety-number secrets in React state longer than needed, browser logs, analytics, crash reports, URL parameters, or server actions.

### Server and transport boundary

- MongoDB stores only opaque ciphertext envelopes plus the minimum routing/delivery metadata required by the app.
- Ably carries opaque ciphertext envelopes and non-sensitive event identifiers only.
- Server APIs authenticate the user, authorize conversation membership, enforce size/rate limits, persist ciphertext, and publish ciphertext. They must not import the crypto SDK or decrypt messages.
- Public identity bundles and prekeys may be published by authenticated devices. One-time prekey reservation/consumption must be atomic and authenticated.
- Do not log message bodies, ciphertext payloads, prekey private material, authorization tokens, or session secrets.
- Routing metadata (participants, timestamps, IP/network data and message volume) remains visible to infrastructure; E2EE does not hide it.

### Device storage strategy

**Web:** use a documented SDK browser store only after a CSP/XSS review. IndexedDB or OPFS-backed encrypted storage is not a secure enclave; same-origin JavaScript can access the app's stored data/key. Enforce a restrictive response-header CSP, remove unnecessary third-party scripts, pin/review dependencies, and prevent concurrent tabs from mutating one ratchet store (single active client/leader strategy).

**Capacit​or Android/iOS:** do not assume browser storage documentation proves secure native key custody. The candidate SDK has Tauri WebView test evidence, not a published Capacitor physical-device certification. The spike must test Android System WebView and iOS WKWebView on physical devices, app restart, OS upgrade, backup/restore, reinstall, biometric/device-lock conditions, and data clearing. Prefer a custom SDK storage adapter backed by encrypted SQLite with a wrapping key held in Android Keystore / iOS Keychain through a reviewed Capacitor native plugin. Validate the SDK's complete storage adapter conformance suite. Never store a raw long-lived wrapping key in localStorage or ordinary preferences.

If robust native key custody cannot be achieved while retaining the current hosted Next.js WebView architecture, pause native E2EE release and revisit a native crypto bridge rather than weakening key storage silently.

## Migration sequence (future phases)

1. **1.5B — Compatibility spike:** pin an exact SDK version; install only on a feature branch; prove a two-device encrypt/decrypt round trip in browser, Android WebView and iOS WKWebView; test persistence across restart; run adapter conformance; record limitations. No production rollout.
2. **1.5C — Device identity and prekeys:** device registration, identity bundle publication, signed/one-time prekeys, atomic one-time-prekey consumption, device revocation and key rotation.
3. **1.5D — Ciphertext transport:** versioned envelope schema; encrypt before API submission; ciphertext-only MongoDB and Ably; idempotency/replay handling; fail closed for unknown versions and invalid authentication tags.
4. **1.5E — Trust UX:** safety-number comparison, verified/unverified labels, identity-change warnings, explicit trust reset and recovery policy.
5. **1.5F — Multi-device/recovery:** link/revoke devices, per-device sessions, encrypted backup/recovery design, and key-loss UX.
6. **Security release gate:** independent cryptographic review, threat-model review, physical-device testing, dependency/supply-chain review, incident response plan, and successful end-to-end tests before any E2EE claim.

## Non-goals for Phase 1.5A

- No SDK dependency added.
- No changes to existing plaintext message APIs or MongoDB schema.
- No claim that current conversations are encrypted.
- No change to OTP, session authentication, or Ably configuration.

## Acceptance criteria

- [x] Compare official libsignal and a browser-capable TypeScript candidate.
- [x] Document protocol compatibility, audit status, runtime and key-custody limitations.
- [x] Define server/client trust boundaries and migration gates.
- [ ] Physical Capacitor Android/iOS compatibility demonstrated.
- [ ] Independent security review completed.
- [ ] E2EE message flow implemented and verified (future phases).
