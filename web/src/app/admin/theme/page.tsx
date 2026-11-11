import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '../_components/page-header';
import { Swatch } from './swatch';
import { TOKEN_GROUPS } from './tokens';

export const metadata: Metadata = { title: 'Theme' };

/** Both themes side by side. Edit web/src/app/theme.css and this page updates live in dev. */
export default async function ThemePage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Theme"
        description="Every color comes from web/src/app/theme.css. Edit it while pnpm dev runs and this page updates live."
      />
      <div className="theme-panels">
        <ThemePanel scheme="light" />
        <ThemePanel scheme="dark" />
      </div>
    </>
  );
}

function ThemePanel({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    // theme-scope + scheme-* re-resolve every token inside to this theme (see theme.css).
    <section className="theme-panel" aria-label={`${scheme} theme`}>
      <div className={`theme-scope scheme-${scheme} theme-panel-inner`}>
        <div className="curtain-band" />
        <div className="theme-panel-body">
          <h2>{scheme === 'light' ? 'Light' : 'Dark'}</h2>

          {TOKEN_GROUPS.map((group) => (
            <div key={group.label}>
              <h3>{group.label}</h3>
              <ul className="swatches">
                {group.tokens.map((t) => (
                  <Swatch key={t.name} {...t} />
                ))}
              </ul>
            </div>
          ))}

          <h3>Samples</h3>
          <div className="stack">
            <p>
              Body text with a <a href="#">link to the box office</a> and{' '}
              <span className="muted">muted detail</span>.
            </p>
            <div className="sample-row">
              <button type="button" className="primary">
                Get tickets
              </button>
              <button type="button">Add to calendar</button>
              <button type="button" className="primary" disabled>
                Sold out
              </button>
            </div>
            <div className="sample-row">
              <span className="badge accent">Musical</span>
              <span className="badge">Community</span>
              <span className="badge live">live</span>
              <span className="badge">building</span>
            </div>
            <label className="field">
              <span>Venue</span>
              <input defaultValue="Lyceum Theatre" />
            </label>
            <label className="field">
              <span>Ticket URL</span>
              <input defaultValue="not a url" aria-invalid />
              <small className="error">Enter a full URL starting with https://</small>
            </label>
            <p className="success">Saved.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Production</th>
                    <th scope="col" className="num">
                      From
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Into the Woods</td>
                    <td className="num">$25</td>
                  </tr>
                  <tr>
                    <td>Our Town</td>
                    <td className="num">$18</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <nav className="admin-nav sample-nav" aria-label="Sample navigation">
              <a href="#" aria-current="page">
                Selected item
              </a>
              <a href="#">Other item</a>
              <a href="#" className="pending">
                Not built yet
              </a>
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
