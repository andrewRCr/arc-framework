/** The aside folder's copies and staged files, and what their names record. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createStagedFile, nameAsideFile, parseAsideFile, processScopeDigest,
} from "../../../../src/lib/store/projection/aside.js";

const writer = { pid: 4242, processInstance: "0b7c2d4e-91aa-4f3e-8c55-6d1e2f3a4b5c", processScope: "pid:[4026531836]" };
const base = "a".repeat(40);

describe("the aside folder's names", () => {
  it("gives two moves of one file in one command distinct names", () => {
    const move = { path: ".arc/active/current/meta-alpha.md", base, writer, role: "aside" as const };
    expect(nameAsideFile(move)).not.toBe(nameAsideFile(move));
  });

  it.each([
    [".arc/active/current/meta-alpha.md", "a".repeat(40), "aside"],
    [".arc/backlog/planned/state-storage/draft-beta.md", "b".repeat(64), "staged"],
  ] as const)("parses %s's copy back to its path, base, writer, and role", (path, blob, role) => {
    const parsed = parseAsideFile(nameAsideFile({ path, base: blob, writer, role }));
    expect(parsed).toEqual({
      path, base: blob, role, nonce: expect.stringMatching(/^[0-9a-f]+$/u),
      writer: { pid: 4242, processInstance: writer.processInstance, scopeDigest: processScopeDigest(writer.processScope) },
    });
  });

  it.each([
    ["a path outside .arc/", { path: "README.md" }],
    ["a path in the aside folder", { path: ".arc/system/.local/projection/reference" }],
    ["a writer instance a name cannot hold", { writer: { ...writer, processInstance: "a.b" } }],
  ] as const)("refuses to name %s", (_case, change) => {
    expect(() => nameAsideFile({ path: ".arc/active/current/meta-alpha.md", base, writer, role: "aside", ...change }))
      .toThrow();
  });

  it("keeps every folder and name within 255 bytes for a deep backlog path in a SHA-256 repository", () => {
    // This repository's deepest backlog path.
    const path = ".arc/backlog/planned/approval-flow-refinement/lifecycle-advancement-provenance/"
      + "draft-lifecycle-advancement-provenance.md";
    const widest = { pid: 4_294_967_295, processInstance: writer.processInstance, processScope: `linux:unknown:${writer.processInstance}` };
    for (const role of ["aside", "staged"] as const) {
      const location = nameAsideFile({ path, base: "f".repeat(64), writer: widest, role });
      for (const segment of location.split("/")) expect(Buffer.byteLength(segment), segment).toBeLessThanOrEqual(255);
    }
  });

  it("creates a staged file exclusively, leaving the first where a second takes its name", async () => {
    const checkout = await mkdtemp(join(tmpdir(), "arc-projection-staged-"));
    try {
      const location = nameAsideFile({ path: ".arc/active/current/meta-alpha.md", base, writer, role: "staged" });
      await createStagedFile(checkout, location, "first\n");
      await expect(createStagedFile(checkout, location, "second\n")).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(join(checkout, location), "utf8")).toBe("first\n");
    } finally {
      await rm(checkout, { recursive: true, force: true });
    }
  });
});
