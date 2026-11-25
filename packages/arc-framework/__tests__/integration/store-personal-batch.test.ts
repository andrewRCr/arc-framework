/** Complete personal preflight and restoration including an attempted failing target. */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { personalFixture, personalReference, personalDigest, personalProvenance } from "../helpers/store/personal-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { ArcError } from "../../src/lib/kernel/errors.js";

describe("personal batches", () => {
  it("reports every stale file before replacing any file", async () => {
    const h = await personalFixture();
    for (const name of ["one.md", "two.md", "three.md"]) success(await h.store.write({ action: "put", reference: personalReference("personal/document", name), expected: null, content: name, provenance: personalProvenance }));
    const refs = ["one.md", "two.md", "three.md"].map((key) => personalReference("personal/document", key));
    const writes = refs.map((reference, index) => ({ action: "put" as const, reference,
      expected: personalDigest(index === 1 ? "two.md" : "stale"), content: "changed" }));
    expect(await h.store.batch({ writes, provenance: personalProvenance })).toMatchObject({ status: "refused",
      refusal: { code: "version-conflict", records: [refs[0], refs[2]] } });
    for (const name of ["one.md", "two.md", "three.md"]) expect(await readFile(h.path(name), "utf8")).toBe(name);
  });

  it("writes a successful batch under one hold of the notes lock", async () => {
    const h = await personalFixture();
    const notes = h.ports.locks.notes;
    let holds = 0;
    h.ports.locks.notes = (operation) => { holds++; return notes(operation); };
    const writes = ["one.md", "two.md"].map((key) => ({ action: "put" as const, reference: personalReference("personal/document", key), expected: null, content: key }));
    const result = success(await h.store.batch({ writes, provenance: personalProvenance }));
    expect(holds).toBe(1);
    expect(result.writes).toHaveLength(2);
    for (const name of ["one.md", "two.md"]) expect(await readFile(h.path(name), "utf8")).toBe(name);
  });

  it("restores earlier writes, removals and the failing target's changed bytes", async () => {
    const h = await personalFixture();
    for (const name of ["one.md", "two.md", "three.md"]) success(await h.store.write({ action: "put", reference: personalReference("personal/document", name), expected: null, content: name, provenance: personalProvenance }));
    const write = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => {
      await write(path, content);
      if (path === h.path("three.md") && content === "changed") throw new Error("failure after replacement");
    };
    const writes = [
      { action: "put" as const, reference: personalReference("personal/document", "one.md"), expected: personalDigest("one.md"), content: "changed" },
      { action: "remove" as const, reference: personalReference("personal/document", "two.md"), expected: personalDigest("two.md") },
      { action: "put" as const, reference: personalReference("personal/document", "three.md"), expected: personalDigest("three.md"), content: "changed" },
    ];
    await expect(h.store.batch({ writes, provenance: personalProvenance })).rejects.toBeInstanceOf(ArcError);
    for (const name of ["one.md", "two.md", "three.md"]) expect(await readFile(h.path(name), "utf8")).toBe(name);
  });

  it("restores newly created targets to absence when a later writer fails", async () => {
    const h = await personalFixture();
    const write = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => { await write(path, content); if (path === h.path("two.md")) throw new Error("new target failure"); };
    const writes = ["one.md", "two.md"].map((key) => ({ action: "put" as const, reference: personalReference("personal/document", key), expected: null, content: key }));
    await expect(h.store.batch({ writes, provenance: personalProvenance })).rejects.toBeInstanceOf(ArcError);
    for (const name of ["one.md", "two.md"]) await expect(readFile(h.path(name))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("names every changed file when restoration itself fails", async () => {
    const h = await personalFixture();
    for (const name of ["one.md", "two.md"]) success(await h.store.write({ action: "put", reference: personalReference("personal/document", name), expected: null, content: name, provenance: personalProvenance }));
    const write = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => {
      if (content.endsWith(".md")) throw new Error("restore refused");
      await write(path, content);
      if (path === h.path("two.md")) throw new Error("failure after replacement");
    };
    const writes = ["one.md", "two.md"].map((key) => ({ action: "put" as const, reference: personalReference("personal/document", key), expected: personalDigest(key), content: "changed" }));
    let failure: unknown;
    try { await h.store.batch({ writes, provenance: personalProvenance }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ArcError);
    expect(failure).toMatchObject({ code: "store.restore-failed" });
    expect((failure as Error).message).toContain("one.md");
    expect((failure as Error).message).toContain("two.md");
    expect((failure as Error).message).toMatch(/restore.*by hand/iu);
    for (const name of ["one.md", "two.md"]) expect(await readFile(h.path(name), "utf8")).toBe("changed");
  });

  it("certifies restored bytes even when the restore writer throws after replacing them", async () => {
    const h = await personalFixture();
    for (const name of ["one.md", "two.md"]) success(await h.store.write({ action: "put", reference: personalReference("personal/document", name), expected: null, content: name, provenance: personalProvenance }));
    const write = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (path, content) => {
      await write(path, content);
      if (path === h.path("two.md") || content.endsWith(".md")) throw new Error("writer failed after replacement");
    };
    const writes = ["one.md", "two.md"].map((key) => ({ action: "put" as const, reference: personalReference("personal/document", key), expected: personalDigest(key), content: "changed" }));
    await expect(h.store.batch({ writes, provenance: personalProvenance })).rejects.toMatchObject({ code: "store.operation-failed" });
    for (const name of ["one.md", "two.md"]) expect(await readFile(h.path(name), "utf8")).toBe(name);
  });

  it("refuses a batch alias before an earlier valid mutation can replace the same file", async () => {
    const h = await personalFixture();
    const writes = [personalReference("personal/inbox"), personalReference("personal/document", "USER-INBOX.md")]
      .map((reference) => ({ action: "put" as const, reference, expected: null, content: "new bytes" }));
    expect(await h.store.batch({ writes, provenance: personalProvenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    await expect(readFile(h.path("USER-INBOX.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
