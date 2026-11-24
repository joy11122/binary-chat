# Phase 1.5E — Secure-storage candidate security review

**Status:** No-go for adopting the previously shortlisted plugin; no production storage dependency added  
**Assessment date:** 2026-11-24  
**Target:** Capacitor 7, Android + iOS, hosted Next.js WebView

## Executive decision

Do **not** integrate `capacitor-secure-storage-plugin@0.12.0` into Binary Chat yet.

The Phase 1.5C feasibility review correctly identified its Capacitor 7 version pin and documented platform lifecycle risks, but compatibility is not the same as cryptographic suitability. The upstream Android implementation currently visible in the repository uses RSA/ECB/PKCS1Padding to encrypt values and does not demonstrate an authenticated-encryption design. This is not an acceptable basis for storing long-lived E2EE identity or ratchet secrets without an exact-version source audit and independent security review.

The package README also documents a browser implementation backed by localStorage (base64 is not encryption), Android backup pitfalls, and iOS Keychain values surviving uninstall. Those behaviors require explicit fail-closed and lifecycle handling.

No plugin, crypto SDK, native storage code, or schema/API change is introduced by this review.

## Evidence and limitations

### Previously shortlisted package

- The package README says Capacitor 7 users should pin `capacitor-secure-storage-plugin@0.12.0`; 0.13.0 is the Capacitor 8 migration.
- The README describes AndroidKeyStore + SharedPreferences and iOS Keychain generic-password storage.
- The README explicitly says the Web implementation stores values in localStorage; it is not secure storage.
- The README warns that Android's encrypted SharedPreferences file must be excluded from both legacy backup rules and Android 12+ cloud/device-transfer rules.
- The README warns that iOS Keychain entries can remain after app uninstall.
- The upstream Android source currently available on the default branch contains `RSA/ECB/PKCS1Padding` operations. This source view is not proof that the exact npm 0.12.0 tarball is identical; that tarball must be inspected before any future adoption decision.

### Capawesome Secure Preferences

The official documentation describes Android AES-256-GCM backed by Android Keystore and iOS Keychain storage, with an intentionally insecure localStorage web implementation. However, the currently documented package versions require Capacitor 8 and access is restricted to Capawesome Insiders. This is not a drop-in option for the current Capacitor 7 project without a separately approved Capacitor 8 upgrade and license.

### Project constraints

- The repository currently generates Android and iOS native projects during CI; the generated projects are not committed. Therefore backup exclusions, app-delegate first-install cleanup, and native lifecycle code cannot yet be maintained as reviewed source files in the repository.
- CI proves generated Android debug and iOS Simulator builds compile. It does not prove physical-device key lifecycle, backup/restore, reinstall, lock-state, or Keystore/Keychain behavior.
- Binary Chat must fail closed in browsers. No secret may fall back to localStorage, IndexedDB, cookies, or an unencrypted preference store.

## Decision and implementation direction

1. Keep the existing E2EE architecture decision unchanged: no E2EE claim, no production key storage, and no custom cryptography.
2. Do not add `capacitor-secure-storage-plugin` until the exact 0.12.0 npm tarball and its Android/iOS source are independently inspected.
3. Prefer a narrowly scoped native key-management bridge that keeps long-lived private identity keys and sensitive operations inside native code, rather than exposing exportable private keys to WebView JavaScript. Select a protocol implementation with supported Android/iOS bindings before building that bridge.
4. If a generic key/value store is later approved for non-E2EE secrets, require authenticated encryption, safe key invalidation semantics, fail-closed web behavior, scoped deletion, Android backup exclusions, iOS uninstall policy, and physical-device tests.
5. Do not upgrade Capacitor major versions or adopt a paid plugin solely to bypass this review; assess compatibility, license, migration cost, and device behavior first.

## Required gates before any native secret storage ships

- [ ] Inspect exact package tarball, lockfile integrity, transitive dependencies, license, maintenance history, and Android/iOS implementation.
- [ ] Review cryptographic construction and error handling; reject unauthenticated encryption or silent downgrade/fallback.
- [ ] Commit reproducible native project configuration or a deterministic generation/configuration step.
- [ ] Implement Android backup exclusions for every sensitive preference file.
- [ ] Define iOS first-install, uninstall/reinstall, device-lock, and account-deletion behavior.
- [ ] Ensure browser calls reject with a typed unsupported-platform error and never persist secret material.
- [ ] Add unit tests for namespace isolation, key validation, missing values, native errors, and deletion.
- [ ] Run Android and iOS native CI builds.
- [ ] Test physical Android and iOS devices across restart, process death, reboot/first unlock, lock state, app update, uninstall/reinstall, backup restore, and key invalidation.
- [ ] Complete independent security review before using storage for E2EE keys.

## Sources

- Plugin installation/version matrix and platform behavior: https://github.com/martinkasa/capacitor-secure-storage-plugin
- Plugin Android implementation currently visible upstream: https://github.com/martinkasa/capacitor-secure-storage-plugin/blob/master/android/src/main/java/com/whitestein/securestorage/PasswordStorageHelper.java
- Plugin changelog: https://github.com/martinkasa/capacitor-secure-storage-plugin/blob/master/CHANGELOG.md
- Capawesome Secure Preferences documentation and current Capacitor compatibility: https://capawesome.io/docs/sdks/capacitor/secure-preferences/
- Capacitor v7 security guide: https://capacitorjs.com/docs/v7/guides/security

**Final decision:** No-go on the Phase 1.5C candidate for production E2EE secrets. Continue with protocol/native-bridge research and exact-version source review; do not weaken the security boundary just to move faster.
