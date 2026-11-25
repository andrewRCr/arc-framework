/**
 * The scope a command action runs in when its stdout carries a machine-readable document. Terminal presentation
 * reads it to stay off stdout; it lives apart from the presentation module so entering it loads no terminal code.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const machineOutput = new AsyncLocalStorage<true>();

/**
 * Run a command action whose stdout is reserved for its machine-readable document.
 *
 * @param action - The action to run; the scope holds across its awaits.
 * @returns The action's own result.
 */
export function runWithMachineOutput<Result>(action: () => Result): Result {
  return machineOutput.run(true, action);
}

/** Whether the current call runs inside a machine-output scope. */
export function inMachineOutputScope(): boolean {
  return machineOutput.getStore() === true;
}
