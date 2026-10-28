/** Captured file verification refuses drift and permits repaired frozen inputs. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureEnvironmentInputs } from "../../../../../src/lib/checks/environment-inputs.js";
import { verifyCapturedEnvironment } from "../../../../../src/lib/checks/runner/environment-verify.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each(["bytes", "size", "directory", "symlink"])("refuses captured %s drift and validates after repair without the original file", async fault => {
  const directory = await mkdtemp(join(tmpdir(), "arc-verify-environment-"));
  directories.push(directory);
  const original = join(directory, "private-original");
  const bytes = Buffer.from([0, 255, 13, 10]);
  await writeFile(original, bytes);
  const captured = await captureEnvironmentInputs({ EXPLICIT_FILE: "file", SCALAR: "value", ABSENT: "file", EMPTY: "file" }, directory,
    { environment: { EXPLICIT_FILE: original, SCALAR: "literal\nvalue", EMPTY: "" } });
  const binding = captured.bindings.EXPLICIT_FILE;
  if (binding?.kind !== "file" || binding.state !== "file") throw new Error("Expected captured file");
  try {
    await unlink(original);
    if (fault === "bytes") await writeFile(binding.path, Buffer.from([1, 254, 13, 10]));
    else if (fault === "size") await writeFile(binding.path, "different length");
    else {
      await unlink(binding.path);
      if (fault === "directory") await mkdir(binding.path);
      else {
        const target = join(directory, "other-private-target");
        await writeFile(target, bytes);
        await symlink(target, binding.path, "file");
      }
    }
    await expect(verifyCapturedEnvironment(captured.bindings)).rejects.toThrow(/environment.*EXPLICIT_FILE.*repair.*retry/iu);
    if (fault === "directory") await rm(binding.path, { recursive: true });
    else if (fault === "symlink") await unlink(binding.path);
    await writeFile(binding.path, bytes);
    await expect(verifyCapturedEnvironment(captured.bindings)).resolves.toBeUndefined();
    expect(await readFile(binding.path)).toEqual(bytes);
    expect(captured.bindings.SCALAR).toEqual({ kind: "value", state: "set", value: "literal\nvalue" });
  } finally { await captured.dispose(); }
});
