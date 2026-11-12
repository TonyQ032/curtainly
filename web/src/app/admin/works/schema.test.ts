import { describe, expect, it } from 'vitest';
import {
  authorsToRows,
  duplicateKey,
  rowsToAuthors,
  splitList,
  titleKeys,
  workFormSchema,
} from './schema';

const valid = {
  title: ' Into the Woods ',
  slug: '',
  type: 'musical',
  altTitles: 'Into the Woods JR.\n\n  into the woods \nInto  the Woods Jr.',
  authors: JSON.stringify([
    { role: 'music', customRole: '', names: 'Stephen Sondheim' },
    { role: 'lyrics', customRole: '', names: 'Stephen Sondheim' },
    { role: 'book', customRole: '', names: 'James Lapine, ' },
    { role: 'other', customRole: '', names: '' },
  ]),
};

describe('workFormSchema', () => {
  it('parses, cleans alt titles and builds credits', () => {
    expect(workFormSchema.parse(valid)).toEqual({
      title: 'Into the Woods',
      slug: '',
      type: 'musical',
      altTitles: ['Into the Woods JR.'],
      authors: {
        music: ['Stephen Sondheim'],
        lyrics: ['Stephen Sondheim'],
        book: ['James Lapine'],
      },
      confirmDuplicate: '',
    });
  });

  it('treats missing alt titles and credits as empty', () => {
    const parsed = workFormSchema.parse({ title: 'Fences', slug: '', type: 'play' });
    expect(parsed.altTitles).toEqual([]);
    expect(parsed.authors).toEqual({});
  });

  it.each([
    ['title', ''],
    ['title', '!!!'],
    ['slug', 'Into the Woods'],
    ['type', 'opera'],
    ['altTitles', 'x'.repeat(201)],
    ['authors', 'not json'],
    ['authors', JSON.stringify([{ role: 'director', names: 'X' }])],
    ['authors', JSON.stringify([{ role: 'other', customRole: ' ', names: 'X' }])],
  ])('rejects %s = %j', (field, value) => {
    const result = workFormSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe('splitList', () => {
  it('trims, collapses spaces and drops blanks and repeats', () => {
    expect(splitList(' A  B, ,a b,C ', ',')).toEqual(['A B', 'C']);
  });
});

describe('credits rows', () => {
  it('merges rows for the same role, including other roles case-insensitively', () => {
    expect(
      rowsToAuthors([
        { role: 'music', customRole: '', names: 'Benj Pasek' },
        { role: 'music', customRole: '', names: 'Justin Paul, benj pasek' },
        { role: 'other', customRole: 'Orchestrations', names: 'A' },
        { role: 'other', customRole: 'orchestrations ', names: 'B' },
      ]),
    ).toEqual({
      music: ['Benj Pasek', 'Justin Paul'],
      other: [{ role: 'Orchestrations', names: ['A', 'B'] }],
    });
  });

  it('round-trips stored credits', () => {
    const authors = {
      playwright: ['August Wilson'],
      other: [{ role: 'Adapted by', names: ['X', 'Y'] }],
    };
    expect(rowsToAuthors(authorsToRows(authors))).toEqual(authors);
    expect(authorsToRows({})).toEqual([]);
  });
});

describe('titleKeys / duplicateKey', () => {
  it('normalizes and dedupes titles', () => {
    expect(titleKeys('Into the Woods', ['Into the Woods JR.', 'Woods'])).toEqual([
      'into the woods',
      'woods',
    ]);
  });

  it('is order-independent', () => {
    expect(duplicateKey(['b', 'a'])).toBe(duplicateKey(['a', 'b']));
  });
});
