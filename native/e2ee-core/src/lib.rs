//! Binary Chat's isolated OpenMLS compatibility spike.
//!
//! This crate is intentionally not connected to the production Next.js,
//! Capacitor, API, MongoDB, or Ably message paths. It exists to validate
//! upstream OpenMLS group setup and authenticated application-message APIs.
//! The in-memory provider is test-only and is not suitable for production
//! persistence or key custody.

#![forbid(unsafe_code)]

/// The exact stable OpenMLS version used by this compatibility spike.
pub const OPENMLS_SPIKE_VERSION: &str = "0.9.2";

/// The RFC 9420 mandatory-to-implement X25519 / AES-128-GCM ciphersuite.
pub const MLS_CIPHERSUITE: &str =
    "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";
