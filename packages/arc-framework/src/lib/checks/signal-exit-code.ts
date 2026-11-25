/** Shell-compatible signal statuses without the check runner's process graph. */
import { constants } from "node:os";

/** The exit status a shell reports for a command a signal ended: 128 plus the signal's number. */
export function signalExitCode(signal: NodeJS.Signals | undefined): number | undefined {
  const number = signal === undefined ? undefined : constants.signals[signal];
  return number === undefined ? undefined : 128 + number;
}

