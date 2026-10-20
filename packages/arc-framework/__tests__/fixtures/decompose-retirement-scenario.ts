/** Rich retirement source and strict physical boundaries for complete cut scenarios. */
import { createRetirementHarness } from "../helpers/store/retirement-harness.js";
import { lifecycleSuccess, createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "./decompose-context.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { createDefaultLocusPorts } from "../../src/lib/work-unit/locus-ports.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";
import { resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";

/** Create native source records before invoking any decomposition entry point. */
export async function createDecomposeRetirementScenario(started: boolean, atCap: boolean) {
  const harness = createLifecycleHarness();
  if (atCap) for (const [name, parent] of [["group", "[none]"], ["child", "`group`"]] as const) {
    await harness.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
      `# Cohort: \`${name}\`\n\n**Parent:** ${parent}\n\n**Purpose:** Coordinate the work.\n`);
  }
  const h = await createRetirementHarness({ harness, ended: false, state: "Planning", branches: [], held: started, heldBranch: null,
    placement: started ? { kind: "active" } : { kind: "backlog", commitment: "planned" },
    fields: { currentWorkflow: started ? "draft-design" : null, design: ["draft-demo.md"], cohort: atCap ? "group/child" : null } });
  await h.seed(recordReferences["work-item/draft"](h.meta.reference.owner), "# Demo\n\n## Scope\n\nOwned work.\n");
  await h.seedMeta("provider", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["demo"] }, { kind: "backlog", commitment: "planned" });
  const home = await h.seedMeta("home", { state: "Planning", currentWorkflow: null, dependsOn: ["demo"] }, { kind: "backlog", commitment: "planned" });
  await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Scope\n\nExisting work.\n");
  const source = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(source, { content: writeMetaDependsOn(source.content, ["provider"]) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const ctx = decomposeContext(h.store);
  ctx.executor = { ...ctx.executor, exec: h.ctx.exec,
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => started ? "/repo" : null } };
  const markerPath = resolveWorktreeMarkerPath("/repo");
  const files = new Map<string, string>([["/repo/local.txt", "Retained personal content."]]);
  if (started) files.set(markerPath, "claim");
  const originalMarker = h.ctx.readMarker!;
  h.ctx.readMarker = async path => files.has(markerPath) ? originalMarker(path) : { kind: "absent" };
  h.ctx.worktreeFs = { ...h.ctx.worktreeFs!, removeFile: async path => {
    if (path !== markerPath) throw Error(`Unexpected removal: ${path}`);
    files.delete(path);
  } };
  ctx.removal = { exec: h.ctx.exec, readMarker: h.ctx.readMarker, folderExists: async () => true };
  ctx.storeTeardown = h.ctx;
  return { ...h, ctx, teardown: h.ctx, files, markerPath };
}
