import type { SourceHealth } from '@curtainly/shared';

export function HealthBadge({ health }: { health: SourceHealth }) {
  return <span className="badge">{health}</span>;
}

export function formatWhen(d: Date | null) {
  return d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null;
}
