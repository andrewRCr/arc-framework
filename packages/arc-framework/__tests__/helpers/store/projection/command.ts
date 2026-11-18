/** Drive projection command hooks and handlers through Commander-generated inputs, retaining their public output. */
import { Command } from "commander";
import { vi } from "vitest";
import type { ProjectionCommandInput } from "../../../../src/lib/store/projection/engine.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { readProjectionStatus } from "../../../../src/lib/store/projection/status.js";
import { handleEdit } from "../../../../src/handlers/edit.js";
import { handleSave } from "../../../../src/handlers/save.js";

export async function projectionCommand(input: ProjectionCommandInput, args: readonly string[]) {
  const program = new Command("arc").exitOverride(), previous = process.exitCode;
  let output = "", diagnostics = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { diagnostics += String(chunk); return true; });
  program.command("edit <path>").option("--json").action(async (path: string, options: { json?: boolean }) => {
    await handleEdit({ path, ...options }, input.store, input.checkout);
  });
  program.command("save").option("--json").option("--resolve <conflict>")
    .action(async (options: { json?: boolean; resolve?: string }) => { await handleSave(options, input.store); });
  program.command("status").option("--json").action(async () => {
    process.stdout.write(JSON.stringify(await readProjectionStatus(input)) + "\n");
  });
  program.command("sync").option("--json").action(async () => {
    await restoreSyncProjection(input.store, input.checkout, {});
    process.stdout.write("{}\n");
  });
  registerProjectionHooks(program, { input: () => input, writeError: text => { diagnostics += text; } });
  try {
    process.exitCode = undefined;
    await program.parseAsync([...args, "--json"], { from: "user" });
    return { result: JSON.parse(output) as unknown, diagnostics, exitCode: process.exitCode ?? 0 };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.exitCode = previous; }
}
