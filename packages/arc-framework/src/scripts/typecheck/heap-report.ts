/** Write this Node process's terminal V8 heap observations for its parent. */
import { writeFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";

process.once("exit", () => {
  const file = process.env.ARC_TYPECHECK_HEAP_FILE;
  if (!file) return;
  try {
    const { used_heap_size, heap_size_limit } = getHeapStatistics();
    writeFileSync(file, JSON.stringify({ used_heap_size, heap_size_limit }));
  } catch {
    // Optional observations cannot replace the process's exit status.
  }
});
