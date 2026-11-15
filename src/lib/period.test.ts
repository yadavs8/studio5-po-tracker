import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { inPeriod, loadBroughtForward } from './period';

describe('inPeriod', () => {
  it('starts on 1 Aug 2026', () => {
    expect(inPeriod('2026-07-31')).toBe(false);
    expect(inPeriod('2026-08-01')).toBe(true);
    expect(inPeriod('2026-08-01T00:00:00+05:30')).toBe(true);
    expect(inPeriod(null)).toBe(false);
  });
});

describe('loadBroughtForward', () => {
  beforeEach(() => rpc.mockReset());

  it('reads the staff-only totals from brought_forward() (migration_016)', async () => {
    rpc.mockResolvedValue({
      data: [{ site_id: 's1', billed: '59000', received: '20000', tax: '1000', held: '0', received_since: '8000', balance: '30000' }],
      error: null,
    });
    const bf = await loadBroughtForward('s1');
    expect(rpc).toHaveBeenCalledWith('brought_forward', { p_site_id: 's1' });
    expect(bf.s1).toEqual({ billed: 59000, received: 20000, tax: 1000, held: 0, receivedSince: 8000, balance: 30000 });
  });

  it('asks for every site when none is given', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadBroughtForward()).toEqual({});
    expect(rpc).toHaveBeenCalledWith('brought_forward', { p_site_id: null });
  });

  it('throws instead of silently showing zero', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Only Studio5 staff can see these figures.' } });
    await expect(loadBroughtForward()).rejects.toThrow('Only Studio5 staff');
  });
});
