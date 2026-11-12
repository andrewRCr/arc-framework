/** Companion listings retain owner and placement acquisition failures. */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { StateVersionSchema } from "../../src/lib/store/identity.js";
import { ListInputSchema } from "../../src/lib/store/read.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe("companion acquisition diagnostics", () => {
  for (const kind of ["work-item/notes", "work-item/companion"] as const) {
    for (const failure of ["owner", "placement"] as const) {
      it(`retains ${failure} failures for ${kind} in live and saved listings until repaired`, async () => {
        const h = await trackedWriteFixture();
        const slug = failure === "owner" ? "Bad_Name" : "example";
        const directory = failure === "owner" ? ".arc/active" : ".arc/completed";
        const meta = `${directory}/meta-${slug}.md`;
        const companion = `${directory}/${kind === "work-item/notes" ? "notes" : "research"}-${slug}.md`;
        const put = async (path: string, content: string) => {
          await mkdir(dirname(join(h.root, path)), { recursive: true });
          await writeFile(join(h.root, path), content);
        };
        const content = "retained companion bytes\n";
        await put(meta, makeMetaFixture("example"));
        await put(companion, content);
        await h.exec("git", ["add", "."]);
        await h.exec("git", ["commit", "-m", "Save incomplete companion coordinates"]);
        const asOf = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
        const input = ListInputSchema.parse({ family: "work-item", kind, filter: { heldHere: true } });
        for (const query of [input, { ...input, asOf }]) {
          expect(success(await h.store.list(query))).toMatchObject({ status: "complete", missed: true,
            records: [], diagnostics: [expect.objectContaining({ kind: "malformed", key: meta,
              remedy: { text: expect.stringContaining("Repair") } })] });
        }
        const repairedDirectory = failure === "owner" ? ".arc/active" : ".arc/completed/2026-q4/01_example";
        await mkdir(join(h.root, repairedDirectory), { recursive: true });
        await rename(join(h.root, meta), join(h.root, `${repairedDirectory}/meta-example.md`));
        await rename(join(h.root, companion), join(h.root, `${repairedDirectory}/${kind === "work-item/notes" ? "notes" : "research"}-example.md`));
        expect(success(await h.store.list(input))).toMatchObject({ status: "complete", missed: false,
          diagnostics: [], records: [expect.objectContaining({ content })] });
        await h.exec("git", ["add", "-A"]);
        await h.exec("git", ["commit", "-m", "Repair companion coordinates"]);
        const repairedState = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
        expect(success(await h.store.list({ ...input, asOf: repairedState }))).toMatchObject({ status: "complete",
          missed: false, records: [expect.objectContaining({ content })] });
      });
    }
  }
});
