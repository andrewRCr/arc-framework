/** Native stub, graduation, and parking history for the window's read-map scenarios. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { windowFixture } from "./fixture.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { composePointerRecord } from "../../../src/lib/work-unit/pointer-record.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";

/** Preserve a branch graduated from a committed planned stub, then commit its native parking pointer on main. */
export async function parkedWindowFixture() {
  const h = await windowFixture(), slug = SlugSchema.parse("parked"), branch = "feat/parked";
  const pointer = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug,
    placement: { kind: "backlog", commitment: "planned", cohort: [] } });
  const active = `.arc/active/meta-${slug}.md`;
  await mkdir(dirname(join(h.root, pointer)), { recursive: true });
  await writeFile(join(h.root, pointer), makeMetaFixture(slug, { state: "Planning", owner: "andrew", branch: "plan/parked" }));
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Plan a parked unit"]);
  await h.git("git", ["checkout", "-b", branch]);
  await h.git("git", ["mv", pointer, active]);
  await writeFile(join(h.root, active), makeMetaFixture(slug, { owner: "andrew", branch }));
  await writeFile(join(h.root, ".arc/active/notes-parked.md"), "# Notes: Parked\n\nPreserved branch work.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Graduate the planned unit"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["push", "--set-upstream", "origin", branch]);
  await h.git("git", ["checkout", "main"]);
  await writeFile(join(h.root, pointer), composePointerRecord({ name: slug, branch, reason: "Wait for the upstream dependency.",
    renderFields: { owner: "andrew" } }));
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Park the graduated unit"]);
  const main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  return { ...h, slug, branch, pointer, active, tip, main };
}
