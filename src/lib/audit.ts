import { supabase } from '@/lib/supabase';

/**
 * Applies a partial update to a row. Field-level history is written automatically
 * by the DB's `fn_audit_row` trigger (see migration_002.sql) on every UPDATE to
 * purchase_order / proforma_invoice / tax_invoice / payment — this helper must
 * NOT also insert into audit_log itself, or every edit would be logged twice.
 */
export async function updateWithAudit<T extends Record<string, unknown>>(
  table: string,
  idField: string,
  id: string,
  patch: Partial<T>
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from(table).update(patch as never).eq(idField, id);
  return { error };
}

export interface AuditEntry {
  audit_id: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  reason: string | null;
}

/** Fetches the change history for one record, most recent first. */
export async function getHistory(table: string, recordId: string): Promise<AuditEntry[]> {
  const { data } = await supabase
    .from('audit_log')
    .select('audit_id, field_changed, old_value, new_value, changed_at, reason')
    .eq('table_name', table)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false });
  return (data ?? []) as AuditEntry[];
}
