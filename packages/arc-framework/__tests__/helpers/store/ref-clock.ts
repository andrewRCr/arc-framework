/** Virtual retry waits and deadline bounds sharing one deterministic clock. */

import type { RefStoreSleep } from "../../../src/lib/store/ports.js";

export interface RefClock {
  clock: () => Date;
  sleep: RefStoreSleep;
  advance: (milliseconds: number) => void;
}

export function createRefClock(initial = new Date("2026-01-01T00:00:00Z"), tickMs = 1): RefClock {
  let now = initial.getTime();
  const bounds: { end: number; finish: () => void }[] = [];
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    for (;;) {
      const next = bounds.filter((bound) => bound.end <= target).sort((left, right) => left.end - right.end)[0];
      if (!next) break;
      now = Math.max(now, next.end);
      next.finish();
    }
    now = target;
  };
  return {
    clock: () => new Date(now += tickMs), advance,
    sleep: {
      wait: async (milliseconds, signal) => { if (!signal.aborted) advance(milliseconds); },
      bound: (milliseconds, signal) => new Promise<void>((resolve) => {
        if (signal.aborted) { resolve(); return; }
        const entry = { end: now + milliseconds, finish: () => {
          const index = bounds.indexOf(entry);
          if (index !== -1) bounds.splice(index, 1);
          signal.removeEventListener("abort", entry.finish);
          resolve();
        } };
        bounds.push(entry);
        signal.addEventListener("abort", entry.finish, { once: true });
      }),
    },
  };
}
