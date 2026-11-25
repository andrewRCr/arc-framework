/** Native bulk-write cost and byte preservation through the public storage boundary. */
import { describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";

const provenance = { verb: "test-write", lifecycleAction: "update" };

describe.each(["sha1", "sha256"] as const)("bulk ref objects (%s)", (objectFormat) => {
  describe.each(["default", "separate"] as const)("%s layout", (layout) => {
  it("stores many nested documents byte-for-byte with bounded object-writing process cost", async () => {
    const f = await createRefReadFixture("files", undefined, objectFormat);
    await f.exec("git", ["config", "core.autocrlf", "true"]);
    if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    let objectProcesses = 0;
    const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      if (args.includes("hash-object") || args.includes("mktree")) objectProcesses += 1;
      return f.ports.rawExec(args, options);
    } });
    const writes = Array.from({ length: 18 }, (_, i) => ({ action: "put" as const, expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" },
        kind: "personal/document", key: `folder-${i}/notes` }),
      content: `document ${i}\r\n雪\r\n\r\n` }));
    expect(await store.batch({ provenance, writes })).toMatchObject({ status: "ok" });
    const writeProcesses = objectProcesses;
    for (const write of writes) {
      expect(await store.read({ reference: write.reference })).toMatchObject({ status: "ok", result: { content: write.content } });
    }
    expect(writeProcesses).toBeLessThanOrEqual(4);
  }, 30_000);
  });
});


describe("interrupted object staging", () => {
  it.each(["file-write", "native-write", "object-identity"] as const)("cleans %s failure and permits a fresh retry", async (fault) => {
    const f = await createRefReadFixture();
    let failed = false, files = 0;
    const store = createRefStore({ ...f.ports, fs: { ...f.ports.fs, writeBytes: async (path, bytes) => {
      if (fault === "file-write" && !failed && ++files === 2) { failed = true; throw new Error("Interrupted object staging"); }
      return f.ports.fs.writeBytes(path, bytes);
    } }, rawExec: async (args, options) => {
      if (args.includes("--stdin-paths") && !failed && fault !== "file-write") {
        failed = true;
        if (fault === "native-write") throw new Error("Interrupted object staging");
        return { stdout: Buffer.from("0".repeat(40) + "\n"), stderr: new Uint8Array() };
      }
      return f.ports.rawExec(args, options);
    } });
    const writes = ["first", "second"].map((key) => ({ action: "put" as const, expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key }),
      content: key + "\r\n" }));
    await expect(store.batch({ provenance, writes })).rejects.toThrow();
    expect(await store.read({ reference: writes[0]!.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await readdir(join(f.root, ".git", "arc"))).filter((name) => name.startsWith("object-stage-"))).toEqual([]);
    expect(await store.batch({ provenance, writes })).toMatchObject({ status: "ok" });
    for (const write of writes) {
      expect(await store.read({ reference: write.reference })).toMatchObject({ status: "ok", result: { content: write.content } });
    }
  }, 30_000);
});
