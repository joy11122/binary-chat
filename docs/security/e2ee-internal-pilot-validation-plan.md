# E2EE Internal Pilot Validation Plan

Status: **NOT APPROVED FOR PILOT.** This checklist defines evidence required before any internal E2EE pilot.

## Entry criteria

- Exact native crypto and SQLCipher artifacts passed provenance and independent security review.
- Supported Android and iOS physical-device matrix is documented.
- MLS runtime and native bindings are implemented without exposing secrets to JavaScript.
- Encrypted state persistence, platform key protection and recovery lifecycle passed tests.
- Server and Ably E2EE paths are ciphertext-only and enforce authenticated membership.
- Web and unsupported platforms fail closed.
- Threat model, incident response, deletion and recovery policies are reviewed.

## Functional scenarios

- New user/device enrollment and authenticated key package publication.
- One-to-one and multi-device group creation/join.
- Send/receive while online and offline; delayed and out-of-order delivery.
- Device addition, removal, revocation and account recovery.
- Conversation history after app restart, OS restart and app upgrade.
- Corrupt storage, unavailable secure hardware, locked device and lost key.
- User account deletion and local key destruction.
- Mixed app versions and protocol version negotiation.

## Security scenarios

- Ciphertext tampering, replay, wrong conversation/group and stale epoch.
- Unauthorized group add/remove, impersonated sender and compromised phone-number recovery.
- Ably channel enumeration, unauthorized subscribe/publish and token reuse.
- Database, WAL, journal, crash dump, backup, logs and analytics inspection.
- Rooted/jailbroken device limitations and same-origin web compromise.
- Resource-exhaustion inputs, malformed MLS messages and native panic/error paths.

## Acceptance requirements

- No plaintext or private key appears in server storage, transport, logs or analytics for E2EE conversations.
- Removed members cannot decrypt messages from subsequent epochs.
- No failure mode silently downgrades an E2EE conversation to plaintext.
- Device recovery is explicit and does not clone credentials without authorization.
- Data deletion and revocation are observable, tested and documented.
- Independent reviewers sign off on findings and remediation.
- Pilot participants receive an accurate limitation statement; do not advertise production-grade E2EE before review.

## Rollout and stop conditions

Begin with a small, explicitly opted-in internal group after entry criteria pass. Expand only after monitoring protocol failures, delivery integrity, recovery outcomes and privacy-safe crash signals. Stop rollout immediately for plaintext leakage, unauthorized membership, replay acceptance, key persistence failure, silent downgrade or unexplained state divergence. Preserve forensic evidence without collecting message content or secrets.