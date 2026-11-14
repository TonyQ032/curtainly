import { describe, expect, it } from 'vitest';
import { filterRuleSchema, notAShowSchema } from './schema';

const ID = '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';

describe('filterRuleSchema', () => {
  it('normalizes the keyword and accepts global or a source id', () => {
    expect(filterRuleSchema.parse({ keyword: '  Acting CLASS! ', scope: 'global' })).toEqual({
      keyword: 'acting class',
      scope: 'global',
    });
    expect(filterRuleSchema.parse({ keyword: 'gala', scope: ID }).scope).toBe(ID);
  });

  it('refuses short keywords and unknown scopes', () => {
    expect(filterRuleSchema.safeParse({ keyword: 'a!', scope: 'global' }).success).toBe(false);
    expect(filterRuleSchema.safeParse({ keyword: '!!!', scope: 'global' }).success).toBe(false);
    expect(filterRuleSchema.safeParse({ keyword: 'gala', scope: 'nope' }).success).toBe(false);
  });
});

describe('notAShowSchema', () => {
  it('treats a blank keyword as none', () => {
    expect(notAShowSchema.parse({})).toEqual({ keyword: null });
    expect(notAShowSchema.parse({ keyword: '   ' })).toEqual({ keyword: null });
  });

  it('normalizes a keyword and refuses one too short', () => {
    expect(notAShowSchema.parse({ keyword: 'Summer Camp' })).toEqual({ keyword: 'summer camp' });
    expect(notAShowSchema.safeParse({ keyword: 'ab' }).success).toBe(false);
  });
});
