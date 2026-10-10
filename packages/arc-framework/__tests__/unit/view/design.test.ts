/** Design-list selection through the semantic viewer resolver. */

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveViewArtifact, type ViewArtifactDependencies } from "../../../src/lib/view-artifact.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { ResolvedViewTarget } from "../../../src/lib/view/types.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

describe("view design", () => {
  it.each([
    { sourceKind: "checkout" as const, fallback: false },
    { sourceKind: "checkout" as const, fallback: true },
    { sourceKind: "ref" as const, fallback: false },
    { sourceKind: "ref" as const, fallback: true },
  ])("ignores an escaping Design entry at $sourceKind (fallback: $fallback)", async ({ sourceKind, fallback }) => {
    const root = "/selected";
    const ref = "refs/heads/feat/demo";
    const target: ResolvedViewTarget = {
      status: "resolved", slug: SlugSchema.parse("demo"), location: "active",
      placement: { kind: "active", scope: { kind: "project" } },
      metaPath: ".arc/active/meta-demo.md", taskListPath: null,
      artifactSource: sourceKind === "checkout" ? { kind: "checkout", cwd: root } : { kind: "ref", ref },
    };
    const badName = sourceKind === "checkout" ? "../../../outside.md" : "../outside.md";
    const content = "**Purpose:** Valid thesis.";
    const meta = makeMetaFixture("demo", { design: [badName, ...(fallback ? ["spec-demo.md"] : [])] });
    const files = new Map([
      [join(root, target.metaPath), meta],
      ["/outside.md", "**Purpose:** Outside thesis."],
      [join(root, ".arc/active/spec-demo.md"), content],
    ]);
    const entries = new Map([
      [target.metaPath, meta], [".arc/outside.md", "**Purpose:** Outside thesis."],
      [".arc/active/spec-demo.md", content],
    ]);
    const dependencies = fixtureDependencies(target, files);
    dependencies.readAtRef = (selectedRef, path) => Promise.resolve(selectedRef === ref && entries.has(path)
      ? { mode: "100644", bytes: new TextEncoder().encode(entries.get(path)) } : null);
    const result = await resolveViewArtifact({
      cwd: "/invoking", kind: "design", identity: "andrew", project: false, forSlug: "demo",
    }, dependencies);
    expect(result).toEqual(!fallback ? { status: "absent", kind: "design" } : sourceKind === "checkout" ? {
      status: "resolved", kind: "design", path: join(root, ".arc/active/spec-demo.md"), workUnit: "demo",
    } : {
      status: "resolved", kind: "design", content, ref,
      displayLabel: `${ref}:.arc/active/spec-demo.md`, workUnit: "demo",
    });
  });

  it("selects the same ref copy as spec without consulting the stale checkout", async () => {
    const ref = "refs/heads/feat/demo";
    const target: ResolvedViewTarget = {
      status: "resolved", slug: SlugSchema.parse("demo"), location: "active",
      placement: { kind: "active", scope: { kind: "project" } },
      metaPath: ".arc/active/meta-demo.md", taskListPath: null, artifactSource: { kind: "ref", ref },
    };
    const body = "**Purpose:** Selected ref thesis.\n";
    const entries = new Map([
      [target.metaPath, makeMetaFixture("demo", { design: ["spec-demo.md"] })],
      [".arc/active/spec-demo.md", body],
    ]);
    const dependencies = fixtureDependencies(target, new Map());
    dependencies.readAtRef = (selectedRef, path) => Promise.resolve(selectedRef === ref && entries.has(path)
      ? { mode: "100644", bytes: new TextEncoder().encode(entries.get(path)) } : null);
    const options = { cwd: "/stale", identity: "andrew", project: false, forSlug: "demo" };
    const spec = await resolveViewArtifact({ ...options, kind: "spec" }, dependencies);
    const design = await resolveViewArtifact({ ...options, kind: "design" }, dependencies);
    expect(spec).toEqual({
      status: "resolved", kind: "spec", ref, content: body,
      displayLabel: `${ref}:.arc/active/spec-demo.md`, workUnit: "demo",
    });
    expect(design).toEqual({ ...spec, kind: "design" });
  });

  it.each([
    { design: ["draft-demo.md"], bodies: ["**Purpose:** Draft thesis.\n"], selected: "draft-demo.md" },
    { design: ["spec-demo.md"], bodies: ["**Purpose:** Spec thesis.\n"], selected: "spec-demo.md" },
    { design: ["prd-demo.md", "rfc-demo.md"], bodies: ["**Purpose:** PRD thesis.\n", "**Purpose:** RFC thesis.\n"], selected: "prd-demo.md" },
    { design: ["brief-demo.md", "rfc-demo.md"], bodies: ["# Brief\n", "**Purpose:** RFC thesis.\n"], selected: "rfc-demo.md" },
    { design: ["prd-demo.md", "rfc-demo.md"], bodies: ["**Purpose:** —\n", "**Purpose:** RFC thesis.\n"], selected: "prd-demo.md" },
    { design: ["spec-demo.md"], bodies: ["# Brief spec\n"], selected: "spec-demo.md" },
    { design: ["brief-demo.md", "other-demo.md"], bodies: ["# First brief\n", "# Second brief\n"], selected: "brief-demo.md" },
    { design: ["missing.md", "spec-demo.md"], bodies: [undefined, "# Available spec\n"], selected: "spec-demo.md" },
    { design: [], bodies: [], selected: null },
    { design: ["missing.md"], bodies: [], selected: null },
  ])("selects $selected from $design", async ({ design, bodies, selected }) => {
    const cwd = "/invoking";
    const root = "/selected";
    const target: ResolvedViewTarget = {
      status: "resolved", slug: SlugSchema.parse("demo"), location: "active",
      placement: { kind: "active", scope: { kind: "project" } },
      metaPath: ".arc/active/meta-demo.md", taskListPath: null,
      artifactSource: { kind: "checkout", cwd: root },
    };
    const files = new Map<string, string>([[join(root, target.metaPath), makeMetaFixture("demo", { design })]]);
    design.forEach((name, index) => {
      const body = bodies[index];
      if (body !== undefined) files.set(join(root, ".arc/active", name), body);
    });
    const dependencies = fixtureDependencies(target, files);
    const result = await resolveViewArtifact({ cwd, kind: "design", identity: "andrew", project: false, forSlug: "demo" }, dependencies);
    expect(result).toEqual(selected === null ? { status: "absent", kind: "design" } : {
      status: "resolved", kind: "design", path: join(root, ".arc/active", selected), workUnit: "demo",
    });
  });
});

function fixtureDependencies(target: ResolvedViewTarget, files: Map<string, string>): ViewArtifactDependencies {
  return {
    resolveAmbientTarget: () => Promise.resolve(target),
    resolveExplicitTarget: () => Promise.resolve(target),
    resolveCohort: () => Promise.resolve(null),
    resolveSessionNotes: () => Promise.resolve({ status: "absent" }),
    resolveUserSurfaces: () => Promise.resolve({ workingMemoryPath: "", identityGlobalPath: () => "" }),
    pathExists: (path) => Promise.resolve(files.has(path)),
    readFile: (path) => {
      const content = files.get(path);
      return content === undefined ? Promise.reject(new Error("missing")) : Promise.resolve(content);
    },
  };
}
