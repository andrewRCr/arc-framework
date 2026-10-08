/** Root and package build scripts publish native qualified output through one owner. */
import { execa } from "execa";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DEV_BUILD_STAMP_NAME, parseBuildEvidence } from "../../src/lib/build-evidence.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";


it.each([
  ["root", "build"], ["root", "build:fast"], ["package", "build"], ["package", "build:fast"],
] as const)("%s %s establishes absent output through its declared generation mode", async (boundary, command) => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  await rm(join(packageRoot, "dist"), { recursive: true });
  const cwd = boundary === "root" ? root : packageRoot;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const stamp = join(packageRoot, "dist", DEV_BUILD_STAMP_NAME);
  try {
    await execa(npm, ["run", command], { cwd, maxBuffer: 16 * 1024 * 1024 });
    const first = parseBuildEvidence(JSON.parse(await readFile(stamp, "utf8")));
    expect(first?.qualification).toEqual({ published: true, declarations: command === "build" });
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
    expect(await readdir(join(packageRoot, "dist"))).not.toContain("schemas");
    if (boundary === "root" && command === "build") {
      await execa(npm, ["run", command], { cwd, maxBuffer: 16 * 1024 * 1024 });
      const second = parseBuildEvidence(JSON.parse(await readFile(stamp, "utf8")));
      expect(second?.generation).not.toBe(first?.generation);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("allows another checkout's public build to complete while the first owns artifacts", async () => {
  const first = await makeNativeBuildFixture();
  const second = await makeNativeBuildFixture();
  let done: Promise<void> | undefined;
  try {
    await withBuildArtifactOwnership({ packageRoot: first.packageRoot, operation: "supported controller closing" }, async () => {
      const command = startFastCommand(second.root);
      done = command.done;
      const state = await Promise.race([
        command.done.then(() => "completed"), command.waiting.then(() => "queued"),
      ]);
      expect(state).toBe("completed");
      expect(await readFile(join(second.packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
      expect(await readFile(join(first.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    });
  } finally {
    await done?.catch(() => undefined);
    await rm(first.root, { recursive: true, force: true });
    await rm(second.root, { recursive: true, force: true });
  }
}, 30_000);

function startFastCommand(cwd: string): { done: Promise<void>; waiting: Promise<void> } {
  let reportWaiting: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { reportWaiting = resolve; });
  const child = execa("npm", ["run", "build:fast"], { cwd, maxBuffer: 16 * 1024 * 1024 });
  let diagnostic = "";
  child.stderr?.on("data", (bytes: Buffer) => {
    diagnostic += bytes.toString();
    if (diagnostic.includes("held by supported controller closing")) reportWaiting?.();
  });
  const done = child.then(() => undefined);
  void done.catch(() => undefined);
  return { done, waiting };
}

it("queues a public build behind same-checkout controller ownership", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  let done: Promise<void> | undefined;
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "supported controller closing" }, async () => {
      const command = startFastCommand(root);
      done = command.done;
      const state = await Promise.race([
        command.done.then(() => "completed"), command.waiting.then(() => "queued"),
      ]);
      expect(state).toBe("queued");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    });
    await done;
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
  } finally {
    await done?.catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
