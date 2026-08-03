# Nexi Client and Client Details Test Proof

Date: 2026-08-02
Mode: isolated in-memory tenant `nexi-client-details-suite-20260802`
Data: fake `.test` records only; no Firestore, customer, import, message, map, or phone service was contacted.

The executable permanent regression suite is [nexi-client-details-suite.test.mjs](../../apps/server/test/nexi-client-details-suite.test.mjs). It uses the real Nexi tool loop, the production client tool set, approval queue, and native in-memory provider.

| # | Tenant wording under test | Expected and asserted result |
|---|---|---|
| 1 | `Find client Avery Redwood` | Exact client lookup. |
| 2 | `Avery Redwood's client record` | Short client-record wording resolves to the correct client. |
| 3 | `What is Avery Redwood's address?` | Exact stored address and Maps offer. |
| 4 | `What is Avery Redwood's telephone number?` | Exact stored phone and call offer. |
| 5 | `How many properties does Avery Redwood have?` | One saved fake property only. |
| 6 | `What is Briar Stone's phone number?` | Missing phone is stated; none is invented. |
| 7 | `What is Briar Stone's email?` | Missing email is stated; none is invented. |
| 8 | Incomplete create with name and email only | Missing address and telephone clarification; no write. |
| 9 | Complete create | Explicit confirmation required; no early write. |
| 10 | `no` to complete create | Rejection leaves no record. |
| 11 | `yes` to complete create | Client, address, email, phone, and primary property are saved. |
| 12 | `Do you have Harper Tset?` | Misspelling creates no invented record or fact. |
| 13 | `Delete client Drew Duplicate` | Duplicate exact names require clarification; neither record changes. |
| 14 | `Change Avery Redwood ZIP code to 29990` | Explicit confirmation required; no early write. |
| 15 | `yes` to ZIP change | Only Avery's client and property ZIP change; imported record stays unchanged. |
| 16 | Address follow-up | Corrected ZIP is returned. |
| 17 | Create with corrected email | Literal corrected email is preserved in the confirmation draft. |
| 18 | `Delete client Julian Delete Test` | Explicit deletion confirmation required; no early delete. |
| 19 | `yes` to deletion | Only the NexTeam-created fake client and its property are removed. |
| 20 | `Delete client Casey Imported` | Imported fake legacy record is protected and remains present. |

## Repairs made while running the suite

1. A client update now passes the original, literal request into the approved client-address rail. This makes focused corrections such as a ZIP-only change safe and repeatable.
2. Duplicate client names can no longer be silently selected for an update or deletion. Only an opaque client ID or a single exact-name match can proceed.
3. Client-detail questions are prioritized before generic cross-rail job matching in the Nexi gateway.
4. Clarification messages from client update and deletion tools are returned to the user instead of falling through to an unrelated response.

## Final command and result

```text
node --test apps/server/test/nexi-client-details-suite.test.mjs
tests: 21 (one parent suite plus 20 scenarios)
pass: 21
fail: 0
```
