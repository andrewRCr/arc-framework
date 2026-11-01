import { expect, it } from "vitest";

import { PullResultSchema } from "../../src/lib/store/sync.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { provenance } from "../helpers/store/remote-move.js";

it("reports a lost local negotiation tip and resumes the pull after restoration", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "incoming.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Incoming state.\n", provenance }));
  success(await h.a.store.push());
  const ref = "refs/arc/work/12345678-1234-4234-8234-123456789abc";
  const { tip } = await plantRef(h.b.root, ref, []);
  const bytes = (await h.b.ports.rawExec(["cat-file", "commit", tip], { cwd: h.b.root })).stdout;
  await removeLooseObject(h.b.root, tip);
  const result = success(await h.b.store.pull());
  expect(result).toMatchObject({ pulls: [{ remote: "origin", status: "failed", failure: {
    code: "refused", class: "terminal", condition: expect.stringContaining(ref),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } }] });
  expect(PullResultSchema.safeParse(result).success).toBe(true);
  const restored = await h.b.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: h.b.root, input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(tip);
  expect(success(await h.b.store.pull()).pulls).toEqual([expect.objectContaining({ status: "pulled" })]);
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming state.\n");
}, 60_000);

it("confirms a failed fetch's named missing parent in local history and resumes after restoration", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "ancestry.md" });
  const put = async (content: string) => {
    const current = await h.a.store.read({ reference });
    success(await h.a.store.write({ action: "put", reference, expected: current.status === "ok" ? current.result.version : null, content, provenance }));
    success(await h.a.store.push());
  };
  await put("First state.\n");
  success(await h.b.store.pull());
  const missing = (await h.b.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
  await put("Second state.\n");
  success(await h.b.store.pull());
  await put("Third state.\n");
  const bytes = (await h.b.ports.rawExec(["cat-file", "commit", missing], { cwd: h.b.root })).stdout;
  await removeLooseObject(h.b.root, missing);
  const result = success(await h.b.store.pull());
  expect(result).toMatchObject({ pulls: [{ status: "failed", failure: {
    code: "refused", class: "terminal", condition: expect.stringContaining(missing),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } }] });
  const failure = result.pulls[0];
  if (failure?.status !== "failed") throw new Error("Expected a failed fetch");
  expect(failure.failure.condition).toMatch(/Could not read|could not parse commit|did not send all necessary objects/u);
  const restored = await h.b.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: h.b.root, input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(missing);
  expect(success(await h.b.store.pull()).pulls).toEqual([expect.objectContaining({ status: "pulled" })]);
  expect(success(await h.b.store.read({ reference })).content).toBe("Third state.\n");
}, 60_000);
