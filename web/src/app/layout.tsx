import type { Metadata } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './theme.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Curtainly',
  description: 'Every play and musical running near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The init script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
