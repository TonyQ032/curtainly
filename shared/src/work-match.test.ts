import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './normalize';
import {
  buildWorkIndex,
  suggestWorks,
  trigramSimilarity,
  trigrams,
  type MatchableWork,
} from './work-match';

function work(id: string, title: string, altTitles: string[] = []): MatchableWork {
  return { id, title, normalizedTitle: normalizeTitle(title), altTitles };
}

const WORKS = [
  work('woods', 'Into the Woods'),
  work('woods-2', 'Into the Woods Again'),
  work('annie', 'Annie'),
  work('annie-gun', 'Annie Get Your Gun'),
  work('hamilton', 'Hamilton'),
  work('beauty', 'Beauty and the Beast'),
  work('matilda', 'Matilda'),
  work('les-mis', 'Les Misérables', ['Les Mis']),
  work('carol', 'A Christmas Carol'),
  work('shrek', 'Shrek'),
  work('frozen', 'Frozen'),
  work('seussical', 'Seussical'),
  work('rent', 'Rent'),
  work('little-women', 'Little Women'),
  work('little-shop', 'Little Shop of Horrors'),
];
const INDEX = buildWorkIndex(WORKS);

const top = (title: string) => suggestWorks(title, INDEX)[0];

describe('trigrams', () => {
  it('pads words like pg_trgm', () => {
    expect([...trigrams('cat')].sort()).toEqual(['  c', ' ca', 'at ', 'cat'].sort());
  });

  it('scores identical sets 1 and disjoint sets 0', () => {
    expect(trigramSimilarity(trigrams('into the woods'), trigrams('into the woods'))).toBe(1);
    expect(trigramSimilarity(trigrams('abc'), trigrams('xyz'))).toBe(0);
    expect(trigramSimilarity(new Set(), trigrams('xyz'))).toBe(0);
  });
});

describe('suggestWorks', () => {
  it.each([
    // Editions normalize to the base title.
    ['Into the Woods Jr.', 'woods'],
    ['INTO THE WOODS: Youth Edition', 'woods'],
    ['Shrek The Musical JR.', 'shrek'],
    ['Frozen JR.', 'frozen'],
    ['Seussical KIDS', 'seussical'],
    ['Little Shop of Horrors - The Musical', 'little-shop'],
    ['Annie Jr.', 'annie'],
    ['Annie Get Your Gun', 'annie-gun'],
    ['The Christmas Carol', 'carol'],
    ['Les Miserables', 'les-mis'],
  ])('%s → exact match', (title, id) => {
    expect(top(title)).toMatchObject({ workId: id, kind: 'exact', score: 1 });
  });

  it('matches alt titles just below the title', () => {
    expect(top('Les Mis')).toMatchObject({
      workId: 'les-mis',
      kind: 'alt_title',
      matchedTitle: 'Les Mis',
    });
  });

  it.each([
    ['Hamilton: An American Musical', 'hamilton'],
    ['A Christmas Carol: A Ghost Story of Christmas', 'carol'],
    ['Little Women (The Broadway Musical)', 'little-women'],
    ['Rent – 25th Anniversary Tour', 'rent'],
  ])('%s → main title before the subtitle', (title, id) => {
    expect(top(title)).toMatchObject({ workId: id, kind: 'main_title', score: 0.9 });
  });

  it('matches a stored title with a subtitle from the short form', () => {
    const index = buildWorkIndex([work('ham', 'Hamilton: An American Musical')]);
    expect(suggestWorks('Hamilton', index)[0]).toMatchObject({ workId: 'ham', kind: 'main_title' });
  });

  it.each([
    ["Disney's Beauty and the Beast", 'beauty'],
    ["Roald Dahl's Matilda The Musical", 'matilda'],
    ["Disney's Frozen JR.", 'frozen'],
  ])('%s → contains the Work title', (title, id) => {
    const match = top(title);
    expect(match).toMatchObject({ workId: id, kind: 'contains' });
    expect(match!.score).toBeGreaterThan(0.6);
    expect(match!.score).toBeLessThan(0.9);
  });

  it('finds typos by trigram similarity', () => {
    expect(top('Into the Wodds')).toMatchObject({ workId: 'woods', kind: 'similar' });
    expect(top('Beauty & the Beest')).toMatchObject({ workId: 'beauty', kind: 'similar' });
  });

  it('ranks the exact match first, ahead of longer titles containing it', () => {
    const results = suggestWorks('Into the Woods', INDEX);
    expect(results.map((r) => r.workId)).toEqual(['woods', 'woods-2']);
    expect(results[1]!.kind).toBe('contains');

    const annie = suggestWorks('Annie', INDEX);
    expect(annie[0]!.workId).toBe('annie');
    expect(annie[1]!.workId).toBe('annie-gun');
  });

  it('ranks an exact title above another Work with the same alt title', () => {
    const works = [
      work('b', 'Cinderella (Rodgers + Hammerstein)', ['Cinderella']),
      work('a', 'Cinderella'),
    ];
    const results = suggestWorks('Cinderella', works);
    expect(results.map((r) => [r.workId, r.kind])).toEqual([
      ['a', 'exact'],
      ['b', 'alt_title'],
    ]);
  });

  it('lists each Work once, by its best name', () => {
    const works = [work('x', 'The Wiz', ['The Wiz Live', 'Wiz'])];
    expect(suggestWorks('The Wiz', works)).toHaveLength(1);
  });

  it('drops weak matches and respects the limit', () => {
    expect(suggestWorks('Waiting for Godot', INDEX)).toEqual([]);
    expect(suggestWorks('Little', INDEX, { minScore: 0 }).length).toBeLessThanOrEqual(5);
    expect(suggestWorks('Into the Woods', INDEX, { limit: 1 })).toHaveLength(1);
  });

  it('does not match very short titles by containment', () => {
    const works = [work('it', 'It'), work('cats', 'Cats')];
    expect(
      suggestWorks('It Shoulda Been You', works).find((r) => r.workId === 'it'),
    ).toBeUndefined();
    expect(suggestWorks('Cats: The Jellicle Ball', works)[0]).toMatchObject({ workId: 'cats' });
  });

  it('accepts a plain Work list as well as an index', () => {
    expect(suggestWorks('Into the Woods Jr.', WORKS)[0]!.workId).toBe('woods');
  });

  it('returns nothing for a blank title', () => {
    expect(suggestWorks('  ', INDEX)).toEqual([]);
    expect(suggestWorks('!!!', INDEX)).toEqual([]);
  });
});
