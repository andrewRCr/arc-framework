import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  resolveBacklogStub,
  listBacklogStubs,
} from "../../../src/lib/work-unit/backlog-stub.js";

describe("resolveBacklogStub", () => {
  let root: string;

  /**
   * Seed a stub at `<root>/.arc/backlog/<...segments>/<slug>/`, always writing
   * `meta-<slug>.md` and, when `draft` is set, a sibling `draft-<slug>.md`.
   */
  async function seedStub(
    segments: string[],
    slug: string,
    opts: { draft?: boolean } = {},
  ): Promise<string> {
    const dir = join(root, ".arc", "backlog", ...segments, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `meta-${slug}.md`), "# meta\n", "utf8");
    if (opts.draft) await writeFile(join(dir, `draft-${slug}.md`), "# draft\n", "utf8");
    return dir;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-backlog-stub-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves a planned stub to its dir, state-dir, meta, and draft", async () => {
    const dir = await seedStub(["planned"], "alpha", { draft: true });

    const stub = await resolveBacklogStub(root, "alpha");

    expect(stub).toEqual({
      slug: "alpha",
      dir,
      stateDir: "planned",
      metaPath: join(dir, "meta-alpha.md"),
      draftPath: join(dir, "draft-alpha.md"),
    });
  });

  it("resolves a provisional stub", async () => {
    const dir = await seedStub(["provisional"], "beta", { draft: true });

    const stub = await resolveBacklogStub(root, "beta");

    expect(stub).toMatchObject({ slug: "beta", dir, stateDir: "provisional" });
  });

  it("resolves a cohort-nested stub", async () => {
    const dir = await seedStub(["planned", "my-cohort"], "gamma", { draft: true });

    const stub = await resolveBacklogStub(root, "gamma");

    expect(stub).toMatchObject({
      slug: "gamma",
      dir,
      stateDir: "planned",
      draftPath: join(dir, "draft-gamma.md"),
    });
  });

  it("returns draftPath null for a stub dir with no draft", async () => {
    await seedStub(["planned"], "delta");

    const stub = await resolveBacklogStub(root, "delta");

    expect(stub?.draftPath).toBeNull();
  });

  it("returns null when no stub matches the slug in either state-dir", async () => {
    await seedStub(["planned"], "alpha");

    expect(await resolveBacklogStub(root, "nope")).toBeNull();
  });

  it("lists every stub across both state-dirs for disambiguation", async () => {
    await seedStub(["planned"], "alpha", { draft: true });
    await seedStub(["planned", "my-cohort"], "gamma");
    await seedStub(["provisional"], "beta");

    const stubs = await listBacklogStubs(root);

    expect(stubs.map((s) => s.slug).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(stubs.map((s) => s.stateDir).sort()).toEqual(["planned", "planned", "provisional"]);
  });
});
