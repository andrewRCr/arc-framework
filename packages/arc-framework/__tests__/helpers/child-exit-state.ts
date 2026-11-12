/** Scripted child processes that keep Node's exit state, so code reading it sees a running child until it closes. */
import type { EventEmitter } from "node:events";

/** Give a scripted child Node's exit fields: null while it runs, then set from its first `close`. */
export function withExitState<T extends EventEmitter>(child: T): T & { exitCode: number | null; signalCode: NodeJS.Signals | null } {
  const tracked = Object.assign(child, { exitCode: null as number | null, signalCode: null as NodeJS.Signals | null });
  tracked.once("close", (code: number | null, signal: NodeJS.Signals | null = null) => {
    tracked.exitCode = code; tracked.signalCode = signal;
  });
  return tracked;
}
