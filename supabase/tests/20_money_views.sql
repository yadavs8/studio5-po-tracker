-- U3 / migration_014: no double counting across POs; cancelled and draft invoices do not count. Audit C2, C3.
-- Fixtures: PO-X (₹11.8L), PO-Y (₹5.9L). INV-1 ₹1,18,000 on PO-Y. INV-2 ₹2,36,000 on PO-X, CANCELLED.
-- Payment ₹1,00,000 tagged to PO-X but matched to INV-1 (PO-Y). Today is after 60 days for both invoices.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x record; y record;
begin
  select * into x from public.v_po_summary where po_number = 'PO-X';
  select * into y from public.v_po_summary where po_number = 'PO-Y';
  -- C2: the ₹1L is counted once, under the PO whose invoice it paid
  assert x.received_bank = 0,      format('PO-X received should be 0, got %s', x.received_bank);
  assert y.received_bank = 100000, format('PO-Y received should be 1,00,000, got %s', y.received_bank);
  assert x.balance_against_po = 1180000, format('PO-X balance should be 11,80,000, got %s', x.balance_against_po);
  assert y.balance_against_po = 490000,  format('PO-Y balance should be 4,90,000, got %s', y.balance_against_po);
  -- C3: the cancelled invoice is not billed or owed
  assert x.invoiced = 0 and x.invoice_count = 0, format('PO-X should have nothing billed, got %s', x.invoiced);
  assert x.yet_to_invoice = 1180000, format('PO-X yet to invoice should be the full PO, got %s', x.yet_to_invoice);
  assert x.invoice_outstanding = 0, format('PO-X outstanding should be 0, got %s', x.invoice_outstanding);
  assert y.invoice_outstanding = 18000, format('PO-Y outstanding should be 18,000, got %s', y.invoice_outstanding);
end $$;

do $$
declare i record; d record; chase numeric;
begin
  select * into i from public.v_invoice_settlement where invoice_number = 'INV-2';
  assert i.computed_status = 'cancelled', format('INV-2 should show cancelled, got %s', i.computed_status);
  assert i.remaining_balance = 0, format('INV-2 should owe nothing, got %s', i.remaining_balance);

  select * into d from public.v_site_dashboard where site_id = '51111111-0000-0000-0000-000000000001';
  assert d.total_invoiced = 118000, format('site billed should be 1,18,000, got %s', d.total_invoiced);
  assert d.normal_outstanding = 18000, format('site outstanding should be 18,000, got %s', d.normal_outstanding);
  assert d.total_collected = 100000, format('site collected should be 1,00,000, got %s', d.total_collected);

  select amount into chase from public.v_todo where code = 'chase_60';
  assert chase = 18000, format('chase list should hold only INV-1''s 18,000, got %s', chase);
end $$;

-- A tagged payment that is only partly matched elsewhere: the unmatched part stays with its own PO.
do $$
declare v_pay uuid; x numeric; y numeric; total numeric;
begin
  insert into public.payment (site_id, po_id, payment_date, amount_received, utr_or_reference)
  values ('51111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-00000000000a', '2026-10-01', 50000, 'UTR-PART')
  returning payment_id into v_pay;
  insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
  values (v_pay, '11111111-0000-0000-0000-0000000000a1', 10000);
  select received_bank into x from public.v_po_summary where po_number = 'PO-X';
  select received_bank into y from public.v_po_summary where po_number = 'PO-Y';
  assert x = 40000,  format('PO-X should keep the unmatched 40,000, got %s', x);
  assert y = 110000, format('PO-Y should have 1,10,000, got %s', y);
  select sum(received_bank) into total from public.v_po_summary where site_id = '51111111-0000-0000-0000-000000000001';
  assert total = 150000, format('per-PO receipts must add up to the 1,50,000 in the bank, got %s', total);
end $$;

-- Money matched to an invoice that was later cancelled is still money received — everywhere alike.
do $$
declare v_pay uuid; per_po numeric; site_collected numeric;
begin
  insert into public.payment (site_id, payment_date, amount_received, utr_or_reference)
  values ('51111111-0000-0000-0000-000000000001', '2026-10-10', 50000, 'UTR-CANC') returning payment_id into v_pay;
  insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
  values (v_pay, '11111111-0000-0000-0000-0000000000a2', 50000);   -- INV-2, cancelled, on PO-X
  select sum(received_bank) into per_po from public.v_po_summary where site_id = '51111111-0000-0000-0000-000000000001';
  select total_collected into site_collected from public.v_site_dashboard where site_id = '51111111-0000-0000-0000-000000000001';
  -- (runs after the partial-payment block above: bank now holds 1,00,000 + 50,000 + 50,000)
  assert per_po = (select sum(amount_received) from public.payment), format('per-PO receipts must equal the bank (%s), got %s', (select sum(amount_received) from public.payment), per_po);
  assert per_po = 200000, format('per-PO receipts should be 2,00,000, got %s', per_po);
  -- collected = matched money: 1,00,000 + 10,000 (partial) + 50,000 (on the cancelled invoice)
  assert site_collected = 160000, format('site collected should be 1,60,000, got %s', site_collected);
  assert (select remaining_balance from public.v_invoice_settlement where invoice_number = 'INV-2') = 0, 'cancelled invoice owes nothing';
end $$;
reset role;
