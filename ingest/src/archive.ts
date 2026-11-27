/**
 * Daily archive (#28): published productions whose end date has passed in their
 * Region's timezone become `archived`. A production's Region is its venue's.
 * The database sits behind a store so the date logic can be tested without one.
 */
import { todayIn } from '@curtainly/shared';

export interface ArchiveRegion {
  id: string;
  slug: string;
  timezone: string;
}

export interface ArchivedProduction {
  id: string;
  slug: string;
  endDate: string;
}

export interface ArchiveStore {
  loadRegions(): Promise<ArchiveRegion[]>;
  /**
   * Set `archived` on published productions at venues in `regionId` whose
   * `end_date` is before `today` (a local `YYYY-MM-DD`). Returns the rows changed.
   */
  archiveEndedBefore(regionId: string, today: string): Promise<ArchivedProduction[]>;
}

/**
 * Has a run ending on `endDate` (local date) finished at `now` in `timeZone`?
 * The last day still counts: a run ending Sunday is archived from Monday 00:00 local.
 */
export function hasEnded(endDate: string, timeZone: string, now: Date): boolean {
  return endDate < todayIn(timeZone, now);
}

export interface RegionArchiveOutcome {
  regionId: string;
  slug: string;
  /** Local date in the Region; productions ending before it were archived. */
  today: string;
  archived: ArchivedProduction[];
  error?: string;
}

export interface ArchiveSummary {
  regions: RegionArchiveOutcome[];
  archived: number;
  failed: number;
}

export interface ArchiveOptions {
  store: ArchiveStore;
  now?: () => Date;
  log?: (message: string) => void;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Archive ended productions in every Region. A failing Region never stops the others. */
export async function archiveEnded(options: ArchiveOptions): Promise<ArchiveSummary> {
  const log = options.log ?? console.log;
  const now = (options.now ?? (() => new Date()))();
  const regions = await options.store.loadRegions();
  const outcomes: RegionArchiveOutcome[] = [];

  for (const region of regions) {
    let today: string;
    try {
      today = todayIn(region.timezone, now);
    } catch (err) {
      const error = `invalid timezone "${region.timezone}": ${errorMessage(err)}`;
      log(`[archive ${region.slug}] ${error}`);
      outcomes.push({ regionId: region.id, slug: region.slug, today: '', archived: [], error });
      continue;
    }
    try {
      const archived = await options.store.archiveEndedBefore(region.id, today);
      for (const p of archived) log(`[archive ${region.slug}] ${p.slug} (ended ${p.endDate})`);
      outcomes.push({ regionId: region.id, slug: region.slug, today, archived });
    } catch (err) {
      const error = errorMessage(err);
      log(`[archive ${region.slug}] failed: ${error}`);
      outcomes.push({ regionId: region.id, slug: region.slug, today, archived: [], error });
    }
  }

  return {
    regions: outcomes,
    archived: outcomes.reduce((n, o) => n + o.archived.length, 0),
    failed: outcomes.filter((o) => o.error !== undefined).length,
  };
}

export function formatArchiveSummary(summary: ArchiveSummary): string {
  const parts = summary.regions.map((r) =>
    r.error ? `${r.slug}: failed` : `${r.slug}: ${r.archived.length} (before ${r.today})`,
  );
  return `[archive] ${summary.archived} production(s) archived${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}
