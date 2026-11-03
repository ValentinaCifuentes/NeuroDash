import { describe, expect, it } from 'vitest';

/**
 * La interfaz usa los íconos SVG del prototipo (components/icons.tsx) y las
 * marcas de components/marks.tsx, nunca emoji. Los emoji se ven distinto en
 * cada sistema, no toman el color del tema y el lector de pantalla los lee.
 *
 * Se revisa el código (no los comentarios) de todo src/, salvo tests y fixtures.
 */
const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const EMOJI = /\p{Extended_Pictographic}/u;
// Glifos que el código usaba como íconos y que el prototipo reemplazó por SVG.
const GLYPHS = /[☰♡✕↺⇄▦◌]/u;

function offendingLines(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, index) => {
    if (/^\s*(\*|\/\*|\/\/)/.test(line)) return [];
    const code = line.replace(/\/\/.*$/, '');
    return EMOJI.test(code) || GLYPHS.test(code) ? [`${path}:${index + 1}: ${code.trim()}`] : [];
  });
}

describe('no emoji in the interface code', () => {
  it('scans the interface sources', () => {
    expect(Object.keys(SOURCES)).toContain('./components/BottomNav.tsx');
  });

  it('uses SVG icons and marks instead of emoji or icon glyphs', () => {
    const offenders = Object.entries(SOURCES).flatMap(([path, source]) => offendingLines(path, source));

    expect(offenders).toEqual([]);
  });
});
