# Phase 1.6A — E2EE protocol selection and native integration decision

**Status:** OpenMLS selected for a controlled implementation spike; production adoption is **not approved**  
**Assessment date:** 2026-11-24  
**Target app:** Next.js 15 + TypeScript + Capacitor 7 (Android/iOS)  
**Scope:** Protocol and integration choice only. No production cryptography or message-path changes.

## Executive decision

Select **OpenMLS 0.10.0** as the primary candidate for a time-boxed native integration spike.

This is a candidate selection, not a claim that Binary Chat is encrypted. Do not add OpenMLS to the production Next.js dependency graph, do not modify current message persistence, and do not enable E2EE for users in this phase.

Why OpenMLS:
- Implements the IETF Messaging Layer Security protocol (MLS), RFC 9420, which supports asynchronous end-to-end group key establishment for groups from two members to thousands. A one-to-one conversation can be represented as a two-member MLS group, while leaving a standards-based path for future group conversations.
- It is written in Rust and has a documented Android/iOS/WASM build path. Important qualification: the upstream support matrix classifies Android, iOS and WASM targets as **built but unsupported/not tested**. Binary Chat must supply its own physical-device and WebView validation.
- It is actively maintained by Phoenix R&D and Cryspen/CE Labs, has interoperability work with other MLS implementations, and has undergone an SRLabs security audit sponsored by the Sovereign Tech Agency.
- The current upstream changelog is for OpenMLS 0.10.0 (2026-11-23). It explicitly records fixes for several recent security advisories. Pin an exact release and its full transitive dependency graph during the spike; never float a version range.

## Candidate comparison

| Candidate | Strength | Binary Chat concern | Decision |
|---|---|---|---|
| OpenMLS 0.10.0 (Rust, MLS/RFC 9420) | Standards-based asynchronous group E2EE; Rust core; native and WASM compilation paths; documented independent audit | Upstream does not test Android/iOS/WASM targets; no official Capacitor plugin; native storage and FFI must be built and reviewed; one audit finding was still described as in progress in the May 2026 audit post | **Selected for isolated native spike only** |
| Signal libsignal | Mature protocol implementation used by official Signal clients; Java, Swift and TypeScript interfaces | Signal explicitly says use outside Signal is unsupported; API/bridge layers may change; this is not a supported drop-in Capacitor/WebView SDK | Do not select for this app without a separate supported-use agreement/architecture decision |
| AWS mls-rs | RFC 9420 implementation, WASM support, configurable storage and crypto providers, conformance/interoperability tests | No verified drop-in Capacitor bindings or independently reviewed Binary Chat native adapter; its own security notice says no full third-party audit | Retain as an interoperability/reference implementation, not the selected client core |
| Custom Double Ratchet / custom cryptography | None that outweigh the risk | Protocol, key schedule, nonce, state persistence, replay and lifecycle errors are unacceptable | Rejected |

## Exact version and security advisory policy

- Spike baseline: **OpenMLS 0.10.0**, released 2026-11-23. Do not use 0.9.0: later advisories affected it.
- The 0.10.0 changelog explicitly lists fixes for:
  - GHSA-gc79-23g3-8g52 — unbounded recursion in extension decoding (High).
  - GHSA-p276-g3f3-wwgh — rejected private messages advancing a sender ratchet (Low).
  - GHSA-94v4-rg25-x625 — removed leaves reappearing after a particular external commit (Moderate).
- The upstream advisory history also documents earlier fixes for quadratic extension duplicate detection, malformed byte-deserialization panic, and improper tag validation. The spike must run dependency/advisory scanning against the exact resolved Cargo.lock, not rely on the crate version alone.
- The SRLabs audit post (2026-05-27) reports eight findings, including one High; it says seven fixes had been merged and one Low issue was still being addressed at publication. The existence of an audit is not certification. Obtain and review the full report and verify the outstanding finding's current disposition before production approval.
- The OpenMLS release changelog, advisory pages, and audit status must be rechecked before every version pin/update.

## Chosen architecture: native-first protocol core

### Protocol and group model

- Use MLS 1.0 / RFC 9420 with a two-member group for each direct conversation.
- Start with the MLS mandatory-to-implement ciphersuite: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- Do not enable experimental post-quantum ciphersuites, draft extensions, virtual clients, targeted messages or other non-RFC features in the first spike.
- Treat the MLS group ID as an opaque random identifier. Do not derive it from phone numbers, user IDs or conversation IDs.
- Bind authenticated application context to the MLS operation using a versioned, canonical context/AAD design. The design must prevent cross-conversation and cross-account message substitution.
- Device identity and account identity are different: each registered device gets its own MLS leaf/credential. Phone OTP authenticates account access; it does not by itself prove a device's MLS identity to another user.

### Native integration boundary

- Build a small Rust crate that owns all OpenMLS calls and exposes a narrow API through UniFFI-generated Kotlin and Swift bindings.
- Wrap that native module in a local Capacitor plugin. JavaScript should receive only the operations and data it needs: create identity, publish public key package, join conversation, encrypt, decrypt, process commit, export public verification data, revoke/reset local device state.
- Do not expose raw long-lived private identity keys, ratchet secrets, group secrets, or storage-encryption keys to WebView JavaScript.
- Do not expose generic arbitrary key export methods. Do not log sensitive buffers. Zeroize temporary secret buffers where supported.
- The WebView remains an untrusted presentation/transport surface. Native key custody reduces at-rest extraction risk but cannot stop malicious same-origin JavaScript from asking the native bridge to decrypt messages or reading plaintext returned for display. Strong CSP, XSS prevention, dependency minimization, and a minimal bridge remain mandatory.

### Native state and key custody

- Implement a dedicated OpenMLS storage provider for encrypted persistent state. Evaluate SQLCipher-backed SQLite for MLS group state, key packages, ratchet state and metadata.
- Keep the SQLCipher database key outside the database and outside the WebView:
  - Android: non-exportable Android Keystore wrapping key; define backup exclusion and restore behavior.
  - iOS: Keychain item with explicit accessibility, device migration and uninstall/reinstall policy.
- Do not use the previously reviewed `capacitor-secure-storage-plugin` as a generic secret store. Its production use remains no-go pending exact source audit.
- Never fall back to localStorage, IndexedDB, cookies, ordinary SharedPreferences, UserDefaults, or plaintext SQLite for native secrets.
- A missing, invalidated or inaccessible key must produce a recoverable, explicit error. Never silently create a new identity and pretend old conversations are recoverable.
- Define account deletion, device revocation, logout, reinstall, backup/restore, lost-device and key-loss semantics before any production keys are created.

### Web / desktop policy

- OpenMLS can compile to WASM, but its documentation requires JavaScript APIs for secure randomness and current time. The upstream matrix currently marks WASM as built but unsupported/not tested.
- Do not enable browser E2EE in the first native pilot. Browser clients must fail closed for E2EE operations until a separate WASM, WebCrypto, browser-storage, multi-tab locking, CSP/XSS and recovery assessment passes.
- Do not downgrade an E2EE conversation to the existing plaintext API when native crypto is unavailable. Show an explicit unsupported-device/upgrade state instead.
- A conversation must have one explicit encryption mode/version; mixed plaintext/ciphertext fallback is forbidden.

## Server and Ably changes required in a later phase

The server currently participates in the existing plaintext messaging flow. That flow is not E2EE and must not be relabeled.

Before E2EE rollout, a later migration must:
1. Add versioned ciphertext envelopes and public device/key-package records.
2. Publish only public identity/key-package material; private keys and private ratchet/group state never leave devices.
3. Make one-time key-package reservation/consumption atomic and authenticated.
4. Authorize conversation membership and persist opaque ciphertext only.
5. Relay ciphertext over Ably; never decrypt on API routes, workers, logs or database hooks.
6. Enforce envelope size limits, schema/version checks, rate limits, idempotency and replay protections.
7. Design key-package replenishment, identity changes, device revocation, group membership changes and recovery.
8. Treat participant IDs, timestamps, IP addresses, delivery events and traffic volume as metadata that E2EE does not hide.

## Phase 1.6B spike acceptance gates

No production rollout until all gates pass:

- [ ] Pin OpenMLS 0.10.0 and every transitive Rust dependency; commit Cargo.lock and artifact hashes.
- [ ] Inspect licenses, maintenance/security policies, advisories and the full SRLabs report; record outstanding finding disposition.
- [ ] Build a minimal Rust wrapper using only stable RFC 9420 features and the selected ciphersuite.
- [ ] Generate Kotlin/Swift bindings with UniFFI and call them through a local Capacitor plugin.
- [ ] Verify two independent physical Android devices can create/join a two-member group and exchange authenticated ciphertext.
- [ ] Verify two physical iOS devices can do the same.
- [ ] Verify Android-to-iOS interoperability.
- [ ] Verify tampered, truncated, malformed, replayed, wrong-group, wrong-sender and stale-epoch messages fail closed.
- [ ] Verify device removal/revocation and key rotation prevent a removed device from decrypting future epochs.
- [ ] Verify app restart, process death, reboot, lock/unlock, app update, OS update, backup/restore, uninstall/reinstall and account deletion.
- [ ] Verify storage database/key separation, Keystore/Keychain lifecycle and backup exclusions.
- [ ] Verify the browser has no native-key fallback and cannot silently send plaintext for an E2EE conversation.
- [ ] Add CI jobs for Rust unit tests, OpenMLS interop vectors, Kotlin/Swift wrapper tests, Android debug builds and iOS Simulator builds.
- [ ] Commission independent review of the Binary Chat wrapper, storage provider, FFI surface, message envelope and lifecycle logic.
- [ ] Run a two-account/two-device end-to-end test before feature-flag rollout.

## Explicit non-goals

- No cryptographic implementation written by Binary Chat.
- No OpenMLS or UniFFI dependency added to the production Next.js app in Phase 1.6A.
- No changes to current message APIs, MongoDB schema or Ably events.
- No migration of existing plaintext conversations.
- No E2EE badge or marketing claim.
- No claim of Signal Messenger interoperability.

## Sources

- IETF RFC 9420: https://www.rfc-editor.org/rfc/rfc9420.html
- OpenMLS repository and platform matrix: https://github.com/openmls/openmls
- OpenMLS 0.10.0 changelog: https://github.com/openmls/openmls/blob/main/CHANGELOG.md
- OpenMLS WebAssembly guide: https://book.openmls.tech/user_manual/wasm.html
- OpenMLS security advisories: https://github.com/openmls/openmls/security/advisories
- OpenMLS / SRLabs independent audit summary: https://blog.phnx.im/openmls-independent-security-audit/
- Signal libsignal support statement: https://github.com/signalapp/libsignal
- AWS mls-rs: https://github.com/awslabs/mls-rs
- Mozilla UniFFI: https://github.com/mozilla/uniffi-rs
- Capacitor native plugin model: https://capacitorjs.com/docs/plugins

**Final decision:** OpenMLS 0.10.0 is the selected protocol candidate for Phase 1.6B native prototyping only. Production E2EE remains blocked on physical-device interoperability, secure storage, lifecycle, independent review and server ciphertext migration gates.
