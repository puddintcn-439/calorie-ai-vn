# Dependency Audit Follow-up

Date: 2026-06-12

Context: `npm audit fix` was run without `--force`. It applied only safe lockfile updates and did not change direct dependency ranges.

## Before Safe Fix

Initial audit result:

- Moderate: 8
- High: 1
- Critical: 1
- Total: 10

| Package | Severity | Dependency path | Affected versions | Fix available | Breaking |
| --- | --- | --- | --- | --- | --- |
| `@google-cloud/firestore` | moderate | `backend -> firebase-admin -> @google-cloud/firestore -> google-gax` | `7.5.0-pre.0 || 7.6.0 - 7.11.6` | `firebase-admin` major change | yes |
| `@google-cloud/storage` | moderate | `backend -> firebase-admin -> @google-cloud/storage -> retry-request / teeny-request / uuid` | `2.2.0 - 2.5.0 || >=5.19.0` | safe transitive update partly available | no for lockfile update, yes for full clear |
| `@grpc/grpc-js` | high | `backend -> firebase-admin -> @google-cloud/firestore -> google-gax -> @grpc/grpc-js` | `1.14.0 - 1.14.3` | safe transitive update | no |
| `firebase-admin` | moderate | direct backend dependency | `12.1.1 - 13.10.0` | `firebase-admin@14.0.0` in initial audit | yes |
| `gaxios` | moderate | `backend -> firebase-admin -> @google-cloud/storage/google-auth-library -> gaxios` | `6.4.0 - 6.7.1` | transitive update partly available | no for some paths, yes for full clear |
| `google-gax` | moderate | `backend -> firebase-admin -> @google-cloud/firestore -> google-gax` | `4.0.5-experimental - 4.6.1` | `firebase-admin` major change | yes |
| `retry-request` | moderate | `backend -> firebase-admin -> @google-cloud/storage/google-gax -> retry-request` | `7.0.0 - 7.0.2` | `firebase-admin` major change | yes |
| `shell-quote` | critical | `mobile -> react-native/expo dev tooling -> react-devtools-core -> shell-quote` | `1.1.0 - 1.8.3` | safe transitive update | no |
| `teeny-request` | moderate | `backend -> firebase-admin -> @google-cloud/storage/retry-request -> teeny-request` | `3.9.1 - 9.0.0` | `firebase-admin` major change | yes |
| `uuid` | moderate | `backend -> firebase-admin -> Google Cloud deps -> uuid` | `<11.1.1` | `firebase-admin` major change for full clear | yes |

## Safe Fix Applied

`npm audit fix` without force updated only `package-lock.json`.

Notable lockfile changes:

- `@grpc/grpc-js`: `1.14.3` -> `1.14.4`
- `@google-cloud/storage`: `7.19.0` -> `7.21.0`
- `shell-quote`: `1.8.3` -> `1.8.4`
- `uuid`: hoisted to `9.0.1` for currently resolvable transitive paths
- Removed nested duplicate `uuid@9.0.1` entries from several transitive dependency nodes

## After Safe Fix

Remaining audit result:

- Moderate: 8
- High: 0
- Critical: 0
- Total: 8

| Package | Severity | Dependency path | Affected versions | Fix available | Breaking |
| --- | --- | --- | --- | --- | --- |
| `@google-cloud/firestore` | moderate | `backend -> firebase-admin -> @google-cloud/firestore -> google-gax` | `7.5.0-pre.0 || 7.6.0 - 7.11.6` | `firebase-admin@10.3.0` per npm audit output | yes |
| `@google-cloud/storage` | moderate | `backend -> firebase-admin -> @google-cloud/storage -> retry-request / teeny-request` | `2.2.0 - 2.5.0 || >=5.19.0` | `firebase-admin@10.3.0` per npm audit output | yes |
| `firebase-admin` | moderate | direct backend dependency | `7.0.0 - 8.2.0 || >=11.0.0` | `firebase-admin@10.3.0` per npm audit output | yes |
| `gaxios` | moderate | `backend -> firebase-admin -> @google-cloud/storage/google-auth-library -> gaxios` | `6.4.0 - 6.7.1` | transitive path remains through Firebase/Google deps | yes for full clear |
| `google-gax` | moderate | `backend -> firebase-admin -> @google-cloud/firestore -> google-gax` | `4.0.5-experimental - 4.6.1` | `firebase-admin@10.3.0` per npm audit output | yes |
| `retry-request` | moderate | `backend -> firebase-admin -> @google-cloud/storage/google-gax -> retry-request` | `7.0.0 - 7.0.2` | `firebase-admin@10.3.0` per npm audit output | yes |
| `teeny-request` | moderate | `backend -> firebase-admin -> @google-cloud/storage/retry-request -> teeny-request` | `3.9.1 - 9.0.0` | `firebase-admin@10.3.0` per npm audit output | yes |
| `uuid` | moderate | `backend -> firebase-admin -> Google Cloud deps -> uuid` | `<11.1.1` | `firebase-admin@10.3.0` per npm audit output | yes |

## Recommended Follow-up

Do not run `npm audit fix --force` blindly.

Recommended path:

1. Review current Firebase Admin usage in backend.
2. Decide whether to upgrade or downgrade `firebase-admin` based on supported APIs and runtime compatibility.
3. Test Firebase auth/admin flows explicitly, not just TypeScript build.
4. Re-run:

```bash
npm audit
npm --workspace apps/backend run build
npm --workspace apps/mobile run lint
npm run test
```

5. If Firebase integration behavior changes, add focused tests before merging.
