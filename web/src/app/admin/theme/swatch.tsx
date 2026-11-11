'use client';

import { useEffect, useRef, useState } from 'react';

function toHex(rgb: string): string {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return rgb;
  return (
    '#' +
    m
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** A color chip that shows the token's resolved value in whichever theme panel it sits in. */
export function Swatch({ name, use }: { name: string; use: string }) {
  const chip = useRef<HTMLSpanElement>(null);
  const [hex, setHex] = useState('');

  useEffect(() => {
    const el = chip.current;
    if (!el) return;
    const read = () => setHex(toHex(getComputedStyle(el).backgroundColor));
    read();
    // Re-read when the theme toggle changes data-theme on <html>.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <li className="swatch">
      <span ref={chip} className="swatch-chip" style={{ background: `var(${name})` }} />
      <span className="swatch-text">
        <code>{name}</code>
        <span className="muted">{use}</span>
      </span>
      <code className="muted swatch-hex">{hex}</code>
    </li>
  );
}
