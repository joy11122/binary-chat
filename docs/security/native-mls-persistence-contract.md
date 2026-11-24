# Native MLS Persistence Contract

**Status:** design contract only; not an implementation or production approval  
**Phase:** 1.7C  
**Applies to:** the native-only OpenMLS pilot on Android and iOS

## 1. Scope and non-goals

This document defines the persistence boundary for a future native MLS runtime. It does not add a database, SQLCipher, key storage, platform bindings, or chat-flow integration. It does not enable E2EE. The current native capability probe must remain unavailable, and web clients must continue to fail closed for E2EE conversations.

The SQLCipher candidate review in Phase 1.7B remains a separate gate. Nothing in this contract approves SQLCipher 4.20.0 or any other artifact for production use.

## 2. Ownership and trust boundaries

- Rust owns MLS protocol state, private keys, epoch state, ratchets, and cryptographic decisions.
- The native persistence adapter stores opaque, versioned Rust-owned state. It must not interpret MLS secrets.
- Android Keystore and iOS Keychain protect a randomly generated database encryption key or key-encryption key. The key must never be hard-coded, logged, exported to JavaScript, or stored beside the database in plaintext.
- Kotlin and Swift provide narrowly scoped platform key operations and lifecycle signals. They must not implement MLS protocol logic.
- JavaScript receives only typed operation results and short-lived plaintext explicitly needed for display. It never receives private key material, database keys, serialized secret state, or raw SQL access.
- MongoDB and Ably receive only authenticated opaque ciphertext envelopes for E2EE conversations after a separately reviewed server migration. Existing plaintext messaging must not be silently reinterpreted as E2EE.

## 3. Persistence adapter contract

The eventual Rust-facing adapter should expose a minimal transactional interface equivalent to:

- open(identity, key_handle) -> StoreSession
- begin_transaction() -> Transaction
- read(namespace, record_id) -> bytes or not_found
- write(namespace, record_id, version, bytes)
- delete(namespace, record_id)
- commit(transaction)
- rollback(transaction)
- close()

This is a conceptual contract, not a prescribed public API. Names and signatures must be finalized during implementation review.

Requirements:

1. All MLS state mutations that must be consistent within one protocol operation commit atomically.
2. A failed write, process termination, or device power loss must leave either the prior committed state or the complete new state; never a partially applied state.
3. Transactions must enforce monotonic record versions and reject stale writes.
4. Database schema and serialized state carry explicit format versions. Unknown newer versions fail closed; no best-effort downgrade or silent data reset.
5. Reads and writes are scoped to the authenticated local device identity and MLS group. Cross-account or cross-device access is denied.
6. No plaintext secret values are written to logs, crash reports, analytics, temporary files, swap-friendly caches, or debug output.
7. The adapter returns typed errors; callers must distinguish locked, revoked, corrupt, unsupported-version, I/O, and integrity failures.
8. No automatic plaintext export, cloud sync, or unencrypted migration path is permitted.

## 4. Key lifecycle

- Generate database key material with the platform cryptographically secure random source.
- Wrap or derive access to that key through Android Keystore / iOS Keychain using reviewed, platform-appropriate algorithms and accessibility policies.
- Never persist the raw database key in preferences, localStorage, IndexedDB, files, backups, or the database itself.
- Define explicit behavior for biometric changes, device passcode removal, Keychain item persistence after uninstall, Android app-data restore, device transfer, and secure hardware unavailability.
- Key rotation must be atomic and recoverable: create and verify the new wrapped key, re-encrypt or re-key the database, commit, then retire the old wrapped key. Failure must not destroy the only recoverable copy.
- Account logout must close the store and clear in-memory key material. Account deletion must run a separately verified local cryptographic-erasure workflow; server deletion alone is insufficient.
- Device revocation must make the local store inaccessible to the revoked device after the protocol-defined transition. Do not equate OTP account recovery with recovery of E2EE keys.

## 5. Backup, restore, and filesystem rules

- Exclude database files, WAL/journal files, temporary copies, wrapped key metadata, and any secret-bearing artifacts from cloud/device backups unless a separately reviewed end-to-end encrypted recovery design explicitly permits them.
- Android backup and device-transfer rules must be tested on supported Android versions and OEM variants.
- iOS Keychain persistence across app uninstall/reinstall must be explicitly handled and tested; uninstall must not be assumed to delete Keychain items.
- Database, WAL, SHM, journal, temporary, and migration files must share the same protection policy. No plaintext sidecar files.
- App sandbox permissions must prevent other apps and web content from reading database artifacts.
- Restore from an unsupported, incomplete, or mismatched database/key pair must fail closed and enter recovery_required; it must not create a new empty identity silently.

## 6. Locking and concurrency

- Only one writer may mutate a given local MLS store at a time.
- Define process-level and database-level locking for app background/foreground transitions and multiple windows/scenes.
- Concurrent reads must not observe uncommitted protocol state.
- A transaction conflict must return a typed retryable error; do not retry protocol operations blindly if they may consume a one-time key package or advance an epoch.
- Backgrounding, OS termination, and native bridge disconnects must close or suspend access safely.

## 7. Fail-closed state machine

The native runtime must expose only the high-level states already defined by the runtime contract:

- unavailable
- enrollment_required
- store_locked
- ready
- recovery_required
- revoked
- deleting
- deleted

Any storage integrity failure, unsupported format, missing key, identity mismatch, or ambiguous transaction outcome must prevent decrypt/send operations and transition to an appropriate non-ready state. There is no plaintext fallback for an E2EE conversation.

## 8. Required verification before implementation approval

### Artifact and supply-chain
- Exact Android AAR and Apple XCFramework artifacts, checksums, signatures, provenance, licenses, transitive dependencies, SBOM, and source-to-binary relationship independently reviewed.
- Reproducible or otherwise independently verifiable build evidence documented.
- No beta, unknown-origin, or unreviewed binary-only artifact accepted.

### Database correctness
- Atomic commit/rollback tests, crash injection, power-loss simulation, WAL/journal recovery, schema migration, corruption detection, and concurrent access tests.
- Cross-platform compatibility tests for the chosen schema and cipher configuration.
- Fuzzing of database metadata, serialized state envelopes, and migration inputs.

### Key and lifecycle
- Physical-device tests on supported Android and iOS versions for lock/unlock, passcode changes, biometric enrollment changes, backup/restore, reinstall, device transfer, key rotation, logout, deletion, and revocation.
- Verify that backups and filesystem inspection reveal no plaintext secrets or usable database keys.
- Validate failure behavior with missing, invalidated, inaccessible, or mismatched platform key material.

### Protocol integration
- MLS group state and database transaction boundaries reviewed together.
- Crash between protocol state mutation and ciphertext send must not cause nonce/epoch reuse or inconsistent sender state.
- Duplicate, replayed, delayed, and reordered network events tested against persisted state.
- Multi-device and device-revocation behavior tested with independent physical devices.

## 9. Go/no-go criteria

**NO-GO** until all of the following are true:

1. Phase 1.7B artifact audit is resolved with exact, independently reviewed artifacts.
2. Platform key wrapping and database encryption design receives independent security review.
3. The implementation passes database, lifecycle, backup, and physical-device tests on both platforms.
4. Rust MLS state mutation and storage transactions have a reviewed atomicity model.
5. Threat model, recovery model, deletion model, and residual metadata disclosure are documented.
6. E2EE server ciphertext migration and device enrollment/revocation are independently reviewed.
7. The native pilot passes a two-device security test plan without plaintext fallback.

Until then, keep the native capability probe false and do not persist production MLS secrets.
