// Supabase (PostgREST) returns at most 1000 rows per request, silently. Any total built
// from a whole table must page through it, or it quietly drops rows once the table grows.

// Must not be larger than the project's API "max rows" setting (Supabase default 1000): a page
// shorter than PAGE_SIZE is read as the last one.
export const PAGE_SIZE = 1000;

interface Pageable<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/**
 * Reads every row of a query, a page at a time.
 * `query` must build a FRESH query each call and include an `.order()` on a unique column
 * (usually the primary key) so pages do not overlap or skip rows.
 */
export async function fetchAll<T>(query: () => Pageable<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
