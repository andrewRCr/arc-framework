/** Runtime identity decides main status; physical-path fallback handles linked script entries. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { isMainModule } from "../../../src/lib/main-module.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-main-module-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source"), other = join(root, "other");
  await Promise.all([mkdir(source), mkdir(other)]);
  const file = join(source, "main.ts");
  await Promise.all([writeFile(file, ""), writeFile(join(other, "main.ts"), "")]);
  return { root, source, file, other: join(other, "main.ts"), meta: { url: pathToFileURL(file).href, main: undefined } };
}

it("uses a positive runtime main signal without resolving the entry", async () => {
  await expect(isMainModule({ url: "file:///unavailable/module.ts", main: true }, undefined)).resolves.toBe(true);
});

it("uses a negative runtime main signal even when both paths identify the same file", async () => {
  const { file, meta } = await fixture();
  await expect(isMainModule({ ...meta, main: false }, file)).resolves.toBe(false);
});

it("recognizes the same physical entry without a runtime main signal", async () => {
  const { file, meta } = await fixture();
  await expect(isMainModule(meta, file)).resolves.toBe(true);
});

it("recognizes a relative entry without a runtime main signal", async () => {
  const { file, meta } = await fixture();
  await expect(isMainModule(meta, relative(process.cwd(), file))).resolves.toBe(true);
});

it("recognizes an entry reached through a linked directory", async () => {
  const { root, source, meta } = await fixture();
  const linked = join(root, "linked");
  await symlink(source, linked, "junction");
  await expect(isMainModule(meta, join(linked, "main.ts"))).resolves.toBe(true);
});

it("keeps a different file with the same basename imported", async () => {
  const { other, meta } = await fixture();
  await expect(isMainModule(meta, other)).resolves.toBe(false);
});

it("keeps an absent entry imported", async () => {
  const { meta } = await fixture();
  await expect(isMainModule(meta, undefined)).resolves.toBe(false);
});

it("keeps an unresolvable entry imported", async () => {
  const { root, meta } = await fixture();
  await expect(isMainModule(meta, join(root, "missing.ts"))).resolves.toBe(false);
});
