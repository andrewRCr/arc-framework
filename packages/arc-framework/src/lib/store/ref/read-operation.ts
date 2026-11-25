/** Keep native readers inside public calls and drain them before repository maintenance. */
import { withRefOperation } from "./operation-scope.js";
import type { RefBackendContext } from "./context.js";

/** Coordinate only this backend's readers and explicit or fetch-triggered maintenance. */
export function createRefReadCoordinator(context: RefBackendContext): {
  read<T>(operation: (context: RefBackendContext) => Promise<T>): Promise<T>;
  maintenance<T>(operation: () => Promise<T>): Promise<T>;
} {
  let barrier = Promise.resolve();
  const active = new Set<Promise<void>>();
  return {
    read: async (operation) => {
      const before = barrier;
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      active.add(done);
      try {
        await before;
        return await withRefOperation(context, operation);
      } finally { active.delete(done); finish(); }
    },
    maintenance: async (operation) => {
      const before = [barrier, ...active];
      let finish!: () => void;
      barrier = new Promise<void>((resolve) => { finish = resolve; });
      try { await Promise.all(before); return await operation(); }
      finally { finish(); }
    },
  };
}
