/** Observable typed-file reads over filesystem fixtures. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { readTypedProjectFile } from "../../../src/lib/config/typed-file-reader.js";

const schema = z.strictObject({ count: z.number(), enabled: z.boolean(), items: z.array(z.string()) });
let root: string;
let file: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-typed-config-"));
  file = join(root, ".arc", "system", "arc-checks.yml");
  await mkdir(join(root, ".arc", "system"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("readTypedProjectFile", () => {
  it("preserves typed YAML values and reports the repository-relative location", async () => {
    await writeFile(file, "count: 2\nenabled: true\nitems: [first, second]\n");
    expect(await readTypedProjectFile(root, "check-declaration", schema)).toEqual({
      status: "valid",
      location: ".arc/system/arc-checks.yml",
      value: { count: 2, enabled: true, items: ["first", "second"] },
    });
  });

  it("reads JSON through the same typed boundary", async () => {
    const value = { count: 3, enabled: false, items: ["json"] };
    await writeFile(file, JSON.stringify(value));
    expect(await readTypedProjectFile(root, "check-declaration", schema)).toMatchObject({ status: "valid", value });
  });

  it("distinguishes a missing file from invalid content", async () => {
    expect(await readTypedProjectFile(root, "check-declaration", schema)).toEqual({
      status: "absent", location: ".arc/system/arc-checks.yml",
    });
  });

  it("returns a refusal with the YAML parse location", async () => {
    await writeFile(file, "count: [\n");
    const result = await readTypedProjectFile(root, "check-declaration", schema);
    expect(result).toMatchObject({ status: "invalid", location: ".arc/system/arc-checks.yml" });
    if (result.status === "invalid") expect(result.message).toContain("(2:1)");
  });

  it("returns schema violations naming their field paths", async () => {
    await writeFile(file, "count: invalid\nenabled: true\nitems: [1]\n");
    const result = await readTypedProjectFile(root, "check-declaration", schema);
    expect(result).toMatchObject({ status: "invalid", location: ".arc/system/arc-checks.yml" });
    if (result.status === "invalid") {
      expect(result.message).toContain("count:");
      expect(result.message).toContain("items.0:");
    }
  });

  it("reports an unreadable file as invalid rather than absent", async () => {
    await mkdir(file);
    expect(await readTypedProjectFile(root, "check-declaration", schema)).toMatchObject({
      status: "invalid", location: ".arc/system/arc-checks.yml",
    });
  });
});
