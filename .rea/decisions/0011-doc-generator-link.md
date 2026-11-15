# 0011 — The doc generator records its PIs and tax invoices in the tracker

Status: accepted (2026-11-15). Owner request: "when I generate a PI or invoice it gets added … under the right project".

- **Who writes:** the doc generator's server (on the owner's PC, service-role key), only through three
  `SECURITY DEFINER` functions granted to `service_role` alone (`link_generated_document`,
  `attach_generated_file`, `cancel_generated_document`, migration_017). No policy is loosened; signed-in
  users and the public key cannot call them.
- **Masters:** the tracker's client/site list is the master; the doc generator picks a site from it.
  The doc generator owns PI / invoice numbers; the tracker stores them (still unique per site).
- **Idempotent:** each record carries `source_ref = docgen:<type>:<number>`; a retry (offline queue) returns
  the existing row. A number already typed in by hand for that site is refused, not merged.
- **Round off:** doc generator invoices are rounded to the rupee (doc-gen decision 0003). `tax_invoice.round_off`
  (< ₹1) keeps taxable + GST + round off = total, and the Tally agent books it to the Round Off ledger so the
  voucher balances. Rejected: hiding the paise in GST (wrong GST) or storing the unrounded total (₹0.47 owed forever).
- **Void:** PI → new status `cancelled` (out of open PIs, statements and PO linking); invoice → `cancelled`.
  Refused, with a plain reason, when the PI is converted or linked to a PO, or the invoice has payments,
  deductions, or is in Tally — those are fixed in the tracker by hand.
- **Out of scope:** vendor POs and challans from the doc generator stay out of the tracker (its POs are
  orders *from* clients). "Order received for this PI" is step 2.
