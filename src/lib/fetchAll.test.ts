import { describe, expect, it } from 'vitest';
import { fetchAll, PAGE_SIZE } from './fetchAll';

// A fake query builder that behaves like PostgREST: never returns more than `cap` rows per request.
function fakeTable(total: number, cap = PAGE_SIZE) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i, amount: 1 }));
  const calls: [number, number][] = [];
  const query = () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      const data = rows.slice(from, Math.min(to + 1, from + cap));
      return Promise.resolve({ data, error: null });
    },
  });
  return { query, calls };
}

describe('fetchAll', () => {
  it('returns every row past the 1000-row server cap', async () => {
    const t = fakeTable(2500);
    const rows = await fetchAll(t.query);
    expect(rows).toHaveLength(2500);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(2500);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after one request when everything fits', async () => {
    const t = fakeTable(12);
    expect(await fetchAll(t.query)).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });

  it('handles an exact multiple of the page size', async () => {
    const t = fakeTable(2000);
    expect(await fetchAll(t.query)).toHaveLength(2000);
  });

  it('throws the error instead of returning a partial list', async () => {
    const failing = () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) });
    await expect(fetchAll(failing)).rejects.toThrow('boom');
  });
});
