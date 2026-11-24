# Native MLS Runtime Implementation Plan

Status: **PLANNING ONLY — MLS runtime is not enabled in the app.**

## Scope

The goal is a native-first MLS runtime for supported Capacitor Android and iOS clients. Rust is the sole owner of MLS protocol state and cryptographic operations. Kotlin and Swift provide thin platform adapters. TypeScript calls typed high-level operations; it must not receive private keys, exporter secrets, ratchet state or serialized credentials.

## Version control

The current compatibility spike uses OpenMLS 0.9.2 and Rust crypto/basic credential crates 0.6.0. Do not describe the application as using OpenMLS 0.10.0. Before upgrading, review the exact release notes and security advisories, rerun protocol conformance and two-party tests, and record a deliberate version decision. No automatic dependency updates for protocol or crypto crates.

## Required operations (not implemented)

- Generate and persist a device credential and key package.
- Validate an authenticated Welcome and join an existing group.
- Create a group and add a device only after server-authorized membership checks.
- Encrypt an application message and produce a versioned ciphertext envelope.
- Decrypt only for the local authorized group member.
- Process commits and proposals with strict epoch and membership validation.
- Remove a device and ensure removed members cannot decrypt future epochs.
- Revoke local credentials and securely delete device-local state.

## Authorization boundary

A server-issued invitation or phone OTP alone is not proof that a device belongs in an MLS group. Bind device credentials to an authenticated account and an explicit device enrollment ceremony. Protect against phone-number takeover, stale invitations, duplicate enrollment, unauthorized adds/removes and account recovery that silently replaces keys.

The server authorizes membership changes and records the public protocol metadata needed for routing. The server must not possess client private keys or plaintext.

## Fail-closed states

Expose only typed states such as `unavailable`, `enrollment_required`, `store_locked`, `ready`, `recovery_required`, `revoked`, `deleting` and `deleted`. Unknown, inconsistent or corrupt state is an error, never a reason to use the existing plaintext path.

## Required tests

- Two independent devices create/join the same group.
- Valid encrypt/decrypt, tamper rejection, replay rejection and wrong-group rejection.
- Epoch transitions, concurrent commits, duplicate proposals and out-of-order delivery.
- Add/remove membership and prove removed devices cannot decrypt future messages.
- Persistence across process death, OS restart, app upgrade and device lock/unlock.
- Key loss, backup restore, reinstall and account takeover/recovery.
- FFI input validation, malformed envelopes, resource limits and panic containment.
- Physical-device tests on every supported Android/iOS version and ABI.

## Release gate

Do not set native capability to true or route real chats through MLS until persistence, key lifecycle, authorization, protocol and physical-device tests pass and receive independent security review. Web remains unsupported and must fail closed.