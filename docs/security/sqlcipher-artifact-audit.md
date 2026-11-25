# Phase 1.7B — SQLCipher artifact and license audit

**Status:** Preliminary source review; **NO-GO for production adoption**  
**Date:** 2026-11-24  
**Scope:** Candidate encrypted SQLite storage for the future native MLS state store  
**No runtime dependencies or code are added by this review.**

## 1. Decision summary

SQLCipher Community Edition 4.20.0 is a plausible cross-platform candidate, with separate maintained Android and Apple distribution projects. It is not yet approved for Binary Chat production use.

Reasons the gate remains closed:
- Android's published artifact and public source are discoverable, but Binary Chat has not yet pinned and independently reproduced the exact AAR, transitive dependency graph, native ABI contents, submodule revisions, build provenance, and checksums.
- The Apple Swift package is official and has a 4.20.0 release. Its pinned `Package.swift` declares a binary XCFramework target and a SHA-256 checksum; GitHub release metadata reports the same digest for the 50,874,674-byte archive. This establishes a useful integrity check, but not source transparency, reproducible build provenance, code-signing assurance, or a review of the binary contents and license notices.
- No reproducible build, SBOM, vulnerability review, independent source audit, or physical-device integration tests have been performed.
- SQLCipher encrypts a database using a passphrase; it does not itself provide the Android Keystore/iOS Keychain key-wrapping and account/device lifecycle design required by Binary Chat.

Do not add either package to the app, native bridge, Cargo, Gradle, or Swift package manifests until these gates are cleared.

## 2. Candidate inventory

| Platform | Candidate | Observed release | Integration | Initial compatibility |
|---|---|---|---|---|
| Android | net.zetetic:sqlcipher-android | 4.20.0 | Maven Central AAR | API 23+; armeabi-v7a, x86, x86_64, arm64-v8a |
| Apple | sqlcipher/SQLCipher.swift | 4.20.0 | Swift Package Manager | Apple platform package; exact deployment targets and XCFramework slices must be verified from the pinned tag/archive |

Official candidate references:
- Android repository: https://github.com/sqlcipher/sqlcipher-android
- Android release: https://github.com/sqlcipher/sqlcipher-android/releases/tag/v4.20.0
- Maven Central: https://central.sonatype.com/artifact/net.zetetic/sqlcipher-android/4.20.0
- Apple repository: https://github.com/sqlcipher/SQLCipher.swift
- Apple release: https://github.com/sqlcipher/SQLCipher.swift/releases/tag/4.20.0

Android's upstream integration guide lists:
- net.zetetic:sqlcipher-android:4.20.0@aar
- androidx.sqlite:sqlite:2.7.0
- Native library load via System.loadLibrary("sqlcipher")
- Minimum Android API 23 and four listed ABIs.

Apple's pinned 4.20.0 `Package.swift` sets iOS 12 as its minimum platform, uses a SwiftPM `binaryTarget`, and pins `SQLCipher.xcframework.zip` with SHA-256 `1505174fe7f8a0fe81d6ebf87a64b17701b500c12a445ef6b68b9159f012d747`. GitHub release metadata reports the same SHA-256 and an archive size of 50,874,674 bytes. The package's test target defines `SQLITE_HAS_CODEC`; the production app must still verify the required build setting and linkage. The archive itself, XCFramework slices, signatures, build provenance, and license notices have not yet been inspected.

## 3. Release-channel assessment

- SQLCipher 4.20.0 is the latest stable 4.x candidate visible in the reviewed release listings.
- SQLCipher 5.0.0-beta.1 is explicitly marked beta-only and not production-ready. Do not adopt it for this project.
- Pin exact 4.20.0 tags/versions, never a moving branch or floating dependency range.
- Confirm both platform artifacts use the same intended SQLCipher core version and compatible format/settings before sharing databases or test fixtures.
- Cross-platform encrypted database interoperability must be demonstrated with files created on Android and opened on iOS, and vice versa.

## 4. License and attribution

The Community Edition license is BSD-style and requires retaining the copyright/license conditions in source redistributions and reproducing the notice and disclaimer in binary distributions' accompanying materials. Zetetic also states that the application must provide an accessible attribution/license-grant location, such as an in-app licensing/about screen or linked product documentation.

Required before adoption:
1. Fetch and archive LICENSE files from the exact pinned Android and Apple tags.
2. Inspect all bundled native libraries and transitive dependencies for their own licenses/notices.
3. Generate a license inventory/SBOM for the exact release artifacts.
4. Add the required SQLCipher attribution and notices to an accessible app licensing screen and distribution materials.
5. Obtain legal review for the actual distribution/commercial model; do not assume Community Edition terms are identical to commercial packages.

## 5. Artifact/source integrity gates

### Android
- Download the exact Maven Central AAR for 4.20.0 and record SHA-256. The GitHub `v4.20.0` source tag is shown as signed with a verified committer signature; this does not attest to the separately published Maven AAR.
- Verify Maven POM, Gradle module metadata, signatures/checksums if published, and all transitive dependencies.
- Inspect the AAR's classes, JNI libraries, ABI set, ELF metadata, exported symbols, and embedded license notices.
- The Android `v4.20.0` tag resolves to annotated tag object `fd9265cfca1e419c1887752b9fb754232628807f`; its checked-out SQLCipher core submodule is `355d4db92d3404e71faa8088d071a71d767807f4` and LibTomCrypt submodule is `476a9579ae94f32b9ea9e2747bfb04b302370259`. These immutable revisions are now recorded, but their source contents and build relationship to the Maven AAR remain unaudited.
- Reproduce the release build where feasible and compare binary outputs or document why exact reproducibility is not possible.
- Confirm minSdk 23 is compatible with the app's declared minSdk and supported devices.

### Apple
- The Apple `4.20.0` tag resolves to annotated tag object `900525bc279abae927d487cbea2f76296c5a2afb`. Download the full source archive and binary artifacts; record the manifest-pinned SHA-256 above and independently recompute it over the downloaded XCFramework archive.
- Inspect Package.swift, XCFramework slices, architectures, minimum OS versions, code signatures, module maps, and linker flags. The manifest checksum and release asset digest currently match, but this does not establish who built the binary or from which source.
- Determine whether binary-only targets prevent meaningful source-level review or reproducible builds; if so, keep NO-GO unless independent vendor assurance and artifact attestation are sufficient.
- Verify no unexpected network/runtime downloads or scripts are executed during package resolution/build.
- Confirm iOS simulator and physical-device architecture support separately.

### Both
- Produce a signed-off dependency manifest and SBOM with immutable hashes.
- Review advisories, changelogs, upstream issue tracker, and security response process for the pinned release.
- Confirm debug/release configurations do not disable encryption or silently link system SQLite.
- Inspect crash/log output and memory handling around keying operations.
- Verify WAL, journal, temporary files, shared-memory files, exports, backups, and migration paths do not leave plaintext copies.

## 6. Key management boundary

SQLCipher's database passphrase must be a cryptographically random per-install secret. It must never be derived from a phone number, OTP, password, account ID, device ID, or a hard-coded application constant.

- Android: wrap the random database key using an Android Keystore AES-GCM key; inspect whether the key is hardware-backed and record actual device capability without assuming StrongBox.
- iOS: wrap the random database key with a Keychain-protected key/data item using a device-only accessibility policy. Evaluate passcode requirements and lock-state behavior on physical devices.
- Rust remains the sole owner of database key bytes and MLS state. JS must never receive either.
- Keystore/Keychain invalidation, passcode changes, backup/restore, reinstall, app data clearing, account switching, and device revocation must produce explicit recovery/deletion states.
- Never store the database key in preferences, localStorage, IndexedDB, files beside the database, environment variables, or ordinary app configuration.
- SQLCipher's own KDF/passphrase feature is not a substitute for platform key custody.

## 7. Required test matrix

- Android physical devices: API 23 minimum where available, current Android, at least one ARM64 device, hardware-backed Keystore inspection, lock/reboot, backup and device transfer, app data clear, uninstall/reinstall.
- iOS physical devices: supported minimum OS, current iOS, device lock/unlock, passcode change/removal, Keychain accessibility, backup/restore, app offload, uninstall/reinstall.
- Cross-platform: Android-created DB opens on iOS and vice versa with identical schema/data and no plaintext temp files.
- Wrong key, corrupted DB, interrupted transaction, WAL recovery, storage-full, concurrent access, migration rollback, and key rotation.
- Backup inspection must prove encrypted DB artifacts are excluded or remain encrypted and key material is never backed up.
- Verify a missing/invalidated platform key causes recovery-required; never silently creates a new empty MLS identity.
- Confirm all database, WAL, SHM, journal, temp, export, and crash artifacts are encrypted or safely excluded.

## 8. Go / no-go checklist

- [ ] Exact Android 4.20.0 AAR SHA-256 and provenance archived.
- [ ] Android POM, transitive dependencies, JNI/ABI, source tag (`fd9265cf...`), SQLCipher submodule (`355d4db9...`), and LibTomCrypt submodule (`476a9579...`) audited.
- [ ] Exact Apple 4.20.0 package tag (`900525bc...`), XCFramework binaries, checksums, signatures, and deployment targets audited.
- [ ] Binary-only Apple artifact review blocker resolved with adequate assurance.
- [ ] Exact Community Edition licenses and all third-party notices reviewed.
- [ ] In-app attribution plan approved.
- [ ] SBOM and vulnerability review completed.
- [ ] Cross-platform database format compatibility proven.
- [ ] Keystore/Keychain wrapping implementation threat-reviewed.
- [ ] Android and iOS physical-device lifecycle tests passed.
- [ ] Independent security review signed off.

**Current verdict: NO-GO.** This is a candidate inventory and audit plan, not a dependency approval. Phase 1.7C must not begin production storage implementation until every applicable gate above has an evidence artifact and an explicit review decision.


## 9. Phase 1.7B follow-up — exact release metadata review (2026-11-25)

This follow-up records public release metadata and source-tag evidence gathered after the preliminary audit. It does **not** constitute artifact extraction, binary inspection, independent provenance verification, or security approval.

### Android 4.20.0

- GitHub release: `v4.20.0`, published 2026-10-27; release metadata contains no attached binary assets. The Community AAR is separately published to Maven Central.
- Annotated source tag object: `fd9265cfca1e419c1887752b9fb754232628807f`; target source commit: `94bdf2589942b11a53b7d9a005d5c1e66920d4e8`.
- GitHub's tag verification API reports the Android tag signature as **verified / valid**. This authenticates the signed source tag under GitHub's verification result; it does not prove that the Maven AAR was built from that commit.
- The v4.20.0 source README confirms Android API 23+ and ABIs `armeabi-v7a`, `x86`, `x86_64`, and `arm64-v8a`. It documents explicit loading of `libsqlcipher.so`.
- Maven Central's published POM identifies packaging as AAR and declares compile dependency `org.jetbrains.kotlin:kotlin-stdlib:2.2.10` plus runtime dependency `androidx.sqlite:sqlite:2.7.0`. The upstream README also instructs consumers to include `androidx.sqlite:sqlite:2.7.0`.
- The source repository uses SQLCipher core and LibTomCrypt Git submodules. The tag's submodule pointers are recorded in Section 5, but the exact Maven AAR has not been unpacked or matched to these source revisions.
- The release tag and source tree are useful provenance evidence, but **the exact Maven AAR SHA-256, downloaded bytes, Gradle module metadata, signatures, JNI contents, ELF build IDs, exported symbols, and embedded notices remain unverified**. A Maven POM and a signed Git tag are not substitutes for an AAR checksum/provenance chain.

### Apple 4.20.0

- GitHub release metadata identifies `SQLCipher.xcframework.zip` as 50,874,674 bytes and reports SHA-256 `1505174fe7f8a0fe81d6ebf87a64b17701b500c12a445ef6b68b9159f012d747`.
- The exact 4.20.0 `Package.swift` declares a `binaryTarget` URL for that archive and the same checksum. This establishes consistency between the package manifest and release metadata, but the archive bytes were not downloaded and independently hashed in this review.
- The annotated tag object is `900525bc279abae927d487cbea2f76296c5a2afb`, targeting source commit `e7415c5e6b4fd9b78874bb956aad8a42b08e9966`. GitHub's tag verification API reports **unknown_key / not verified** for this signature. Do not interpret the presence of a PGP signature as verified authenticity.
- The package manifest declares iOS 12 minimum and a binary-only XCFramework target. The README requires `SQLITE_HAS_CODEC=1` for Swift consumers (or `-DSQLITE_HAS_CODEC` for Objective-C consumers); this must be checked in both Debug and Release app configurations if the package is ever adopted.
- The source LICENSE.md contains BSD-style attribution and binary redistribution notice requirements. This is a source license review only; the archive's full notices and third-party component inventory have not been inspected.

### Updated decision

**NO-GO remains unchanged for both platforms.**

The immediate evidence blockers are:
1. Obtain the exact Maven Central AAR and independently compute SHA-256; retain the downloaded artifact and repository metadata in an audit record.
2. Compare AAR classes/JNI libraries/ABIs and native build metadata against the signed Android source tag and pinned submodules; reproduce the release build or obtain credible vendor build provenance.
3. Obtain the Apple XCFramework archive, independently recompute the declared SHA-256, inspect every slice/architecture/minimum OS/linkage/signature and bundled notice, and resolve the unverified tag-signature identity through an independently trusted vendor key.
4. Generate a dependency/SBOM and vulnerability inventory for the exact transitive dependency graph and native payloads.
5. Obtain independent security review and complete physical-device lifecycle tests before any dependency or production persistence implementation is introduced.

No application source, native bridge, Gradle/Swift manifest, Cargo manifest, lockfile, or runtime dependency was changed by this audit follow-up.
