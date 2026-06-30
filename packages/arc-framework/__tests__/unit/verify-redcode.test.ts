import { describe, it, expect } from 'vitest';

// Throwaway: a deliberately-failing unit test to drive a red heavy run for
// live verification of the merge-gate safety invariant. Discarded after.
describe('verify-redcode (throwaway)', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
