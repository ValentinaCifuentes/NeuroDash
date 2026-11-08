import { afterEach, describe, expect, it, vi } from 'vitest';

import { newId } from './ids';

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('works where crypto.randomUUID does not exist (http on the local network, a file)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => real.getRandomValues(array) });

    const ids = new Set(Array.from({ length: 50 }, () => newId()));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
