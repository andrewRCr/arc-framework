/** Review bytes retain placement from their own checkout without branch composition. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { createStore } from "../../../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { digestBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { resolveCandidateRecordRelativePath } from "../../../../src/lib/work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../../../../src/lib/work-unit/submission-boundary-store.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";
import { candidateFixture, boundaryFixture } from "../../../helpers/store/tracked-write-fixture.js";

const noGit = async (): Promise<never> => { throw new Error("Branch acquisition is unavailable"); };
const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });

async function fixture(kind: "review/candidate" | "review/integration-boundary") {
  const root = await mkdtemp(join(tmpdir(), "arc-store-review-read-"));
  onTestFinished(async () => rm(root, { recursive: true, force: true }));
  const ports = testStorePorts(root, noGit, noGit);
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  const content = JSON.stringify(kind === "review/candidate" ? candidateFixture() : boundaryFixture());
  const plant = () => put(kind === "review/candidate"
    ? resolveCandidateRecordRelativePath("example") : resolveSubmissionBoundaryPath("example"), content);
  return { root, ports, put, plant, content, store: createStore(ports), reference: recordReferences[kind](owner) };
}

describe.each(["review/candidate", "review/integration-boundary"] as const)("%s checkout placement", (kind) => {
  it("reads a completed owner without composed lifecycle acquisition", async () => {
    const h = await fixture(kind);
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }));
    await h.plant();
    await expect(h.store.read({ reference: h.reference })).resolves.toMatchObject({ status: "ok", result: {
      content: h.content, version: digestBytes(Buffer.from(h.content)),
      placement: { kind: "completed", quarter: "2026-q4", sequence: "01" },
    } });
  });

  it.each(["EACCES", "EPERM"])("reads a held owner beside a lifecycle tier denied with %s", async (code) => {
    const h = await fixture(kind);
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }));
    await h.put(".arc/backlog/planned/denied/meta-denied.md", makeMetaFixture("denied", { state: "Planning" }));
    await h.plant();
    const readdir = h.ports.fs.readdir;
    h.ports.fs.readdir = async (path) => {
      if (path === join(h.root, ".arc/backlog/planned")) throw Object.assign(new Error("Directory denied"), { code });
      return readdir(path);
    };
    await expect(h.store.read({ reference: h.reference })).resolves.toMatchObject({ status: "ok", result: {
      content: h.content, placement: { kind: "completed", quarter: "2026-q4", sequence: "01" },
    } });
  });

  it("selects the flat-active owner before acquiring other lifecycle tiers", async () => {
    const h = await fixture(kind);
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }));
    await h.plant();
    const readdir = h.ports.fs.readdir;
    h.ports.fs.readdir = async (path) => {
      if (path === join(h.root, ".arc/backlog/planned")) throw Object.assign(new Error("Device unavailable"), { code: "EIO" });
      return readdir(path);
    };
    await expect(h.store.read({ reference: h.reference })).resolves.toMatchObject({ status: "ok", result: {
      content: h.content, placement: { kind: "active" },
    } });
  });

  it("returns not-found for absent review bytes before acquiring owner placement", async () => {
    const h = await fixture(kind);
    h.ports.fs.readdir = async () => { throw Object.assign(new Error("Device unavailable"), { code: "EIO" }); };
    await expect(h.store.read({ reference: h.reference })).resolves.toMatchObject({ status: "refused",
      refusal: { code: "not-found" } });
  });
});
