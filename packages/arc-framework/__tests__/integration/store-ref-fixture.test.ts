import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { validateConformanceRegistration } from "../helpers/store/conformance-suite.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema, FAMILY_IDS, FAMILY_REGISTRY, KIND_REGISTRY } from "../../src/lib/store/index.js";
import { makeGitExec } from "../helpers/integration.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

describe("ref conformance fixture construction", () => {
  it("copies isolated repositories with a local bare origin and binds the override registry", async () => {
    const first = await createRefFixture({ "project-registry/counter": { formatVersion: 2 } });
    const second = await createRefFixture();
    const git = makeGitExec(first.root);
    expect(first.root).not.toBe(second.root);
    expect((await git("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
    const origin = (await git("git", ["remote", "get-url", "origin"])).stdout;
    expect(origin.startsWith(first.root)).toBe(true);
    expect((await git("git", ["--git-dir", origin, "rev-parse", "--is-bare-repository"])).stdout).toBe("true");
    expect(first.store.capabilities).toEqual(createRefStore(first.ports).capabilities);
    const reference = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/counter", key: "one" });
    expect(await first.store.write({ action: "put", reference, expected: null, content: "{}", provenance: { verb: "test", lifecycleAction: "create" } })).toMatchObject({ status: "ok" });
    expect(await first.store.read({ reference })).toMatchObject({ status: "ok", result: { formatVersion: 2 } });
    expect(await second.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it("declares every served family and generates canonical machine content for one project", async () => {
    const fixture = await createRefFixture();
    expect(() => validateConformanceRegistration({ declarations: fixture.declarations, create: createRefFixture })).not.toThrow();
    const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution");
    expect(fixture.declarations.families).toEqual(families);
    expect(fixture.declarations.syncFamilies).toEqual(families);
    expect(fixture.declarations.identitySyncFamilies).toEqual(families.filter((family) => FAMILY_REGISTRY[family].scope === "identity"));
    expect(Object.keys(fixture.declarations.rejectingContentUnavailable)).toEqual(Object.values(KIND_REGISTRY)
      .filter((kind) => families.some((family) => family === kind.family) && kind.merge !== "single-writer").map((kind) => kind.id));
    const reference = fixture.reference("project-registry/identity");
    expect(reference.owner).toEqual({ type: "project", name: "project" });
    const content = fixture.content(reference);
    expect(content).toBe(canonicalize(JSON.parse(content)));
    expect(JSON.parse(content)).toEqual({ projectId: expect.stringMatching(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u) });
    const counter = fixture.reference("project-registry/counter");
    expect(fixture.content(counter)).toBe(canonicalize(JSON.parse(fixture.content(counter))));
  });
});
