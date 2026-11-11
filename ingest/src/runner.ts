import type { Adapter, AdapterContext, SourceRef, SourceRunResult } from './types';

/**
 * Run one source through its adapter. Never throws: failures are returned so
 * the caller can record source health and keep going with other sources.
 */
export async function runSource(
  source: SourceRef,
  adapter: Adapter | undefined,
  ctx: AdapterContext,
): Promise<SourceRunResult> {
  if (!adapter) {
    return {
      sourceId: source.id,
      ok: false,
      itemCount: 0,
      candidates: [],
      error: `No adapter for kind "${source.kind}"`,
    };
  }
  try {
    const raws = await adapter.fetch(source, ctx);
    const candidates = raws.flatMap((raw) => adapter.normalize(raw, source));
    return { sourceId: source.id, ok: true, itemCount: raws.length, candidates };
  } catch (err) {
    return {
      sourceId: source.id,
      ok: false,
      itemCount: 0,
      candidates: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * A source is unhealthy when its run failed, or when it returned zero items
 * for 3+ days while it normally returns items (plan: Admin → source health).
 */
export function isUnhealthy(opts: {
  ok: boolean;
  itemCount: number;
  lastSuccessWithItemsAt: Date | null;
  now: Date;
}): boolean {
  if (!opts.ok) return true;
  if (opts.itemCount > 0 || !opts.lastSuccessWithItemsAt) return false;
  const days = (opts.now.getTime() - opts.lastSuccessWithItemsAt.getTime()) / 86_400_000;
  return days >= 3;
}
