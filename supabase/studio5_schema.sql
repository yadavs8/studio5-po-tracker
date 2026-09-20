-- ============================================================================
-- STUDIO5 PROJECT, BILLING & RECEIVABLES SYSTEM
-- PostgreSQL / Supabase schema — Phase 1
-- Implements the Data Dictionary derived from real DSS/Lemon Tree/Dehradun/
-- Coronet/High Town records. Run this in the Supabase SQL editor.
-- ============================================================================

-- Extension for UUID generation (Supabase usually has this on already)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type client_status as enum ('active','inactive');
create type site_status as enum ('draft','active','on_hold','completed','closed');
create type sub_project_status as enum ('active','completed','on_hold');
create type po_status as enum ('draft','active','completed');
create type pi_status as enum ('draft','sent','revision_requested','approved','converted_to_invoice');
create type gst_type as enum ('igst','cgst_sgst');
create type invoice_status as enum ('draft','issued','partially_settled','fully_settled','disputed','cancelled');
create type payment_mode as enum ('bank_transfer','cash','cheque','other');
create type payment_type as enum ('advance','invoice_settlement','retention_release','other');
create type deduction_type as enum ('tds','gst_tds','retention','handover_hold','penalty','discount','other');
create type deduction_status as enum ('pending','released','written_off');
create type document_type as enum ('po','pi','invoice','payment_advice','tds_certificate','correspondence','other');
create type user_role as enum ('owner','accountant','site_manager','data_entry');
create type user_status as enum ('active','inactive');
create type sync_record_type as enum ('invoice','payment');
create type sync_status as enum ('pending','pushed','failed');

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
create table app_user (
    user_id       uuid primary key default gen_random_uuid(),
    name          text not null,
    email         text unique not null,
    role          user_role not null,
    status        user_status not null default 'active',
    created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- DOCUMENT (referenced by many tables below, so defined early)
-- ----------------------------------------------------------------------------
create table document (
    document_id     uuid primary key default gen_random_uuid(),
    file_url        text not null,
    document_type   document_type not null,
    uploaded_by     uuid references app_user(user_id),
    uploaded_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CLIENT
-- ----------------------------------------------------------------------------
create table client (
    client_id             uuid primary key default gen_random_uuid(),
    legal_name            text not null,
    display_name          text not null,
    gstin                 text,
    pan                   text,
    billing_address       text,
    state                 text,
    contact_person        text,
    contact_phone         text,
    contact_email         text,
    default_tds_pct       numeric(5,2),
    default_retention_pct numeric(5,2),
    status                client_status not null default 'active',
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SITE
-- ----------------------------------------------------------------------------
create table site (
    site_id           uuid primary key default gen_random_uuid(),
    client_id         uuid not null references client(client_id),
    site_name         text not null,
    site_address      text,
    has_sub_projects  boolean not null default false,
    status            site_status not null default 'active',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index idx_site_client on site(client_id);

-- ----------------------------------------------------------------------------
-- SUB-PROJECT (Tower / Work Package) — optional third level
-- ----------------------------------------------------------------------------
create table sub_project (
    sub_project_id     uuid primary key default gen_random_uuid(),
    site_id            uuid not null references site(site_id),
    name               text not null,
    scope_description  text,
    status             sub_project_status not null default 'active',
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index idx_subproject_site on sub_project(site_id);

-- ----------------------------------------------------------------------------
-- PURCHASE ORDER / WORK ORDER
-- ----------------------------------------------------------------------------
create table purchase_order (
    po_id                uuid primary key default gen_random_uuid(),
    site_id              uuid not null references site(site_id),
    sub_project_id       uuid references sub_project(sub_project_id),
    po_number            text not null,
    po_date              date not null,
    scope_description    text,
    taxable_value        numeric(14,2),
    gst_amount           numeric(14,2),
    total_value_with_gst numeric(14,2) not null,
    advance_pct          numeric(5,2),
    retention_pct        numeric(5,2),
    document_id          uuid references document(document_id),
    status               po_status not null default 'active',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index idx_po_site on purchase_order(site_id);
create index idx_po_subproject on purchase_order(sub_project_id);

-- ----------------------------------------------------------------------------
-- TAX INVOICE  (created before PI so PI can reference it — see note below)
-- ----------------------------------------------------------------------------
create table tax_invoice (
    invoice_id          uuid primary key default gen_random_uuid(),
    site_id             uuid not null references site(site_id),
    sub_project_id      uuid references sub_project(sub_project_id),
    po_id               uuid references purchase_order(po_id),
    pi_id               uuid,  -- FK added after proforma_invoice table is created
    invoice_number      text not null,
    invoice_date        date not null,
    taxable_value       numeric(14,2) not null,
    gst_type            gst_type,
    gst_amount          numeric(14,2),
    gst_rate_pct        numeric(5,2) default 18.00,
    gross_invoice_value numeric(14,2) not null,
    due_date            date,
    status              invoice_status not null default 'issued',
    document_id         uuid references document(document_id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index idx_invoice_site on tax_invoice(site_id);
create index idx_invoice_subproject on tax_invoice(sub_project_id);
create index idx_invoice_po on tax_invoice(po_id);
create unique index uq_invoice_number_per_site on tax_invoice(site_id, invoice_number);

-- ----------------------------------------------------------------------------
-- PROFORMA INVOICE / QUOTATION
-- ----------------------------------------------------------------------------
create table proforma_invoice (
    pi_id                 uuid primary key default gen_random_uuid(),
    site_id               uuid not null references site(site_id),
    sub_project_id        uuid references sub_project(sub_project_id),
    po_id                 uuid references purchase_order(po_id),
    pi_number             text not null,
    pi_date               date not null,
    amount                numeric(14,2) not null,
    submitted_date        date,
    remarks               text,
    status                pi_status not null default 'draft',
    converted_invoice_id  uuid references tax_invoice(invoice_id),
    document_id           uuid references document(document_id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create index idx_pi_site on proforma_invoice(site_id);

-- now wire the reverse FK on tax_invoice
alter table tax_invoice
    add constraint fk_invoice_pi foreign key (pi_id) references proforma_invoice(pi_id);

-- ----------------------------------------------------------------------------
-- PAYMENT
-- ----------------------------------------------------------------------------
create table payment (
    payment_id          uuid primary key default gen_random_uuid(),
    site_id             uuid not null references site(site_id),
    payment_date        date not null,
    amount_received     numeric(14,2) not null,
    payment_mode        payment_mode not null default 'bank_transfer',
    payment_type        payment_type not null default 'invoice_settlement',
    utr_or_reference    text,
    remarks             text,
    document_id         uuid references document(document_id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index idx_payment_site on payment(site_id);

-- ----------------------------------------------------------------------------
-- PAYMENT ALLOCATION (many-to-many: Payment <-> Invoice)
-- ----------------------------------------------------------------------------
create table payment_allocation (
    allocation_id     uuid primary key default gen_random_uuid(),
    payment_id        uuid not null references payment(payment_id),
    invoice_id        uuid references tax_invoice(invoice_id),
    sub_project_id    uuid references sub_project(sub_project_id),
    amount_allocated  numeric(14,2) not null check (amount_allocated > 0),
    allocation_date   date not null default current_date,
    created_by        uuid references app_user(user_id),
    created_at        timestamptz not null default now()
);
create index idx_allocation_payment on payment_allocation(payment_id);
create index idx_allocation_invoice on payment_allocation(invoice_id);

-- ----------------------------------------------------------------------------
-- DEDUCTION (TDS / Retention / Handover Hold / other)
-- ----------------------------------------------------------------------------
create table deduction (
    deduction_id           uuid primary key default gen_random_uuid(),
    invoice_id             uuid not null references tax_invoice(invoice_id),
    deduction_type         deduction_type not null,
    category_note          text,
    amount                 numeric(14,2) not null,
    deduction_date         date not null default current_date,
    certificate_reference  text,
    release_condition      text,
    expected_release_date  date,
    status                 deduction_status not null default 'pending',
    document_id            uuid references document(document_id),
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);
create index idx_deduction_invoice on deduction(invoice_id);

-- ----------------------------------------------------------------------------
-- PHYSICAL PROGRESS LOG
-- ----------------------------------------------------------------------------
create table physical_progress_log (
    progress_id     uuid primary key default gen_random_uuid(),
    site_id         uuid not null references site(site_id),
    sub_project_id  uuid references sub_project(sub_project_id),
    progress_pct    numeric(5,2) not null check (progress_pct between 0 and 100),
    note            text,
    reported_date   date not null default current_date,
    reported_by     uuid references app_user(user_id),
    created_at      timestamptz not null default now()
);
create index idx_progress_site on physical_progress_log(site_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOG
-- ----------------------------------------------------------------------------
create table audit_log (
    audit_id       uuid primary key default gen_random_uuid(),
    table_name     text not null,
    record_id      uuid not null,
    field_changed  text,
    old_value      text,
    new_value      text,
    changed_by     uuid references app_user(user_id),
    changed_at     timestamptz not null default now(),
    reason         text
);
create index idx_audit_record on audit_log(table_name, record_id);

-- ----------------------------------------------------------------------------
-- TALLY SYNC LOG
-- ----------------------------------------------------------------------------
create table tally_sync_log (
    sync_id             uuid primary key default gen_random_uuid(),
    record_type         sync_record_type not null,
    record_id           uuid not null,
    tally_voucher_type  text not null,
    sync_status         sync_status not null default 'pending',
    pushed_at           timestamptz,
    error_message       text,
    triggered_by        uuid references app_user(user_id),
    created_at          timestamptz not null default now()
);
create index idx_sync_record on tally_sync_log(record_type, record_id);

-- ============================================================================
-- COMPUTED VIEWS — implement the Calculation Rules from the Data Dictionary
-- ============================================================================

-- Invoice settlement summary: allocations + deductions vs gross value
create view v_invoice_settlement as
select
    ti.invoice_id,
    ti.site_id,
    ti.sub_project_id,
    ti.invoice_number,
    ti.gross_invoice_value,
    coalesce(alloc.total_allocated, 0)      as total_payments_allocated,
    coalesce(ded.total_deducted, 0)         as total_deducted,
    coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) as total_settled,
    ti.gross_invoice_value - (coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0)) as remaining_balance,
    case
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) >= ti.gross_invoice_value
            then 'fully_settled'
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) > 0
            then 'partially_settled'
        else 'issued'
    end as computed_status
from tax_invoice ti
left join (
    select invoice_id, sum(amount_allocated) as total_allocated
    from payment_allocation
    group by invoice_id
) alloc on alloc.invoice_id = ti.invoice_id
left join (
    select invoice_id, sum(amount) as total_deducted
    from deduction
    group by invoice_id
) ded on ded.invoice_id = ti.invoice_id;

-- Retention / handover-hold outstanding, per site — kept separate from normal outstanding
create view v_retention_outstanding as
select
    ti.site_id,
    sum(d.amount) filter (where d.status = 'pending') as retention_outstanding
from deduction d
join tax_invoice ti on ti.invoice_id = d.invoice_id
where d.deduction_type in ('retention','handover_hold')
group by ti.site_id;

-- Normal outstanding per site (excludes retention/handover-hold — those are tracked separately)
create view v_normal_outstanding as
select
    ti.site_id,
    sum(ti.gross_invoice_value) as total_invoiced,
    sum(coalesce(alloc.total_allocated, 0)) as total_collected,
    sum(coalesce(ded_other.total_other_deducted, 0)) as total_other_deductions,
    sum(ti.gross_invoice_value)
        - sum(coalesce(alloc.total_allocated, 0))
        - sum(coalesce(ded_other.total_other_deducted, 0)) as normal_outstanding
from tax_invoice ti
left join (
    select invoice_id, sum(amount_allocated) as total_allocated
    from payment_allocation
    group by invoice_id
) alloc on alloc.invoice_id = ti.invoice_id
left join (
    select invoice_id, sum(amount) as total_other_deducted
    from deduction
    where deduction_type not in ('retention','handover_hold')
    group by invoice_id
) ded_other on ded_other.invoice_id = ti.invoice_id
group by ti.site_id;

-- Advance balance per site (advance payments not yet allocated to an invoice)
create view v_advance_balance as
select
    p.site_id,
    sum(p.amount_received) filter (where p.payment_type = 'advance') as total_advance_received,
    sum(pa.amount_allocated) filter (where p.payment_type = 'advance') as total_advance_allocated,
    sum(p.amount_received) filter (where p.payment_type = 'advance')
        - coalesce(sum(pa.amount_allocated) filter (where p.payment_type = 'advance'), 0) as advance_balance
from payment p
left join payment_allocation pa on pa.payment_id = p.payment_id
group by p.site_id;

-- Unallocated payments — flags exactly the "which site does this belong to" ambiguity
create view v_unallocated_payments as
select
    p.payment_id,
    p.site_id,
    p.amount_received,
    coalesce(sum(pa.amount_allocated), 0) as amount_allocated,
    p.amount_received - coalesce(sum(pa.amount_allocated), 0) as unallocated_amount,
    p.payment_date
from payment p
left join payment_allocation pa on pa.payment_id = p.payment_id
group by p.payment_id, p.site_id, p.amount_received, p.payment_date
having p.amount_received - coalesce(sum(pa.amount_allocated), 0) > 0;

-- Owner dashboard rollup — one row per site, the "visit one place" view
create view v_site_dashboard as
select
    s.site_id,
    s.site_name,
    c.display_name as client_name,
    coalesce(po_sum.total_po_value, 0) as current_contract_value,
    coalesce(inv_sum.total_invoiced, 0) as total_invoiced,
    coalesce(no.total_collected, 0) as total_collected,
    coalesce(no.normal_outstanding, 0) as normal_outstanding,
    coalesce(ro.retention_outstanding, 0) as retention_outstanding,
    coalesce(ab.advance_balance, 0) as advance_balance,
    case when coalesce(po_sum.total_po_value,0) > 0
        then round(coalesce(inv_sum.total_invoiced,0) / po_sum.total_po_value * 100, 2)
        else null
    end as billing_progress_pct
from site s
join client c on c.client_id = s.client_id
left join (select site_id, sum(total_value_with_gst) as total_po_value from purchase_order group by site_id) po_sum
    on po_sum.site_id = s.site_id
left join (select site_id, sum(gross_invoice_value) as total_invoiced from tax_invoice group by site_id) inv_sum
    on inv_sum.site_id = s.site_id
left join v_normal_outstanding no on no.site_id = s.site_id
left join v_retention_outstanding ro on ro.site_id = s.site_id
left join v_advance_balance ab on ab.site_id = s.site_id;

-- ============================================================================
-- END OF PHASE 1 SCHEMA
-- ============================================================================
