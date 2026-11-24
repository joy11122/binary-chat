# Capacitor E2EE bridge scaffold

This local Capacitor 7 plugin is a deliberately disabled capability placeholder.

- Android and iOS report `available: false` with `not_implemented`.
- Web and non-native contexts fail closed without invoking a native bridge.
- Bridge errors return an unavailable result; callers must not fall back to plaintext.
- No keys, credentials, plaintext, MLS state, storage values, or cryptographic operations cross the JavaScript bridge.
- No secure storage or MLS protocol is integrated. The OpenMLS crate remains a separate compatibility spike.

Do not enable E2EE or label a conversation encrypted based on this scaffold. Production work requires an audited native protocol implementation, secure persistent state, device identity and membership lifecycle, server-side ciphertext-only handling, and independent security review.
