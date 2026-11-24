# Phase 1.5B — Crypto SDK compatibility spike

**Status:** No-go for production integration in the current Capacitor architecture  
**Assessment date:** 2026-11-24  
**Repository:** `joy11122/binary-chat`  
**Candidate evaluated:** `@open-e2ee/signal-protocol-sdk@14.7.0`

## Executive result

The candidate has a documented browser adapter and native adapters for Expo and bare React Native. Its published runtime matrix does **not** list Capacitor. Binary Chat uses Capacitor 7 with a hosted Next.js app inside Android/iOS WebViews. A browser store may work in a WebView, but it does not provide Android Keystore/iOS Keychain custody for the database key. The SDK documentation explicitly states that browser-origin JavaScript can access the stored records and their key, and that the browser has no equivalent of iOS Keychain.

Therefore:
- **Do not add the SDK to production dependencies.**
- **Do not create device identities or store production key material yet.**
- **Do not change the current message API, database schema, or Ably events.**
- **Do not describe Binary Chat as E2EE.**
- Keep the candidate for a limited browser-only sandbox experiment, not as the approved Android/iOS architecture.

This is a deliberate security stop, not a completed encryption implementation.

## Evidence reviewed

1. npm package listing identifies version 14.7.0 as the current latest version on the assessment date and describes the package as supporting Expo, React Native, browser, and Node. Capacitor is not named in that runtime list.
2. The SDK runtime support matrix lists Expo development/release builds, bare React Native, browser and Node adapters. It does not list Capacitor or Capacitor WebView as a supported runtime.
3. The browser guide documents an OPFS/SQLite/WASM store and an IndexedDB fallback. It states that scripts on the same origin can access stored records and their key. It also says the browser has no equivalent of iOS Keychain.
4. The Expo path uses Expo SQLite/SQLCipher and Expo SecureStore. The bare React Native path uses SQLCipher and a native keychain vault. These are not drop-in Capacitor integrations.
5. The SDK's security policy states that no independent firm has audited it and it is not FIPS 140 validated. It also states that it is not wire-compatible with Signal Messenger or libsignal.
6. The package was published recently and the public GitHub repository has a very small public adoption footprint at assessment time. Popularity is not a security measure, but the project maturity and external assurance gap increase the need for independent review.

## Compatibility matrix

| Runtime / requirement | Published position | Binary Chat result |
|---|---|---|
| Desktop browser | Browser store documented; Web Crypto + OPFS or IndexedDB | Candidate for isolated browser experiment only |
| Android Capacitor WebView | Capacitor not listed; browser APIs may be present but native key custody is not provided by browser store | Not validated; no-go for production |
| iOS Capacitor WKWebView | Capacitor not listed; OPFS support and lifecycle behavior need device verification | Not validated; no-go for production |
| Android Keystore-backed database key | SDK documents a native React Native vault, not a Capacitor adapter | Requires a reviewed custom native plugin and adapter |
| iOS Keychain-backed database key | SDK documents Expo SecureStore / React Native keychain paths, not Capacitor | Requires a reviewed custom native plugin and adapter |
| Hosted Next.js WebView | Same-origin JavaScript can access browser-store records and key | XSS/CSP/supply-chain threat remains; not an OS secure enclave |

## Required next technical experiment

Before any production SDK decision, create a separate throwaway compatibility app (not the production Binary Chat message path) and demonstrate:

1. Exact SDK version pinned with lockfile integrity and a recorded package tarball checksum.
2. Two independent identities establish a session and exchange an authenticated encrypted message.
3. Ciphertext is the only payload emitted by the test relay; tampering, truncation, replay and wrong-recipient cases fail closed.
4. Browser test passes in current Chromium and WebKit.
5. Android physical-device test runs inside the actual Capacitor WebView on supported Android System WebView versions.
6. iOS physical-device test runs inside WKWebView on a supported iOS version.
7. App restart, device reboot, app update, OS update, backup/restore, reinstall and data-clear behavior are recorded.
8. A Capacitor native plugin stores a random wrapping key in Android Keystore / iOS Keychain; key invalidation, biometric/device-lock behavior, uninstall semantics and restore behavior are tested.
9. The SDK's exported storage adapter conformance suite passes against the proposed adapter.
10. Two tabs / two app processes cannot concurrently mutate a ratchet session without serialization.
11. CSP and XSS protections are deployed and tested; no third-party script can execute in the trusted chat origin.
12. Independent cryptographic review is commissioned before real user data is enabled.

## Architecture options

### Option A — Stay with Capacitor

Build and maintain a narrow Capacitor plugin exposing only key wrapping/unwrapping backed by Android Keystore and iOS Keychain. Implement a custom SDK storage adapter against the documented conformance suite. This is not approved until physical-device tests and independent review pass. The WebView still has an XSS risk: native key custody reduces at-rest exposure but does not stop malicious same-origin JavaScript from asking the app to use keys.

### Option B — Move cryptography into native modules

Use platform-native crypto/storage bridges with a reviewed protocol implementation, keeping Next.js as the UI and server transport layer. This is a larger architecture change and needs a separate decision; do not improvise a bridge around an unsupported SDK runtime.

### Option C — Browser-only E2EE

Could be evaluated as a separate product mode, but it does not meet Binary Chat's Android/iOS secure-key-custody requirement and must not be presented as equivalent to native E2EE.

## Go / no-go decision

- [x] Reviewed latest package metadata and official runtime support documentation.
- [x] Confirmed Capacitor is not a documented runtime target.
- [x] Identified the browser key-custody limitation.
- [x] Kept the candidate out of production dependencies.
- [ ] Browser sandbox interoperability tests executed.
- [ ] Android Capacitor physical-device tests executed.
- [ ] iOS Capacitor physical-device tests executed.
- [ ] Native secure-key plugin and adapter conformance validated.
- [ ] Independent cryptographic review completed.

**Decision:** No-go for production SDK integration until the unchecked gates above are satisfied. The next safe work item is a dedicated Capacitor secure-storage plugin feasibility spike and device test harness, not message encryption rollout.

## Sources

- npm package and version history: https://www.npmjs.com/package/@open-e2ee/signal-protocol-sdk
- SDK quickstart: https://docs.open-e2ee.dev/start/quickstart
- Runtime support matrix: https://docs.open-e2ee.dev/reference/runtime-support
- Browser storage and threat model: https://docs.open-e2ee.dev/start/browser
- Security and protocol policy: https://docs.open-e2ee.dev/reference/security-policy
- Public source repository: https://github.com/open-e2ee/signal-protocol-js
