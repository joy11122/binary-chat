# Phase 1.6E — Secure native storage design and threat model

**Status:** Design proposal; implementation and production adoption are not approved  
**Date:** 2026-11-24  
**Target:** Binary Chat, Next.js + TypeScript + Capacitor 7, Android and iOS  
**Depends on:** Phase 1.6D fail-closed native bridge scaffold and Phase 1.6A–C protocol/native feasibility work

## 1. Decision summary

This phase defines a storage boundary for a future native MLS implementation. It does not add a database, key-management code, cryptographic dependency, or runtime behavior.

**Proposed architecture:**

1. OpenMLS and all private MLS state are owned by the native Rust core. The WebView must not receive exportable private identity keys, MLS epoch secrets, ratchet secrets, or a raw database key.
2. Persist MLS state in an encrypted SQLite database using SQLCipher, subject to exact-version, platform, licensing, and supply-chain review.
3. Generate a cryptographically random per-install database key. Protect it with a platform-specific, non-exportable wrapping key:
   - Android: AES-GCM key generated and held by Android Keystore; use it to wrap the database key. Prefer hardware-backed storage when available, but do not require StrongBox or claim hardware backing without checking KeyInfo at runtime.
   - iOS: store the wrapped database key in Keychain with an explicit device-only accessibility policy. Initial candidate: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Evaluate `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` as a stricter opt-in/policy if requiring a device passcode is acceptable.
4. Keep the SQLCipher key and plaintext MLS state inside the native Rust/storage boundary. JavaScript receives only narrowly scoped, validated operations and sanitized results.
5. Do not back up the encrypted database or wrapped-key records by default. If encrypted backup/recovery is later required, design it as a separate end-to-end encrypted recovery protocol; never copy a device-bound wrapping key to another device.
6. Browser/web builds remain unavailable for E2EE. No localStorage, IndexedDB, cookies, plain SQLite, SharedPreferences, or JS-readable fallback is permitted for private MLS state or key material.
7. Any missing, invalidated, inaccessible, or mismatched key causes a fail-closed state. Never silently create a replacement key and continue with an empty database as if the old history were intact.

This design is **not an independent security audit** and does not make the current product E2EE. The Phase 1.6D bridge intentionally reports unavailable.

## 2. Storage and key hierarchy

```text
Native Rust MLS core
  ├── MLS identity / credential private material
  ├── MLS group state, epochs, ratchets, replay state
  └── SQLCipher database connection
        └── random per-install DB key (memory only while open)
              └── wrapped by platform wrapping key
                    ├── Android Keystore AES-GCM key
                    └── iOS Keychain-protected key material
```

### Database

- Use SQLCipher's supported SQLite integration only after validating the exact Android and iOS artifacts, version compatibility, build reproducibility, and license obligations.
- Use a unique random database key per app installation/device profile. Generate it using the platform CSPRNG through a reviewed native interface; never derive it from phone number, OTP, user ID, device model, or a hard-coded application secret.
- Do not use a password chosen by the user as the database key without a separately reviewed KDF and recovery design.
- Apply SQLCipher keying before any database page is read. Verify the database with a known schema/meta query and integrity checks; treat wrong-key, corrupt, and unsupported-version outcomes distinctly.
- Include database sidecars and transient files in the storage threat model: WAL, SHM, journal, temporary exports, crash snapshots, and migration copies. Keep them in the app-private no-backup area and under the same file-protection policy as the database.
- Do not write decrypted database exports, debug dumps, SQL traces, or plaintext backups to shared storage.
- Set secure file permissions and platform data-protection attributes. On iOS, choose a file protection class consistent with the foreground-only key access policy.
- Run schema migrations transactionally. Never drop or recreate the encrypted store after a migration failure without explicit recovery consent and a safe rollback/backup plan.

### Android wrapping key

- Generate an AES key in Android Keystore with randomized encryption required and an authenticated mode (AES-GCM). Do not export the key bytes.
- Use a fresh cryptographically random nonce for every encryption under a given key; persist nonce, ciphertext, and authentication tag as a versioned wrapped-key record.
- Bind the wrapped-key record to the app, database identifier, and key version using authenticated associated data (AAD). Validate the binding before unwrapping.
- Check whether the key is hardware-backed using Android Keystore metadata when available. Record only non-sensitive capability status; do not claim StrongBox or TEE protection if not verified.
- Handle permanent key invalidation, lock-screen changes, restored backups without the original Keystore key, and provider errors as explicit unrecoverable/unavailable states.
- SQLCipher for Android does not itself implement Android Keystore key management. The app integration owns the wrapping/unwrapping design; keep that responsibility in the native security module.

### iOS Keychain

- Store only the wrapped database key (not plaintext MLS state or a raw exportable long-term private key) in a dedicated Keychain service/access group.
- Initial accessibility candidate: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. This restricts access to when the device is unlocked and prevents migration to another device through backup restore.
- Evaluate `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` if product policy can require a passcode. Apple documents that this class is unavailable without a passcode and items are removed if the passcode is disabled.
- Do not mark key records synchronizable. Do not use deprecated Always-accessible classes.
- Decide whether user presence/biometrics are required for unwrapping. Biometrics can change and may invalidate access-controlled items; define enrollment-change and fallback UX before enabling.
- Keychain items may persist after app uninstall. Implement a reviewed first-install/reinstall policy; do not assume uninstall deletes Keychain records.

## 3. Native API boundary

The WebView must not receive raw database keys, MLS secrets, serialized private state, or plaintext persistence blobs.

Allowed future high-level calls should be narrow and typed, for example:
- initialize or unlock the local secure store;
- create/join/leave a group through protocol-level operations;
- encrypt an outgoing message and return an opaque versioned ciphertext envelope;
- decrypt an authenticated incoming envelope and return plaintext only for immediate presentation;
- list minimal non-sensitive conversation metadata;
- delete a specific local account/device namespace.

The exact API is not approved in this phase. In particular:
- Do not expose generic `getSecret(key)`, `setSecret(key, value)`, raw SQL, arbitrary file access, or a method returning the SQLCipher key.
- Do not return full serialized MLS group state to JavaScript.
- Validate every bridge argument, enforce size limits, authenticate the active app account/device context, and return stable sanitized error codes.
- Never log plaintext, keys, MLS state, ciphertext bodies, OTPs, tokens, or exception messages that might contain them.
- The bridge must remain disabled until protocol and storage acceptance tests pass. Bridge errors must never trigger plaintext fallback.

## 4. Lifecycle and recovery policy

| Event | Required behavior |
|---|---|
| App process death | Database remains encrypted. Reopen only after native key unwrap succeeds; clear transient in-memory secrets on shutdown where practical. |
| Device reboot / before first unlock | Respect platform key accessibility. Return a typed locked/unavailable state; do not regenerate keys. |
| Device lock | Close or suspend the DB and clear sensitive in-memory state according to the chosen UX/security policy. |
| Android Keystore key invalidated | Mark local store unrecoverable; require device re-enrollment/recovery. Never overwrite the wrapped key silently. |
| iOS passcode removed (if passcode-set class chosen) | Treat missing key as key invalidation and require recovery/re-enrollment. |
| App update | Preserve database and key namespace; perform versioned, transactional migrations. |
| Android uninstall / clear app data | App-private database and Keystore key are expected to be removed with app data; verify on supported OS/OEM combinations. No database restore without its wrapping key. |
| iOS uninstall/reinstall | App container marker disappears while Keychain may remain. On first launch, detect a missing install marker and apply a carefully reviewed stale-key cleanup policy before creating a new install identity. |
| Backup/restore to a different device | Device-only wrapping key must not migrate. Restored ciphertext without the key is unusable; detect and present a recovery/re-enrollment flow. |
| User account deletion | Revoke server sessions/devices first or transactionally coordinate deletion; delete local MLS groups, database, keychain/keystore namespace, and transient files. Verify deletion and report partial failures safely. |
| Device lost/stolen | Revoke device credentials from another trusted device/account recovery flow; local at-rest encryption reduces offline access but cannot protect an already-unlocked/compromised device. |
| Key rotation | Version wrapping records, support atomic rewrap, verify DB before retiring old key, and retain rollback safety until successful commit. MLS protocol epoch/key rotation remains distinct from DB-key rotation. |

### iOS reinstall detection detail

A small install marker in the app container can distinguish an ordinary app update from a fresh install because app updates preserve the container while uninstall removes it. On first launch with no marker, do not immediately delete arbitrary Keychain data. Use a dedicated app service/access group and a versioned install identifier; verify app identity and migration behavior, then remove only Binary Chat's own stale key namespace according to the approved policy. Handle backup restore, app offload, multiple app targets, and concurrent first-launch races in physical tests. This is a design requirement, not yet implemented.

### Recovery

- Device-bound keys intentionally do not migrate. If a device is lost and no recovery protocol exists, local encrypted history may be permanently lost.
- Do not promise cloud restore or seamless multi-device history until a separate end-to-end encrypted recovery design exists.
- Recovery must not be implemented by uploading plaintext keys or using the user's phone number/OTP as a key-encryption key.
- Clearly distinguish account recovery (regaining server login) from cryptographic recovery (regaining access to encrypted history).

## 5. Backup, export, and deletion

### Android

- Explicitly exclude the SQLCipher database, WAL/SHM/journal files, wrapped-key records, and any sensitive metadata from both legacy backup configuration and Android 12+ cloud/device-transfer extraction rules.
- Prefer a dedicated no-backup directory for files that must never be included. Do not rely on directory assumptions alone; test actual backup/restore behavior for supported Android versions and target SDK.
- Do not back up Keystore key aliases or assume a restored app can unwrap a key from the original device.

### iOS

- Use device-only Keychain accessibility for the wrapping record and a non-synchronizable item.
- Apply an appropriate file protection class and exclude the local encrypted database from iCloud/device backup unless a separately approved encrypted recovery format is designed.
- Test uninstall/reinstall and app offload separately; their data lifecycle behavior must not be assumed identical.

### Deletion

- Provide a native deletion operation scoped to the Binary Chat account/device namespace.
- Delete the database, sidecars, wrapped-key record, platform wrapping key alias, temporary files, and any cached exports.
- Treat deletion as a multi-step operation with explicit success/failure reporting. If one platform store fails, do not report complete deletion.
- Server-side account/device revocation is separate and must be coordinated with local deletion.
- Explain that flash storage wear-leveling and platform backups mean application-level overwrite is not a guaranteed forensic secure erase. Cryptographic erasure by deleting keys is the primary local strategy, subject to platform behavior and independent validation.

## 6. Threat model

| Threat | Mitigation | Residual risk / validation |
|---|---|---|
| Stolen powered-off, locked device | SQLCipher + Keystore/Keychain wrapped key; restrictive accessibility; device passcode | OEM/OS implementation differences; physical testing required |
| Rooted/jailbroken device | Keep keys in native boundary; hardware-backed key where available; integrity signals as risk signals only | Root can instrument process or hook APIs; no absolute protection |
| WebView XSS / malicious dependency | No raw keys or generic secret API in JS; strict CSP, minimal scripts, dependency review; native core performs crypto | Compromised JS can still ask the native bridge to perform authorized actions or capture plaintext shown in UI |
| App process memory dump | Minimize plaintext/key lifetime; avoid logs and JS state; native memory hygiene | Rust/FFI/OS copies and memory zeroization limitations require review |
| Backup exfiltration | Exclude database and wrapped key; device-only key | Misconfigured backup rules or OEM transfer paths; test |
| Reinstall / stale iOS Keychain | Install marker and scoped namespace cleanup | Offload, restore, multiple targets and race conditions need device tests |
| Keystore/Keychain invalidation | Typed unrecoverable state; explicit recovery UX | Local history may be lost |
| Malicious server / Ably operator | Client-side encryption; authenticated MLS membership; server stores opaque envelopes | Metadata and traffic patterns remain visible; membership/auth implementation can still be attacked |
| Replay / rollback of local state | MLS protocol replay checks plus versioned monotonic state and transactional DB writes | Full rollback protection may require platform monotonic storage; design separately |
| Multi-process / multi-tab concurrent writes | Single native store owner and serialized transactions | Test lifecycle/background/foreground races |
| Dependency or build supply-chain compromise | Pin exact versions, verify checksums/signatures where available, SBOM, reproducible CI, review native binaries | Upstream and build environment remain trust dependencies |

## 7. SQLCipher evaluation and licensing

- Candidate Android project: `sqlcipher/sqlcipher-android`, the current Android bindings project. Its documented minimum is Android API 23 and it exposes a native SQLite replacement. Verify current release, supported ABIs, NDK/toolchain, Capacitor-generated Gradle compatibility, and physical-device performance before pinning.
- SQLCipher Android documentation explicitly leaves Android Keystore key storage to the application integration. The proposed wrapping layer is therefore required; SQLCipher does not solve key custody by itself.
- SQLCipher Community Edition uses a BSD-style license with attribution/copyright notice obligations in app materials/documentation. Commercial editions have separate terms. Legal/product review must decide the applicable edition before distribution.
- Do not infer that a GitHub release tag or README guarantees binary provenance. Pin the exact artifact, verify source/tag/checksum and transitive native libraries, record the SBOM, and run a license scan.
- Do not use an abandoned/deprecated SQLCipher Android artifact merely because older examples reference it.

## 8. Required validation matrix

No implementation is approved until all relevant rows have automated and physical-device coverage.

| Area | Required cases |
|---|---|
| Key creation | CSPRNG failure, duplicate initialization race, partial creation rollback, namespace isolation |
| Key wrapping | AES-GCM tamper, wrong AAD, wrong key version, nonce uniqueness strategy, corrupted record |
| SQLCipher | Wrong key, corruption, WAL recovery, schema migration rollback, integrity check, large message history |
| Android | API 23 minimum, current Android, supported ABIs, Keystore hardware metadata, StrongBox absent/present, screen lock, reboot, backup/restore, device transfer, uninstall/data clear |
| iOS | Supported minimum iOS, locked/unlocked, reboot/first unlock, passcode changes, biometric enrollment changes if used, backup restore, uninstall/reinstall, app offload, Keychain stale item cleanup |
| Capacitor | Web rejects, Android/iOS bridge registration, bridge failure, app upgrade, process recreation, background/foreground |
| MLS | Group create/join/leave, epoch transition, replay rejection, invalid membership, device revocation, state rollback |
| Privacy | No secret in logs, analytics, crash reports, URLs, browser storage, backups, debug exports |
| Resilience | Storage full, interrupted writes, app killed during transaction, concurrent calls, migration interruption |
| Deletion | Account/device namespace deletion, partial failure, reinstallation, server revocation coordination |

CI compilation is not a substitute for physical Android and iOS testing. A passing simulator/APK build does not prove Keychain/Keystore behavior.

## 9. Rollout gates

1. Approve this design and threat model.
2. Confirm SQLCipher version, exact artifacts, license, Android/iOS build integration, and supply chain.
3. Implement native key wrapping and encrypted DB in an isolated feature branch; no chat-flow activation.
4. Implement Rust-owned MLS state persistence and a narrow typed bridge.
5. Add automated tests and physical-device lifecycle tests.
6. Conduct independent cryptographic/native storage security review.
7. Migrate server persistence and Ably to ciphertext-only envelopes; fail closed for unsupported devices/clients.
8. Enable a small internal test cohort only after all gates pass. Do not market E2EE before end-to-end verification and review.

## 10. Explicit non-goals and current product truth

- No code, dependency, database schema, API, or chat UI change is made by this design.
- Phase 1.6D is only a disabled native capability probe.
- The OpenMLS Rust crate remains a compatibility spike, not a production integration.
- Existing messages are not E2EE; binary encoding is not encryption.
- No guarantee is made against a compromised/rooted device or malicious code executing in the app process.
- No independent audit has been completed.

## 11. Primary references

- SQLCipher Android bindings and supported platform details: https://github.com/sqlcipher/sqlcipher-android
- SQLCipher Android maintainers on Keystore responsibility: https://github.com/sqlcipher/sqlcipher-android/issues/51
- SQLCipher license terms: https://www.zetetic.net/sqlcipher/license/
- Android Auto Backup include/exclude and no-backup directory guidance: https://developer.android.com/identity/data/autobackup
- Apple Keychain accessibility classes: https://developer.apple.com/documentation/security/item-attribute-keys-and-values
- Apple Keychain accessibility policy: https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility
- Apple `WhenUnlockedThisDeviceOnly` behavior: https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly

## 12. Acceptance checklist

- [x] Define native-only key/MLS-state ownership and JS bridge restrictions.
- [x] Define SQLCipher + platform wrapping-key proposal.
- [x] Document Android Keystore and iOS Keychain lifecycle/backup constraints.
- [x] Document reinstall, invalidation, deletion, recovery, and key rotation behavior.
- [x] Threat model WebView compromise, rooted devices, backups, server metadata, and rollback.
- [x] Identify SQLCipher Android integration and licensing review requirements.
- [x] Define physical-device and CI validation matrix.
- [ ] Approve exact SQLCipher artifacts and licenses.
- [ ] Implement native storage in a later phase.
- [ ] Complete physical Android/iOS tests.
- [ ] Complete independent security review.
