/**
 * Cleanup for processes a test started but holds no handle to, such as grandchildren or children that already exited.
 *
 * A PID names whichever process holds it now. Once a test's process exits, the operating system may hand its PID to an
 * unrelated process, which Windows does within moments, and a SIGKILL sent there ends that process with exit code 1
 * and no output. So a PID is killed only while the process table still shows it running what the test started.
 */

/** One process-table row: a PID and its command line. */
export interface ProcessRow { pid: number; command: string }

/**
 * Kill each owned PID whose current row passes its owner check. A PID absent from the table, or defunct, has already
 * ended. A PID whose row fails the check now belongs to another process, so it is reported on stderr and left
 * running. A table that cannot be read kills nothing.
 *
 * @param owned - each PID with the check its command line must still pass
 * @param census - reads the process table once
 */
export async function killOwnedProcesses(owned: ReadonlyMap<number, (command: string) => boolean>,
  census: () => Promise<ProcessRow[]>): Promise<void> {
  if (owned.size === 0) return;
  let rows: ProcessRow[];
  try { rows = await census(); }
  catch (error) {
    console.error("DIAGNOSTIC_OWNED_PROCESS_CENSUS_FAILED", String(error));
    return;
  }
  for (const [pid, owns] of owned) {
    const command = rows.find((row) => row.pid === pid)?.command;
    if (command === undefined || command.includes("<defunct>")) continue;
    if (!owns(command)) {
      console.error("DIAGNOSTIC_PID_REUSED", JSON.stringify({ pid, command }));
      continue;
    }
    try { process.kill(pid, "SIGKILL"); } catch { /* It ended after the census. */ }
  }
}
