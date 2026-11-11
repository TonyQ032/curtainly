import { TIERS, TIER_LABELS } from '@curtainly/shared';

export default function Home() {
  return (
    <main className="container">
      <h1>Curtainly</h1>
      <p>Every play and musical running near you. Starting with San Diego County.</p>
      <p className="muted">
        Coming soon. Covering {TIERS.map((t) => TIER_LABELS[t]).join(', ')} theatre.
      </p>
    </main>
  );
}
