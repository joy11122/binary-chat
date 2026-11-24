//! Binary Chat's isolated OpenMLS and UniFFI compatibility spike.
//!
//! This crate is intentionally not connected to the production Next.js,
//! Capacitor, API, MongoDB, or Ably message paths. The exported functions are
//! metadata-only capability probes. No keys, credentials, plaintext, MLS
//! state, or cryptographic operations cross the UniFFI boundary.
//!
//! The in-memory OpenMLS provider used by integration tests is test-only and
//! is not suitable for production persistence or key custody.

#![forbid(unsafe_code)]

uniffi::setup_scaffolding!();

/// The exact stable OpenMLS version used by this compatibility spike.
pub const OPENMLS_SPIKE_VERSION: &str = "0.9.2";

/// The RFC 9420 mandatory-to-implement X25519 / AES-128-GCM ciphersuite.
pub const MLS_CIPHERSUITE: &str = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

/// Returns the version of the isolated native compatibility layer.
#[uniffi::export]
pub fn native_core_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// Reports whether the native E2EE runtime is enabled.
///
/// This deliberately remains false until production-grade native storage,
/// device lifecycle handling, and protocol operations have been implemented
/// and independently reviewed. Callers must fail closed on this value.
#[uniffi::export]
pub fn native_e2ee_available() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::{native_core_version, native_e2ee_available, MLS_CIPHERSUITE};

    #[test]
    fn ffi_metadata_is_available_without_enabling_e2ee() {
        assert_eq!(native_core_version(), env!("CARGO_PKG_VERSION"));
        assert!(!native_e2ee_available());
        assert!(MLS_CIPHERSUITE.starts_with("MLS_128_"));
    }
}
