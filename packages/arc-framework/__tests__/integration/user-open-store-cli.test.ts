/** Registered user-open refusal preserves operational state and creates no legacy workspace. */
import { access } from "node:fs/promises";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { resolvePersonalPaths } from "../../src/lib/personal-paths.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

it("refuses off-branch workspace creation with the emitted meta handoff remedy", async () => {
  const f = await repairCliFixture();
  const primary = await f.h.workUnit("user-open");
  const store = f.h.context.store;
  const before = await store.version();
  const paths = await resolvePersonalPaths({ cwd: f.cwd, exec: f.exec, identity: f.h.context.identity });
  const workspace = paths.workUnitRoot(SlugSchema.parse(primary.reference.owner.name));
  await expect(access(workspace)).rejects.toMatchObject({ code: "ENOENT" });
  const result = await repairCli(f, ["user", "open", primary.reference.owner.name]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toMatch(/unsupported.*meta.*session context.*arc handoff write/isu);
  expect(await store.version()).toEqual(before);
  expect(await store.read({ reference: primary.reference })).toEqual({ status: "ok", result: primary });
  await expect(access(workspace)).rejects.toMatchObject({ code: "ENOENT" });
});
