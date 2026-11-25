# Phase 1.7D — SQLCipher Android 4.20.0 source and license review

**Review date:** 2026-11-24  
**Candidate:** `net.zetetic:sqlcipher-android:4.20.0`  
**Scope:** Public source tag, build configuration, pinned submodules, published POM metadata, and source license declarations.  
**Decision:** **NO-GO for production adoption** pending exact AAR verification and independent review.  
**Runtime impact:** None. No Binary Chat dependency, native code, storage, API, schema, or message flow was changed.

## 1. Immutable source identity

The official Android repository tag `v4.20.0` resolves to:

- Annotated tag object: `fd9265cfca1e419c1887752b9fb754232628807f`
- Source commit: `94bdf2589942b11a53b7d9a005d5c1e66920d4e8`
- GitHub tag verification: `verified: true`, reason `valid`
- Tagger: Nick Parker / Zetetic
- Tag date: 2026-10-27

Pinned submodules in that exact source commit:

| Submodule | Immutable commit |
|---|---|
| SQLCipher core | `355d4db92d3404e71faa8088d071a71d767807f4` |
| LibTomCrypt | `476a9579ae94f32b9ea9e2747bfb04b302370259` |

The source tag signature authenticates the tag object under GitHub's verification result. It does **not** prove that the Maven Central AAR was built from this exact source commit or these exact submodules.

## 2. Build and platform configuration observed in source

The pinned Android source declares:

- Minimum Android API: 23
- Compile SDK: 36
- Target SDK: 36
- Android NDK: 25.2.9519653
- Java toolchain: 17
- Android Gradle Plugin: 9.3.0
- AndroidX SQLite: 2.7.0
- Room test dependency: 3.0.1
- Release native ABI filters are not explicitly restricted in the inspected release build type; repository compatibility documentation lists `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`.

The root build defines a `generateAmalgamation` task. When the generated amalgamation is absent, it initializes the SQLCipher core submodule and runs its configure/make steps to generate `sqlite3.c` and `sqlite3.h`. The Android library uses an NDK build file that includes the SQLCipher core's `Android.mk`.

This describes the checked-in build recipe, not a reproduced build. No CI artifact was built from this pinned source during this review.

## 3. Published Maven metadata

Maven Central's published POM identifies:

- `net.zetetic:sqlcipher-android:4.20.0`
- Packaging: AAR
- Compile dependency: `org.jetbrains.kotlin:kotlin-stdlib:2.2.10`
- Runtime dependency: `androidx.sqlite:sqlite:2.7.0`
- SCM URL: `https://github.com/sqlcipher/sqlcipher-android.git`
- License URL: Zetetic SQLCipher license page

The official vendor integration instructions also list AndroidX SQLite 2.7.0 and require loading the native library with `System.loadLibrary("sqlcipher")`.

**Verified in the supplied archive follow-up (2026-11-25):** the exact user-supplied AAR bytes, SHA-256, ZIP structure, JNI library names, ELF machine types, ABI directories, and ELF build IDs were inspected. The detached Maven signature/checksum metadata, Gradle module metadata, publisher provenance, and source-to-binary correspondence remain unverified. The AAR contains no embedded publisher signature or license-notice files.

## 4. Source license observations

The exact Android repository tag includes a Zetetic BSD-style license. The pinned SQLCipher core commit also includes a Zetetic BSD-style license. Its SQLite license file states that the primary SQLite implementation is public domain and that some build/configuration scripts have separate BSD-style terms.

The pinned LibTomCrypt submodule's `LICENSE` file presents **dual licensing**: public domain or WTFPL v2. This review does not determine which licensing path applies to every file compiled into the Android AAR, nor whether the package contains additional third-party components or notices.

Before adoption, legal review must resolve the selected LibTomCrypt licensing basis and verify the complete binary distribution notice set. Do not infer that the entire AAR is covered by one license merely because the top-level repository contains a BSD-style license.

## 5. Findings and risk

1. **Source authenticity — partial pass.** The upstream annotated tag signature verifies, and exact submodule commits are pinned. This is useful source identity evidence only.
2. **Artifact-to-source correspondence — unresolved.** No signed attestation or reproducible build links the published Maven AAR to the inspected source commit and submodules.
3. **Binary inspection — partial pass.** The supplied AAR contains the four expected ABI directories and Android ELF shared libraries with matching machine types and NDK r25c metadata. Build IDs are recorded in Section 8. Exported-symbol review, detached publisher metadata, and complete notice/dependency closure remain outstanding.
4. **License closure — unresolved.** The LibTomCrypt dual-license declaration requires an explicit legal determination for the actual compiled/distributed contents. SQLite's bundled notices also need to be checked against the AAR.
5. **Reproducibility — not demonstrated.** The source build recipe is discoverable, but no clean-room build and byte-for-byte or explainable comparison has been completed.
6. **Security validation — not performed.** No independent source audit, SBOM, vulnerability review, or physical-device storage lifecycle test has been completed.

## 6. Required next evidence

- [ ] Download the exact Maven Central AAR from an independently controlled environment.
- [ ] Record SHA-256 and compare it with repository-provided checksum/signature metadata, if available.
- [ ] Inspect AAR contents, all `jni/<abi>/*.so` files, ELF metadata, exported symbols, build IDs, and embedded licenses.
- [ ] Retrieve and inspect the POM, Gradle module metadata, dependency graph, and all published signatures/checksums.
- [ ] Rebuild from source commit `94bdf2589942b11a53b7d9a005d5c1e66920d4e8` with SQLCipher core `355d4db92d3404e71faa8088d071a71d767807f4` and LibTomCrypt `476a9579ae94f32b9ea9e2747bfb04b302370259`; record toolchain/container provenance and compare outputs.
- [ ] Resolve LibTomCrypt license selection and full binary notice obligations with legal review.
- [ ] Generate an SBOM and complete vulnerability review for the actual AAR and transitive dependencies.
- [ ] Obtain independent security review before adoption.

## 7. Final decision

**NO-GO remains in force.** The public source tag and build recipe are identifiable, but this does not authenticate the separately published AAR. Binary Chat must not add this dependency to Gradle or enable persistent MLS state until the exact artifact, license, reproducibility, and independent security gates are evidenced and approved.


## 8. Supplied AAR archive inspection — 2026-11-25

The exact user-supplied file `sqlcipher_android_4.20.0.aar` was materialized from the user's Library and inspected locally.

- File size: **4,050,842 bytes**.
- SHA-256: `1e57857adfd29e2f5ddb4686e1e5ec6659920220d4bf182fdb5ef085b5577100`.
- ZIP integrity test: passed; 17 entries.
- The archive contains `classes.jar`, `AndroidManifest.xml`, AAR metadata, ProGuard rules, and four JNI libraries.
- Manifest minimum SDK: 23. AAR metadata minimum compile SDK: 36.
- Native library details:

| ABI directory | ELF machine | NDK metadata | ELF Build ID |
|---|---|---|---|
| `arm64-v8a` | AArch64, ELF64 | NDK r25c (9519653) | `1b348706fdfc4606ad9f48c4ac0ff32a7c668004` |
| `armeabi-v7a` | ARM EABI5, ELF32 | NDK r25c (9519653) | `1167e1d930b71c86a75780d2ff410fbf45921f56` |
| `x86` | Intel 80386, ELF32 | NDK r25c (9519653) | `ceaabb9fcee70dedb7c87c93d0542ae10d2aa5ec` |
| `x86_64` | AMD x86-64, ELF64 | NDK r25c (9519653) | `bb0c7af1a27eb135809da9327280970f84ca9108` |

The AAR contains no publisher signature or license-notice files. A successful ZIP test and matching ELF ABI metadata establish archive integrity and structure only; they do not prove publisher authenticity or that the binaries were built from the inspected source commit.

### Remaining blockers

- [ ] Validate detached Maven Central checksum/signature metadata for the exact downloaded bytes.
- [ ] Inspect Maven POM, Gradle module metadata, dependency graph, and transitive dependency licenses.
- [ ] Review exported native symbols and binary strings against the pinned source build.
- [ ] Reproduce the AAR from source commit `94bdf2589942b11a53b7d9a005d5c1e66920d4e8` and pinned submodules, or obtain credible signed vendor build provenance.
- [ ] Resolve LibTomCrypt license selection and verify complete binary redistribution notices.
- [ ] Generate SBOM and vulnerability report for the exact AAR and dependencies.
- [ ] Obtain independent security review and physical-device storage lifecycle validation.

**Decision remains NO-GO.** No Gradle dependency, native code, app storage, or runtime behavior was changed by this inspection.
