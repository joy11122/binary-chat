# Native E2EE bridge spike (Phase 1.6C)

This directory contains an isolated Rust library used to validate a UniFFI
boundary for the OpenMLS prototype. It is **not production E2EE** and is not
registered with the running Capacitor app.

## Current exported surface

- `native_core_version()`: metadata only.
- `native_e2ee_available()`: always returns `false` until native storage,
  device lifecycle, protocol operations, and independent security review are
  complete.

No private keys, credentials, plaintext, MLS state, or protocol operations
are exposed to JavaScript. Do not add secret-bearing return values or methods
to this FFI surface.

## Build and test

From this directory:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

OpenMLS remains a dev-dependency so the existing in-memory compatibility tests
cannot accidentally become a production runtime. The release library is
currently only a UniFFI metadata shell.

## Required before a native plugin can enable E2EE

1. Bind the Rust library to Android and iOS using generated UniFFI bindings.
2. Implement encrypted, transactional MLS state persistence with a key held by
   Android Keystore / iOS Keychain; never use WebView storage.
3. Add native lifecycle, backup/restore, reinstall, device revocation, and
   secure deletion handling.
4. Define authenticated device enrollment, key-package publication, group
   membership changes, replay protection, and ciphertext-only server transport.
5. Fail closed on unsupported platforms and on every storage/crypto error.
6. Complete cross-platform tests and independent security review.

Until then, the existing messaging product remains non-E2EE. Binary encoding is
a display transformation, not encryption.
