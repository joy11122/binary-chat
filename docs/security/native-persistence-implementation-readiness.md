# Native MLS Persistence Implementation Readiness

Status: **DESIGN ONLY — NO-GO for production implementation until all gates below pass.**

This document coordinates the implementation work planned for phases 1.7D–1.7G. It does not approve a SQLCipher artifact, enable MLS, add dependencies, or change message storage.

## Current verified baseline

- The Rust compatibility spike is isolated and pinned to OpenMLS 0.9.2 with `openmls_rust_crypto` 0.6.0 and `openmls_basic_credential` 0.6.0.
- The UniFFI bridge is a scaffold only. No secret, MLS state, plaintext or cryptographic operation crosses it.
- Android and iOS Capacitor plugins report `available: false`.
- SQLCipher candidates were assessed in a documentation audit; production adoption remains NO-GO.
- Existing web messaging is not E2EE. Binary text representation is not encryption.

## Mandatory gates before implementation

1. **Artifact provenance:** independently verify exact Android AAR and Apple XCFramework bytes, SHA-256, signatures/provenance, source-to-binary relationship, transitive dependencies, ABI coverage, licenses and SBOM.
2. **Independent review:** obtain a security review of the exact artifacts and integration, not merely upstream project documentation.
3. **Platform lifecycle:** validate Android Keystore and iOS Keychain key wrapping, lock/unlock, reinstall, backup/restore, device migration, app-data deletion and key loss on physical devices.
4. **Database safety:** validate encryption, key rotation strategy, WAL/journal/temp-file handling, crash recovery, atomic transactions, concurrent access and cross-platform schema compatibility.
5. **Protocol readiness:** review the exact OpenMLS version, advisories, storage traits, credential validation, group membership authorization and recovery behavior.
6. **Fail-closed behavior:** prove unsupported platforms, unavailable storage, corrupt state, revoked devices and failed decryptions never fall back to plaintext.
7. **Operational readiness:** define incident response, upgrade/rollback, telemetry that excludes secrets, and a recovery policy that does not silently weaken security.

A failed or unverified gate blocks production dependencies and capability enablement.

## Proposed native persistence boundary

Rust owns MLS state transitions and protocol secrets. A narrow native persistence adapter may store opaque, versioned MLS state blobs and transactional metadata. Platform code owns only platform key protection and lifecycle integration. JavaScript receives typed operation results and plaintext only for an explicitly requested display lifetime.

The database key must be protected by Android Keystore or iOS Keychain. SQLCipher itself does not provide that key lifecycle. Never store raw keys or private MLS state in localStorage, IndexedDB, cookies, ordinary preferences, unencrypted SQLite, logs or analytics.

## Transaction and corruption requirements

- Commit group state and corresponding message-send state atomically where protocol semantics require it.
- Reject stale or non-monotonic state versions.
- Detect schema/version mismatch and return a typed recovery-required state.
- Never reset or recreate a group automatically after corruption.
- Ensure rollback cannot resurrect removed members, consumed key material or replayable message state.
- Treat backup restoration as an explicit device recovery flow, not an automatic clone of active credentials.

## Exit criteria

Implementation may begin only after all artifact, security and lifecycle gates have signed evidence. The capability probe remains false until end-to-end tests on supported physical devices pass.