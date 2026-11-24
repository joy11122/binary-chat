use openmls::prelude::{
    tls_codec::*, BasicCredential, Ciphersuite, CredentialWithKey, MlsGroup, MlsGroupCreateConfig,
    MlsGroupJoinConfig, MlsMessageBodyIn, MlsMessageIn, OpenMlsProvider, ProcessedMessageContent,
    ProtocolMessage, StagedWelcome,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;

fn credential(
    identity: &[u8],
    ciphersuite: Ciphersuite,
    provider: &impl OpenMlsProvider,
) -> (CredentialWithKey, SignatureKeyPair) {
    let basic = BasicCredential::new(identity.to_vec());
    let signer = SignatureKeyPair::new(ciphersuite.signature_algorithm())
        .expect("signature key generation should succeed");
    signer
        .store(provider.storage())
        .expect("signature key should be stored in the test provider");

    (
        CredentialWithKey {
            credential: basic.into(),
            signature_key: signer.public().into(),
        },
        signer,
    )
}

fn two_party_group() -> (
    OpenMlsRustCrypto,
    OpenMlsRustCrypto,
    SignatureKeyPair,
    MlsGroup,
    MlsGroup,
) {
    let alice_provider = OpenMlsRustCrypto::default();
    let bob_provider = OpenMlsRustCrypto::default();
    let ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

    let (alice_credential, alice_signer) =
        credential(b"binary-chat-test-alice", ciphersuite, &alice_provider);
    let (bob_credential, bob_signer) =
        credential(b"binary-chat-test-bob", ciphersuite, &bob_provider);

    let bob_key_package = openmls::prelude::KeyPackage::builder()
        .build(ciphersuite, &bob_provider, &bob_signer, bob_credential)
        .expect("Bob key package should be created");

    let mut alice_group = MlsGroup::new(
        &alice_provider,
        &alice_signer,
        &MlsGroupCreateConfig::default(),
        alice_credential,
    )
    .expect("Alice group should be created");

    let (_, welcome, _) = alice_group
        .add_members(
            &alice_provider,
            &alice_signer,
            std::slice::from_ref(bob_key_package.key_package()),
        )
        .expect("Alice should add Bob");

    alice_group
        .merge_pending_commit(&alice_provider)
        .expect("Alice should merge the add-member commit");

    let welcome_bytes = welcome
        .tls_serialize_detached()
        .expect("Welcome should serialize");
    let welcome_message =
        MlsMessageIn::tls_deserialize_exact(&welcome_bytes).expect("Welcome should deserialize");
    let welcome = match welcome_message.extract() {
        MlsMessageBodyIn::Welcome(message) => message,
        _ => panic!("Expected an MLS Welcome message"),
    };

    let staged_bob = StagedWelcome::new_from_welcome(
        &bob_provider,
        &MlsGroupJoinConfig::default(),
        welcome,
        Some(alice_group.export_ratchet_tree().into()),
    )
    .expect("Bob should stage the Welcome");

    let bob_group = staged_bob
        .into_group(&bob_provider)
        .expect("Bob should join the group");

    (
        alice_provider,
        bob_provider,
        alice_signer,
        alice_group,
        bob_group,
    )
}

fn protocol_message(bytes: &[u8]) -> ProtocolMessage {
    MlsMessageIn::tls_deserialize_exact(bytes)
        .expect("serialized MLS message should deserialize")
        .try_into_protocol_message()
        .expect("message should be a public or private protocol message")
}

#[test]
fn two_independent_clients_exchange_authenticated_ciphertext() {
    let (alice_provider, bob_provider, alice_signer, mut alice, mut bob) = two_party_group();
    let plaintext = b"Binary Chat MLS spike: hello from Alice";

    let ciphertext = alice
        .create_message(&alice_provider, &alice_signer, plaintext)
        .expect("Alice should create an MLS application message")
        .to_bytes()
        .expect("MLS message should serialize");

    let processed = bob
        .process_message(&bob_provider, protocol_message(&ciphertext))
        .expect("Bob should authenticate and process Alice's message");

    match processed.into_content() {
        ProcessedMessageContent::ApplicationMessage(message) => {
            assert_eq!(message.into_bytes(), plaintext);
        }
        _ => panic!("Expected an authenticated application message"),
    }

    assert!(
        bob.process_message(&bob_provider, protocol_message(&ciphertext))
            .is_err(),
        "replayed application message must be rejected"
    );
}

#[test]
fn modified_ciphertext_is_rejected() {
    let (alice_provider, bob_provider, alice_signer, mut alice, mut bob) = two_party_group();
    let ciphertext = alice
        .create_message(&alice_provider, &alice_signer, b"tamper me")
        .expect("Alice should create message")
        .to_bytes()
        .expect("message should serialize");

    let mut tampered = ciphertext;
    let last = tampered.len() - 1;
    tampered[last] ^= 0x01;

    let rejected = match MlsMessageIn::tls_deserialize_exact(&tampered) {
        Err(_) => true,
        Ok(message) => match message.try_into_protocol_message() {
            Err(_) => true,
            Ok(protocol) => bob.process_message(&bob_provider, protocol).is_err(),
        },
    };

    assert!(
        rejected,
        "modified ciphertext must fail decoding, authentication, or group validation"
    );
}

#[test]
fn unrelated_group_cannot_decrypt_another_groups_message() {
    let (alice_provider, _bob_provider, alice_signer, mut alice, _bob) = two_party_group();
    let message = alice
        .create_message(&alice_provider, &alice_signer, b"private to Alice's group")
        .expect("Alice should create message")
        .to_bytes()
        .expect("message should serialize");

    let charlie_provider = OpenMlsRustCrypto::default();
    let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
    let (charlie_credential, charlie_signer) =
        credential(b"binary-chat-unrelated-charlie", suite, &charlie_provider);
    let mut charlie_group = MlsGroup::new(
        &charlie_provider,
        &charlie_signer,
        &MlsGroupCreateConfig::default(),
        charlie_credential,
    )
    .expect("Charlie's unrelated group should be created");

    assert!(
        charlie_group
            .process_message(&charlie_provider, protocol_message(&message))
            .is_err(),
        "a different MLS group must reject the ciphertext"
    );
}
