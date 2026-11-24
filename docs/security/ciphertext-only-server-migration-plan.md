# Ciphertext-Only Server Migration Plan

Status: **DESIGN ONLY — existing message transport and storage remain unchanged.**

## Security objective

For explicitly E2EE-enabled conversations, MongoDB, API servers, logs, analytics and Ably may handle routing metadata and opaque ciphertext envelopes only. They must not receive plaintext or client private keys. This does not retroactively make existing conversations E2EE.

## Envelope contract

Define a versioned, validated envelope with:
- protocol and envelope version;
- conversation/group identifier and epoch;
- sender device identifier and message identifier;
- opaque ciphertext bytes and bounded encoding;
- minimal routing metadata required for delivery.

Do not accept arbitrary client-supplied membership, sender identity or epoch claims as authorization. Bind authenticated account/device identity to the server-side membership record. Enforce size limits, schema validation, replay/idempotency controls and rate limits.

## Migration strategy

1. Introduce a separate, explicitly typed E2EE message path; do not reinterpret legacy message bodies as ciphertext.
2. Keep legacy plaintext conversations clearly marked as non-E2EE.
3. Gate E2EE conversation creation on supported native capability and completed device enrollment.
4. Reject plaintext payloads for E2EE conversations at every API and realtime boundary.
5. Store and relay only opaque envelopes for E2EE conversations.
6. Ensure history, search, previews, notifications, exports, backups, moderation and admin tools do not attempt server-side decryption.
7. Add retention/deletion semantics for ciphertext and protocol metadata.
8. Test rollback and mixed-version clients. Rollback must disable new E2EE operations safely; it must never convert ciphertext to plaintext or silently downgrade an existing E2EE conversation.

## Ably boundary

Ably is a delivery relay, not a trust anchor. Authenticate channel access from server-verified membership. Never publish plaintext, MLS secrets, key packages containing private material, or authorization tokens in event payloads. Minimize event metadata and prevent unauthorized channel subscription.

## Required verification

- Server cannot decrypt stored or relayed envelopes.
- Tampered, oversized, malformed, stale-epoch and replayed envelopes are rejected or safely quarantined.
- Non-members cannot read history, subscribe, publish or fetch delivery metadata.
- Removed members cannot receive future ciphertext.
- Logs, traces, error messages and analytics contain no plaintext or secret material.
- Legacy messaging remains functional without being mislabeled as E2EE.
- Web and unsupported native clients fail closed for E2EE conversations.

## No-downgrade rule

If an E2EE conversation cannot be processed securely, show a clear unavailable/error state. Never fall back to plaintext messaging in that conversation.