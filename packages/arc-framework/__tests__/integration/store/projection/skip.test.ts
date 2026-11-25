/** A one-command projection bypass preserves edits for the next ordinary start. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Command } from "commander";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";

const directories: string[] = [];
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("leaves a pending edit and retained payload untouched under the switch, then sends the next ordinary command", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("pending edit\n");
  const orphan = join(h.location.stateDir, TAKEN_IN_FOLDER, "unreferenced");
  await mkdir(join(h.location.stateDir, TAKEN_IN_FOLDER), { recursive: true });
  await writeFile(orphan, "retained payload");
  const before = success(await h.store.version());
  const input = { store: h.store, checkout: h.checkout };
  const ports = () => { throw new Error("An explicit skip must resolve no projection I/O"); };
  await startProjection({ ...input, skipProjection: true, ports });
  await endProjection({ ...input, ports });
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toContain("pending edit");
  expect(await readFile(orphan, "utf8")).toBe("retained payload");
  expect(success(await h.store.version())).toBe(before);
  expect(projectionProcessState()).toMatchObject({ start: { kind: "skipped", skip: { reason: "switch" } } });
  await startProjection(input);
  expect((await h.stored()).content).toBe("pending edit\n");
  await endProjection(input);
});

it.each([{ args: ["--skip-projection", "probe"] }, { args: ["probe", "--skip-projection"] }])("bypasses only the command carrying $args through Commander", async ({ args }) => {
  const h = await createEngineFixture(directories);
  await h.edit("pending command edit\n");
  const output: string[] = [];
  const run = async (argv: string[]) => {
    const program = new Command("arc").exitOverride().option("--skip-projection");
    program.command("probe").action(() => { output.push("executed"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: () => undefined });
    await program.parseAsync(argv, { from: "user" });
  };
  await run(args);
  expect(output).toEqual(["executed"]);
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toContain("pending command edit");
  await run(["probe"]);
  expect(output).toEqual(["executed", "executed"]);
  expect((await h.stored()).content).toBe("pending command edit\n");
});
