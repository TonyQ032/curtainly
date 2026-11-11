import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Curtainly',
  description: 'Every play and musical running near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
