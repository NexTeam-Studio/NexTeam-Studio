# Checkpoint Walkthrough Guide

Artifacts:
- `01-request-to-quote.mp4`
- `02-quote-to-job.mp4`
- `03-job-to-payment.mp4`

Known walkthrough limits and rough edges shown honestly in this pass:
- The local review shell is still locked to the local OWNER bypass user. There is no honest in-shell technician role switcher right now, so the recording shows the admin notification after visit completion but cannot directly click a technician UI and fail the close/invoice action from that same shell.
- Visit reminder records are visible in the Jobs UI, but the full 1-day email body and 1-hour SMS body are not surfaced in the current local screen. The recording shows the reminder records and the carried-forward access fields, not the exact rendered reminder copy.
- After the quote deposit is collected, `Close and Invoice` moves the invoice straight into `partial_pay`, which locks the draft editor before any pre-send edit. This is shown as a real rough edge in `03-job-to-payment.mp4`.
- Receipt review send stays `ready_to_send` locally because email/SMS delivery is not configured on this machine. The recording shows the blocked state instead of faking a successful local send.
- The client rollup currently shows linked work counts and modules, not a richer billing-history ledger timeline yet. The recording ends on the real current rollup surface.

Timestamp guide:
1. `01-request-to-quote.mp4` `0:01` - Public Aquatrace request form loads. Piece 1 intake entry point.
2. `01-request-to-quote.mp4` `0:02` - Request fields are filled, including gate code, pet flag, and pool-specific intake fields. Piece 1 intake field capture.
3. `01-request-to-quote.mp4` `0:03` - Request is submitted through the real public form. Piece 1 request creation.
4. `01-request-to-quote.mp4` `0:05` - NexOps request detail opens. Piece 1 request review surface.
5. `01-request-to-quote.mp4` `0:06` - Match review is marked complete. Piece 1 admin review step.
6. `01-request-to-quote.mp4` `0:07` - Downstream propagation table shows the gate code moving across request, quote, job, visit, and invoice surfaces. Piece 1 field propagation.
7. `01-request-to-quote.mp4` `0:09` - Request is converted to quote. Piece 1 to Piece 2 handoff.
8. `01-request-to-quote.mp4` `0:11` - Quote composer opens. Piece 2 quote build surface.
9. `01-request-to-quote.mp4` `0:12` - Custom line item is added. Piece 2 custom line support.
10. `01-request-to-quote.mp4` `0:12` - Signature, deposit, and card-on-file toggles are enabled, with discount, tax, and terms set. Piece 2 approval and pricing rules.
11. `01-request-to-quote.mp4` `0:14` - Quote is saved. Piece 2 draft persistence.
12. `01-request-to-quote.mp4` `0:16` - Quote is marked sent and a live client approval link is generated. Piece 2 delivery handoff.

13. `02-quote-to-job.mp4` `0:01` - Client-facing quote approval page opens in the NexPortal-style shell. Piece 2 client approval surface.
14. `02-quote-to-job.mp4` `0:02` - Drawn signature, deposit details, and card-on-file authorization are entered. Piece 2 approval gate with drawn signature default.
15. `02-quote-to-job.mp4` `0:04` - Client approval completes successfully. Piece 2 client commercial approval.
16. `02-quote-to-job.mp4` `0:06` - Approved quote is visible back in NexOps. Piece 2 approved status proof.
17. `02-quote-to-job.mp4` `0:07` - Quote converts to a job. Piece 2 to Piece 3 handoff.
18. `02-quote-to-job.mp4` `0:09` - Job lands as `Unscheduled`. Piece 3 derived job-state entry point.
19. `02-quote-to-job.mp4` `0:11` - Visit is scheduled. Piece 3 visit scheduling.
20. `02-quote-to-job.mp4` `0:12` - Reminder records are visible on the job. Piece 3 reminder rail, with the note above that full reminder body text is not surfaced in this UI yet.
21. `02-quote-to-job.mp4` `0:14` - Visit is completed and the admin-only follow-up alert appears. Piece 3 close/invoice notification gate.

22. `03-job-to-payment.mp4` `0:01` - Job is reopened for closeout. Piece 5 closeout flow start.
23. `03-job-to-payment.mp4` `0:02` - `Close and Invoice` creates the invoice record. Piece 5 close-and-invoice action.
24. `03-job-to-payment.mp4` `0:04` - Invoice detail opens. Piece 5 invoice surface.
25. `03-job-to-payment.mp4` `0:05` - Rough edge: the invoice draft editor is already locked because deposit carryover moved the invoice out of `draft`. This is a real current-state defect against the intended "edit before send" flow.
26. `03-job-to-payment.mp4` `0:07` - Invoice is sent via the built-in `mark_sent` mode. This is deliberate for local review because the comms rail is not configured on this machine.
27. `03-job-to-payment.mp4` `0:08` - Saved card from quote approval is reused to collect the remaining balance. Pieces 4-5 saved-card reuse.
28. `03-job-to-payment.mp4` `0:13` - Rough edge: receipt review stays blocked locally because email/SMS delivery is not configured. The review remains `ready_to_send` instead of fully sending.
29. `03-job-to-payment.mp4` `0:14` - Payments workspace shows the paid invoice. Pieces 4-5 payment ledger state.
30. `03-job-to-payment.mp4` `0:16` - Client rollup reflects the linked quote, job, and invoice, while still showing the current limitation that billing history is not yet a richer ledger timeline.
