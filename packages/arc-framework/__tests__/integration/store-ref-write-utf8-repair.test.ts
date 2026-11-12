import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("captured write-check bytes in %s", layout => {
  it("types invalid prior UTF-8 at the captured version and retries after object restoration", async () => {
    const f = await createRefFixture({ "personal/document": { check: async () => [] } }, layout);
    const record = await seed(f, f.reference("personal/document"), "Original readable content.\n");
    const home = expandStoredPath(record.reference), gitDir = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...gitDir, "rev-parse", `${home.ref}:${home.path}`], { cwd: f.root })).stdout.trim();
    const objectPath = join(f.gitDir ?? join(f.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    const original = await readFile(objectPath), bytes = Buffer.from([0x80, 0xff]);
    const input = { action: "put" as const, reference: record.reference, expected: record.version,
      content: "Updated readable content.\n", provenance: { verb: "save", lifecycleAction: "save" } };
    let refused: unknown;
    const store = createRefStore(f.ports);
    try {
      await rm(objectPath);
      await writeFile(objectPath, deflateSync(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])), { mode: 0o444 });
      const actual = await f.ports.rawExec([...gitDir, "cat-file", "blob", oid], { cwd: f.root });
      expect(Buffer.from(actual.stdout)).toEqual(bytes);
      refused = await store.write(input).catch((error: unknown) => error);
    } finally { await rm(objectPath, { force: true }); await writeFile(objectPath, original, { mode: 0o444 }); }
    expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      condition: expect.stringMatching(/UTF-8/iu), remedy: { text: expect.stringMatching(/restore|repair/iu) } } });
    success(await store.write(input));
    expect(success(await store.read({ reference: record.reference })).content).toBe(input.content);
  });
});
