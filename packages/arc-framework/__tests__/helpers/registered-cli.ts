/** Dispatch through the real CLI registration tree without replacing its action inputs. */
import { vi } from "vitest";
import type { Command } from "commander";

/** Load an unparsed production tree and run argv through its real Commander actions.
 * @param argv - User arguments, excluding the Node executable and entry path.
 * @returns Completion of the action registered by cli.ts; parser failures throw.
 */
export async function dispatchRegisteredCli(argv: readonly string[]): Promise<void> {
  vi.resetModules();
  const { Command: CommanderCommand } = await import("commander");
  const captured: { program?: Command } = {};
  const entry = vi.spyOn(CommanderCommand.prototype, "parseAsync").mockImplementationOnce(function (this: Command) {
    captured.program = this;
    return Promise.resolve(this);
  });
  const originalArgv = process.argv;
  process.argv = [process.execPath, "arc", ...argv];
  try {
    try { await import("../../src/cli.js"); } finally { entry.mockRestore(); }
    if (captured.program === undefined) throw new Error("cli.ts did not register a Commander entry.");
    captured.program.exitOverride();
    await captured.program.parseAsync(process.argv);
  } finally { process.argv = originalArgv; }
}
