/** A copied checkout runs its own built CLI, or the primary copy's from that checkout where it has none. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { defaultWindowRehearsalLauncher } from "../../../../src/scripts/cutover-window/rehearse-launch.js";

const packageRoot = ["packages", "arc-framework"];

it("launches a checkout's own build, and the primary copy's where the checkout has no built bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-window-rehearse-launch-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const [primary, built, unbuilt, misbuilt] = ["primary", "built", "unbuilt", "misbuilt"].map(name => join(root, name)) as [string, string, string, string];
  for (const checkout of [primary, built]) {
    await mkdir(join(checkout, ...packageRoot, "dist"), { recursive: true });
    await writeFile(join(checkout, ...packageRoot, "dist", "cli.js"), "");
  }
  await mkdir(join(unbuilt, ...packageRoot), { recursive: true });
  await mkdir(join(misbuilt, ...packageRoot, "dist", "cli.js"), { recursive: true });
  const launch = defaultWindowRehearsalLauncher(primary);
  const launcherOf = (checkout: string) => [process.execPath, join(checkout, ...packageRoot, "bin", "arc.js")];
  expect(await launch(built)).toEqual({ argv: launcherOf(built), cwd: built, own: true });
  expect(await launch(unbuilt)).toEqual({ argv: launcherOf(primary), cwd: unbuilt, own: false });
  expect(await launch(misbuilt)).toEqual({ argv: launcherOf(primary), cwd: misbuilt, own: false });
});
