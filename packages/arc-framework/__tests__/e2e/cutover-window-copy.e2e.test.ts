/** The source CLI exposes a copy only after native isolation and host discovery succeed. */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { execa } from "execa";
import { expect, it, onTestFinished } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";

const entry = resolve(import.meta.dirname, "../../src/scripts/cutover-window/main.ts");
const repository = resolve(import.meta.dirname, "../../../..");

it("copies through the source CLI and refuses a copy with a discovered host", async () => {
  const h = await windowFixture(), root = await mkdtemp(join(tmpdir(), "arc-window-copy-cli-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"), response = join(root, "response"), shim = join(bin, "gh.cjs");
  await mkdir(bin);
  await writeFile(shim, `const fs = require("node:fs");
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["repo", "view", "--json", "nameWithOwner"])) process.exit(99);
if (fs.readFileSync(${JSON.stringify(response)}, "utf8") === "found") {
  process.stdout.write(JSON.stringify({ nameWithOwner: "owner/repository" }));
} else {
  process.stderr.write("none of the git remotes configured for this repository point to a known GitHub host\\n");
  process.exitCode = 1;
}
`);
  await writeFile(join(bin, "gh"), `#!/usr/bin/env node\nrequire(${JSON.stringify(shim)});\n`);
  await chmod(join(bin, "gh"), 0o755);
  await writeFile(join(bin, "gh.cmd"), `@"${process.execPath}" "${shim}" %*\r\n`);
  const run = (name: string) => execa(process.execPath, ["--import", "tsx", entry, "copy", "--repo", h.root,
    "--destination", join(root, name), "--json"], { cwd: repository, reject: false,
    env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, FORCE_COLOR: undefined, NO_COLOR: "1" } });
  await writeFile(response, "none");
  const copied = await run("safe");
  expect(copied.exitCode, copied.stderr).toBe(0);
  expect(JSON.parse(copied.stdout)).toMatchObject({ operation: "copy", status: "passed", data: {
    destination: join(root, "safe"), repo: join(root, "safe", "primary"), mirror: join(root, "safe", "mirror.git"),
  } });
  await writeFile(response, "found");
  const refused = await run("hosted");
  expect(refused.exitCode, refused.stderr).toBe(1);
  expect(JSON.parse(refused.stdout)).toMatchObject({ operation: "copy", status: "refused", findings: [
    join(root, "hosted", "primary"), join(root, "hosted", "mirror.git"),
  ].map(subject => expect.objectContaining({ subject, condition: expect.stringContaining("owner/repository") })) });
}, 60_000);
