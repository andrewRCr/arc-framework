/** Keep native readers inside read calls and drain them before repository maintenance. */
import { GitBatchReadScope } from "../../git/batch-reader.js";
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
      const batchReader = new GitBatchReadScope();
      try {
        await before;
        let result;
        try { result = await operation({ ...context, batchReader }); }
        catch (error) { await batchReader.close().catch(() => undefined); throw error; }
        await batchReader.close();
        return result;
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
