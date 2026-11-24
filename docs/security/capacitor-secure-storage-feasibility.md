# Phase 1.5C — Capacitor native secure-storage feasibility

**Status:** Candidate identified; production adoption is not approved  
**Assessment date:** 2026-11-24  
**App target:** Capacitor 7, Android + iOS, hosted Next.js 15 WebView

## Executive decision

Capacitor 7 can call native Android Keystore and iOS Keychain APIs through a Capacitor plugin. This is a supported architectural direction, not a platform blocker.

The current candidate for a limited native-storage integration spike is:

- Package: `capacitor-secure-storage-plugin`
- Exact version for Capacitor 7: `0.12.0` (pin exactly; do not use the latest tag)
- License: MIT
- Native implementation described by its maintainers: AndroidKeyStore + SharedPreferences on Android; iOS Keychain generic-password items on iOS.
- Repository: https://github.com/martinkasa/capacitor-secure-storage-plugin

This is **not** an E2EE implementation and is not approved as the final cryptographic key-custody design. No dependency or application code is added in this phase. The repository does not yet contain generated Android/iOS native projects, so adding a plugin without a real native build would create an unverified dependency.

## Capacitor 7 compatibility

The plugin's published installation instructions explicitly pin version 0.12.0 for Capacitor 7. Its changelog records the Capacitor 7 migration in 0.11.0 and SPM support in 0.12.0. Version 0.13.0 moved to Capacitor 8, so using the current latest package on this Capacitor 7 app would be incorrect.

Capacitor's own v7 security guidance recommends native Keychain/Keystore APIs for persisted sensitive keys and warns against embedding secrets in frontend code.

## Candidate behavior and constraints

### Android

- The plugin documents AndroidKeyStore-backed encryption with values stored in a SharedPreferences file named `cap_sec.xml`.
- Capacitor 7's Android baseline is above API 18, so the plugin's documented pre-API-18 base64 fallback should not apply to supported Binary Chat devices.
- Android Auto Backup can restore the encrypted preferences without the non-backed-up Keystore key. The plugin documents excluding `cap_sec.xml` from both legacy backup rules and Android 12+ data extraction rules.
- Before release, the native app must exclude this file from cloud backup and device transfer, then test reinstall/restore behavior.

### iOS

- The plugin stores values as generic passwords in the iOS Keychain under service `cap_sec`, without iCloud synchronization.
- Keychain items can survive app uninstall/reinstall. Account deletion and first-launch lifecycle must explicitly clear this namespace if that is the chosen product policy.
- Values are available only after the first device unlock following reboot. Background startup before first unlock can fail; the app must handle this without logging secret values or silently replacing keys.

### Web / hosted Next.js

- The plugin's web implementation uses localStorage (base64 is not encryption). It is not secure storage.
- The web fallback MUST NOT be used for private identity keys, session/ratchet state, wrapping keys, or E2EE secrets.
- Binary Chat's hosted Next.js site runs in a browser as well as in a Capacitor WebView. A secure-storage facade must fail closed outside native iOS/Android rather than silently fall back to web storage.
- Native Keychain/Keystore storage protects data at rest. It does not prevent malicious same-origin JavaScript/XSS from calling an exposed native plugin or using a key after the app unlocks it. CSP, dependency control, script minimization, and XSS prevention remain mandatory.

## Proposed integration boundary

Create a narrow client-only storage facade only after native project generation and dependency verification:

- `set(key, value)`, `get(key)`, `remove(key)`, and scoped `clearNamespace()`.
- Prefix all Binary Chat keys with a versioned namespace, e.g. `binary-chat.e2ee.v1.`.
- Reject calls unless `Capacitor.isNativePlatform()` and platform is exactly `ios` or `android`.
- Never import the facade from server components, route handlers, API routes, or server actions.
- Never log values, private keys, plaintext, ciphertext payloads, or storage exceptions that may include data.
- Return typed, sanitized error codes to callers; distinguish missing item, device locked/not-yet-unlocked, key invalidation, decryption failure, and unexpected native errors.
- Do not store plaintext chat messages in secure key/value storage. It is only for small secrets or a wrapping key.
- Do not expose a general-purpose `clear()` to feature code. Account deletion should clear only the Binary Chat namespace and revoke server-side sessions separately.

## E2EE architecture implication

Secure key/value storage alone does not solve the SDK compatibility issue from Phase 1.5B. A JavaScript E2EE SDK running inside the WebView may need access to key material and persistent ratchet state. An XSS attacker could execute same-origin JavaScript and invoke an exposed plugin.

Two options remain:

1. **WebView crypto + native at-rest key storage:** less native work, but the key becomes available to the WebView runtime while unlocked and remains exposed to active same-origin script compromise. This is not equivalent to keeping private keys inside a native boundary.
2. **Native crypto/key-management bridge:** keep long-lived private identity keys and sensitive operations inside native code, expose narrow operations to JavaScript, and use a protocol implementation with supported Android/iOS bindings. This is the stronger target for Binary Chat, but requires a separate protocol/library compatibility decision and native tests.

Do not assume a generic Keychain/Keystore plugin is an E2EE adapter. It is only one building block.

## Required implementation and verification gates

1. Generate actual Capacitor 7 Android and iOS projects from the current repository and pin toolchain versions.
2. Add exactly `capacitor-secure-storage-plugin@0.12.0` on a feature branch; inspect the exact package tarball and native source before adoption.
3. Run `npm ci`, lint, typecheck, unit tests, and Next.js production build after dependency changes.
4. Run `npx cap sync`, Android Gradle build, and iOS Xcode/SPM build.
5. Add Android backup exclusions for `cap_sec.xml` to both legacy and Android 12+ backup rules.
6. Test set/get/remove, app restart, process death, reboot-before-first-unlock, after-first-unlock, device lock, app update, uninstall/reinstall, cloud restore, device transfer, and key invalidation.
7. Test iOS Keychain access while locked, after first unlock, after reboot, after app update, after uninstall/reinstall, and after explicit namespace deletion.
8. Verify web/browser calls fail closed and never store secrets in localStorage.
9. Commission independent security review before using this storage for production E2EE identity or ratchet keys.

Physical-device tests cannot be truthfully marked complete by CI or by a source review. They require real Android and iOS devices.

## Go / no-go

- [x] Confirm Capacitor's supported native plugin model and v7 security guidance.
- [x] Identify an open-source plugin with an explicit Capacitor 7 version pin.
- [x] Document Android backup and iOS uninstall/keychain lifecycle risks.
- [x] Define a fail-closed web policy and native integration boundary.
- [ ] Inspect and pin the exact package tarball in the app.
- [ ] Generate and build native Android/iOS projects.
- [ ] Complete physical-device lifecycle tests.
- [ ] Complete independent security review.
- [ ] Approve a native crypto/key-management architecture.

**Decision:** Proceed to a controlled implementation spike only after native projects exist. Do not store production E2EE keys yet and do not claim Binary Chat is E2EE.

## Sources

- Capacitor v7 security guide: https://capacitorjs.com/docs/v7/guides/security
- Capacitor plugin architecture: https://capacitorjs.com/docs/plugins
- Plugin repository and Capacitor version matrix: https://github.com/martinkasa/capacitor-secure-storage-plugin
- Plugin changelog: https://github.com/martinkasa/capacitor-secure-storage-plugin/blob/master/CHANGELOG.md
