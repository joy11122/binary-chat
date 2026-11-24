# Phase 1.7A — Native MLS runtime integration contract

**Status:** Design and implementation contract; no runtime enablement approved  
**Date:** 2026-11-24  
**Target:** Capacitor 7 Android/iOS with Rust + UniFFI + native plugin  
**Current protocol spike:** OpenMLS 0.9.2 (test-only dependency)

## 1. Current product truth

The existing chat transport is still plaintext-capable and Binary Chat is **not E2EE**. Binary encoding is a presentation transform, not cryptography. The native bridge continues to return available=false on every platform. This phase defines the contract for a future isolated native MLS runtime; it does not change the production message path, enable encryption, or authorize an E2EE product claim.

The main-branch CI run for merge commit d407b7857eab4b328998652690adbbf369165f73 must pass all four jobs before any follow-on PR is merged. The iOS Simulator job was still queued when this document was started.

## 2. Non-negotiable trust boundaries

1. Rust owns OpenMLS protocol state, credentials, private keys, epoch secrets, replay state, and persistence transactions.
2. Kotlin/Swift own platform key-store integration and lifecycle signals. They must not implement MLS or expose key bytes to JavaScript.
3. The Capacitor WebView is an untrusted presentation/transport client. It may receive plaintext that the user is actively viewing, but never raw MLS secrets, serialized private group state, database keys, or generic secret-store access.
4. Next.js APIs, MongoDB, and Ably receive only versioned opaque ciphertext envelopes for an E2EE-enabled conversation. They must not import OpenMLS or decrypt content.
5. Web/desktop web remains unsupported for E2EE in this release line. It must fail closed, not downgrade to plaintext.
6. A native bridge error, storage failure, unknown envelope version, membership failure, replay, or authentication failure must never trigger plaintext fallback.

## 3. Runtime layering

- Chat UI (WebView): typed Capacitor calls; short-lived display plaintext only.
- Capacitor E2EE plugin (Kotlin/Swift): narrow UniFFI API; no key or serialized state exposure.
- Rust Binary Chat security service: OpenMLS protocol, authorization context, transaction coordinator.
- Encrypted local state adapter: SQLCipher candidate and platform-wrapped per-install DB key; not yet implemented.
- Android Keystore / iOS Keychain: wrapping-key custody.

Network boundary: Rust encrypts, UI/API submits opaque envelope, MongoDB/Ably relay it; incoming envelope is verified/decrypted by native Rust before display.

The SQLCipher implementation and exact platform key-wrapping artifacts remain blocked on the review gates in secure-native-storage-design.md. Until then, only in-memory protocol tests are permitted.

## 4. Proposed typed operations (not implemented)

The eventual API should be use-case-oriented. Names below are illustrative contracts, not an approved ABI.

| Operation | Input visible to JS | Output visible to JS | Must remain native |
|---|---|---|---|
| getCapabilities | none | supported/unsupported + stable reason | Runtime gate decision |
| initializeDevice | authenticated account scope + server-issued device enrollment proof | opaque local device reference + public registration bundle | Identity private key and credential storage |
| createKeyPackage | none | public key package bytes + expiry metadata | Private init key and package state |
| processWelcome | opaque Welcome envelope | opaque conversation reference + status | Group state and secrets |
| createGroup | opaque conversation reference + authenticated member key packages | opaque group reference + public commit/envelope | Group secrets and membership state |
| addMember / removeMember | opaque group reference + validated public credential/package | public commit envelope + status | Membership/epoch transition |
| encryptMessage | opaque group reference + UTF-8 message bytes | versioned ciphertext envelope | Encryption keys, nonce/ratchet and MLS state |
| processIncoming | versioned ciphertext envelope | delivery status + ephemeral plaintext for immediate display, if authenticated | Authentication, replay check, decryption, state transition |
| deleteLocalDevice | opaque local device reference + explicit confirmation | complete/partial deletion status | Key deletion and encrypted database cleanup |

Do not expose generic getSecret/setSecret, arbitrary SQL, file paths, or generic storage methods; raw database keys, private keys, MLS exporter/epoch secrets, serialized MLS group state, or internal storage blobs; methods accepting a caller-selected account ID without binding it to authenticated session/device context; or an API that silently initializes a new identity when an existing store is corrupt or its wrapping key is unavailable.

All methods need strict input byte/size limits, typed stable error codes, account/device namespace checks, and serialization of state-mutating operations. Avoid logging arguments or native exception details.

## 5. Envelope and transport contract

The application envelope must be versioned and unambiguously distinguish MLS protocol messages from authenticated application messages. The final binary schema is deferred until server migration design.

Required invariants:
- Ciphertext is produced before any API request, analytics event, logging hook, or Ably publish.
- The envelope carries only protocol/version and routing fields strictly required for delivery. Do not include plaintext previews, sender names, phone numbers, or private MLS state.
- Unknown versions and malformed/oversized payloads are rejected. Never parse them as plaintext.
- Server membership authorization is checked independently of MLS cryptographic membership.
- Message IDs/idempotency keys are separate from MLS replay protection; both are required.
- Commits and application messages are processed in protocol order. Concurrent writes for one group are serialized by the native state owner.
- Ably is a best-effort relay, not the source of cryptographic truth. Persist first, then publish; clients fetch missed envelopes after reconnect.
- MongoDB and Ably logs must not record message bodies, plaintext, private state, access tokens, or secret-bearing exception text.
- Metadata (participants, routing, timestamps, IP/network data, message frequency and size) remains visible to the service.

## 6. Device and account binding

- A device identity is distinct from a phone-number account. OTP proves account login, not possession of an existing MLS private key.
- Device enrollment must be authenticated by the current account session and a server-issued challenge; the private key is generated and retained on the device.
- Each registered device has a revocable server-side device record and a public credential/key-package lifecycle.
- Account logout must not silently erase or export MLS identity state. Define whether local data remains locked for the same account or is removed after explicit device sign-out.
- Account deletion and device revocation must coordinate server revocation with local key/database deletion and report partial failure honestly.
- Phone-number reassignment, SIM swap, OTP takeover, and session theft are account-authentication threats; MLS does not solve them.
- Multi-device support is not assumed. A second device must be enrolled as a distinct cryptographic participant, not by copying private keys from the first device.

## 7. State machine and fail-closed behavior

Expected states: unsupported -> unavailable (default on web and all unimplemented native builds) -> enrollment_required -> store_locked -> ready; failures transition to recovery_required, revoked, deleting, or deleted as appropriate.

Rules:
- The only default state today is unavailable.
- ready is permitted only after native platform, store integrity, account/device binding, and protocol initialization are validated.
- Storage/key errors transition to recovery_required; never auto-create a replacement identity over an existing namespace.
- Unknown protocol/envelope versions, invalid tags, replayed messages, invalid membership, and stale commits return typed rejection results.
- If an E2EE conversation cannot be processed, block send and display a clear recovery/unsupported message. Never transparently send plaintext.
- A server/API/Ably outage must not cause local plaintext mode for an E2EE conversation.
- Server feature flags cannot force a client to claim E2EE when local native checks fail.

## 8. Test contract before enabling any operation

### Protocol tests
- Two independent devices: create group, join by Welcome, exchange application messages both directions.
- Add/remove members and validate epoch transitions.
- Reject tampered ciphertext, replayed application messages, stale/invalid commits, unrelated group messages, and invalid credentials.
- Verify a removed member cannot decrypt messages from the new epoch.
- Validate concurrent send/receive serialization and crash recovery around commit persistence.

### Persistence and lifecycle tests
- Persist state, close process, reopen, and continue the same group without re-enrollment.
- Wrong/missing/invalidated wrapping key returns recovery-required; it must not create a fresh identity silently.
- Interrupted transaction, WAL recovery, corrupt database, schema migration rollback, storage-full, and concurrent initialization.
- Android: supported API levels/ABIs, Keystore hardware metadata, lock/reboot, backup/restore, app data clear, uninstall/reinstall.
- iOS: locked/first-unlock behavior, passcode changes, Keychain accessibility, backup/restore, app offload, uninstall/reinstall and stale-key cleanup.
- Account switch, logout, device revocation, account deletion, and partial local deletion.

### Boundary/privacy tests
- Web reports unsupported and cannot invoke native E2EE methods.
- No secret or serialized MLS state crosses UniFFI/Capacitor.
- No plaintext, key material, or tokens in logs, crash reports, analytics, URLs, localStorage, IndexedDB, ordinary preferences, or backups.
- Server stores and relays opaque ciphertext only for E2EE-enabled conversations.
- A forced bridge exception or disabled plugin never enables plaintext fallback.
- Physical Android and iOS devices are required; simulator/APK compilation alone is insufficient.

## 9. Implementation sequence

1. 1.7A (this contract): freeze native API boundary, state machine, transport invariants, and test gates.
2. 1.7B — Storage artifact gate: pin and audit exact SQLCipher artifacts, platform integration, licensing, ABI/build provenance and key-wrapping design. No production storage until approved.
3. 1.7C — Native persistent store: implement transactional encrypted storage, key wrapping and lifecycle behavior in an isolated native branch; run physical-device tests.
4. 1.7D — Rust MLS runtime: promote OpenMLS from dev-dependency only after exact version/API review; implement stateful protocol operations behind native tests.
5. 1.7E — UniFFI and Capacitor bindings: generate and compile Kotlin/Swift bindings; expose only typed high-level operations; keep capability disabled.
6. 1.7F — Ciphertext server migration: versioned ciphertext envelopes, membership/device authorization, Mongo persistence and Ably relay, replay/idempotency handling.
7. 1.7G — Client integration and internal pilot: feature-gated native E2EE UI, device lifecycle, identity verification UX, physical-device end-to-end tests and independent security review.
8. Only after all gates pass may the product enable an internal test cohort and make a carefully scoped E2EE claim.

## 10. Acceptance criteria

- [x] Native Rust ownership and JS/native trust boundary documented.
- [x] Typed high-level bridge operation contract documented without exposing secrets.
- [x] Envelope, ordering, replay, server authorization and metadata requirements documented.
- [x] Device/account binding and fail-closed state machine documented.
- [x] Protocol, storage, lifecycle, privacy and physical-device tests specified.
- [x] Implementation order and explicit security gates recorded.
- [ ] Exact SQLCipher artifacts and licensing approved.
- [ ] Native encrypted persistence implemented and physically validated.
- [ ] OpenMLS runtime integrated and independently reviewed.
- [ ] Server and Ably migrated to ciphertext-only for E2EE conversations.
- [ ] End-to-end native device tests and independent security review passed.
