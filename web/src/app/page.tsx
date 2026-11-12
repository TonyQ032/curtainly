import Link from 'next/link';
import { TIERS, TIER_LABELS } from '@curtainly/shared';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <>
      <div className="curtain-band" />
      <main className="container">
        <div className="home-top">
          <h1 className="brand-title">Curtainly</h1>
          <div className="home-actions">
            {/* Temporary shortcut to the admin while testing (#96); replace with real designs in M4. */}
            <Link href="/login" className="button">
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <p>Every play and musical running near you. Starting with San Diego County.</p>
        <p className="muted">
          Coming soon. Covering {TIERS.map((t) => TIER_LABELS[t]).join(', ')} theatre.
        </p>
      </main>
    </>
  );
}
