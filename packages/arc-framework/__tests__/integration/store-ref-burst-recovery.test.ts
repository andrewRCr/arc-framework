/** The Windows burst's recovery accepts only a refusal naming an observed stranded native lock. */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { recoverStrandedBurstPublication } from "../helpers/store/burst-recovery.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key,
  owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

it.each([
  { layout: "default", phase: "fetch", repair: "named" }, { layout: "separate", phase: "fetch", repair: "named" },
  { layout: "default", phase: "acknowledgment", repair: "named" }, { layout: "separate", phase: "acknowledgment", repair: "named" },
  { layout: "default", phase: "fetch", repair: "disappeared" },
] as const)("handles the $repair stranded $phase lock and converges the $layout publication", async ({ layout, phase, repair }) => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
  success(await h.a.store.write({ action: "put", reference: personal("seed.md"), expected: null, content: "seed\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  success(await h.b.store.write({ action: "put", reference: personal("pending.md"), expected: null, content: "pending\n", provenance }));
  if (phase === "fetch") {
    success(await h.a.store.write({ action: "put", reference: personal("incoming.md"), expected: null, content: "incoming\n", provenance }));
    success(await h.a.store.push());
  }
  const directory = join(h.b.root, ".git", ...layout === "separate" ? ["arc", "store"] : []);
  const format = (await h.b.git(["rev-parse", "--show-ref-format"])).stdout.trim();
  const tracking = `refs/arc-remotes/${h.remoteName}/user/andrew/personal`;
  const lock = join(directory, format === "files" ? `${tracking}.lock` : "reftable/tables.list.lock");
  let planted = false;
  const plant = async () => { planted = true; await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Stranded after writer exit\n"); };
  const bounded = (args: string[]) => args.map(arg => arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0"));
  const store = createRefStore({ ...h.b.ports, ...clock,
    execInput: (args, input, options) => h.b.ports.execInput(bounded(args), input, options),
    exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, bounded(args), options);
      if (!planted && phase === "acknowledgment" && args.includes("push") && args.includes("--porcelain")) await plant();
      return result;
    },
  });
  if (phase === "fetch") await plant();
  const publication = await store.push();
  expect(planted).toBe(true);
  if (phase === "acknowledgment" || format !== "files") expect(publication).toMatchObject({ status: "refused", refusal: { code: "lock-held", lock } });
  else expect(success(publication).publishes).toContainEqual(expect.objectContaining({ status: "failed",
    failure: expect.objectContaining({ code: "refused", condition: expect.stringContaining(lock) }) }));
  expect(await readFile(lock, "utf8")).toBe("Stranded after writer exit\n");
  if (repair === "disappeared") {
    await unlink(lock);
    const unrelated = join(directory, "refs", "arc", "user", "andrew", "personal.lock");
    await mkdir(dirname(unrelated), { recursive: true }); await writeFile(unrelated, "Unrelated candidate\n");
    await expect(recoverStrandedBurstPublication({ root: h.b.root, layout, publication, store }))
      .rejects.toThrow("did not name an observed stranded lock");
    expect(await readFile(unrelated, "utf8")).toBe("Unrelated candidate\n");
    await unlink(unrelated);
  }
  const repaired = success(repair === "disappeared" ? await store.push()
    : await recoverStrandedBurstPublication({ root: h.b.root, layout, publication, store }));
  expect(repaired.publishes.every(row => row.status !== "failed"), JSON.stringify(repaired)).toBe(true);
  await expect(readFile(lock)).rejects.toMatchObject({ code: "ENOENT" });
  success(await h.a.store.pull());
  expect(success(await h.a.store.read({ reference: personal("pending.md") })).content).toBe("pending\n");
  if (phase === "fetch") expect(success(await h.b.store.read({ reference: personal("incoming.md") })).content).toBe("incoming\n");
});
