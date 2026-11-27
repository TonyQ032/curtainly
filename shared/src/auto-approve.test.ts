import { describe, expect, it } from 'vitest';
import { autoApproveEligibility, EMPTY_STREAK } from './auto-approve';

const at = (day: number) => new Date(Date.UTC(2026, 10, 1 + day, 12));

describe('autoApproveEligibility', () => {
  it('is not eligible with no reviewed items', () => {
    expect(autoApproveEligibility(EMPTY_STREAK)).toMatchObject({ days: 0, eligible: false });
  });

  it('needs 10 clean approvals', () => {
    const streak = { clean: 9, firstAt: at(0), lastAt: at(20), brokenAt: null };
    expect(autoApproveEligibility(streak).eligible).toBe(false);
    expect(autoApproveEligibility({ ...streak, clean: 10 }).eligible).toBe(true);
  });

  it('needs the streak to span 14 days', () => {
    const streak = { clean: 25, firstAt: at(0), lastAt: at(13), brokenAt: null };
    expect(autoApproveEligibility(streak)).toMatchObject({ days: 13, eligible: false });
    expect(autoApproveEligibility({ ...streak, lastAt: at(14) })).toMatchObject({
      days: 14,
      eligible: true,
    });
  });

  it('counts whole days only', () => {
    const lastAt = new Date(at(14).getTime() - 1);
    expect(autoApproveEligibility({ clean: 10, firstAt: at(0), lastAt, brokenAt: null }).days).toBe(
      13,
    );
  });
});
