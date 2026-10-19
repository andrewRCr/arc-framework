/** Literal compatibility outputs for every in-repository status render consumer. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { composeProjectReadinessViewResult, mergeProjectReadinessRecords } from "../../../src/lib/status/project-view.js";
import { renderRoadmapFromIndexResult, renderRoadmapFromIndexViewResult } from "../../../src/lib/status/roadmap-regeneration-assert.js";
import { renderTrackedProjectReadinessViewResult } from "../../../src/lib/status/project-roadmap-render.js";
import { createGitV3RepositoryTreeProjectViewFs, renderGitV3RepositoryTreeRoadmap } from "../../../src/lib/work-unit/git-decompose-v3-repository-plan.js";
import type { V3RepositoryPlanTree } from "../../../src/lib/work-unit/decompose-v3-repository-plan.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { runStatusUserView } from "../../../src/lib/status/user-view.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import { inFlightRecord, makeExec, makeInFlightExec, meta, metaContent, record } from "../../helpers/status-view-fixtures.js";

const cwd = "/fixture";
const stagedFiles = {
  ".arc/active/meta-flight.md": meta("flight", "Active", { priority: "P1", cohort: "parent/cohort" }),
  ".arc/backlog/planned/ready/meta-ready.md": meta("ready", "Planning", { priority: "P2" }),
  ".arc/backlog/planned/blocked-one/meta-blocked-one.md": meta("blocked-one", "Planning", { dependsOn: "`missing`" }),
  ".arc/backlog/planned/blocked-two/meta-blocked-two.md": meta("blocked-two", "Planning", { dependsOn: "`blocked-one`" }),
  ".arc/backlog/planned/parked/meta-parked.md": meta("parked", "Active"),
};
const tree: V3RepositoryPlanTree = Object.fromEntries(Object.entries(stagedFiles).map(([path, content]) =>
  [path, { kind: "object", objectKind: "blob", mode: "100644", bytes: new TextEncoder().encode(content) }]));

function absentRef(command: string, args: readonly string[]): never {
  throw makeGitProcessError({ command, args, exitCode: 2, stderr: "reference does not exist" });
}
function indexExec(): GitExec {
  const local = makeInFlightExec({});
  return async (command, args, options) => {
    if (args[0] === "config") return { stdout: args.includes("arc.identity") ? "andrew\0" : "" };
    if (args[0] === "show-ref" && args[1] === "--exists") return absentRef(command, args);
    if (args[0] === "rev-parse") return { stdout: "abcdef0\n" };
    if (args[0] === "ls-files") return { stdout: Object.keys(stagedFiles).map(path => `100644 ${"a".repeat(40)} 0\t${path}`).join("\n") };
    if (args[0] === "show" && args[1]?.startsWith(":")) {
      const content = stagedFiles[args[1].slice(1) as keyof typeof stagedFiles];
      if (content === undefined) throw makeGitProcessError({ command, args, exitCode: 128, stderr: "path does not exist in index" });
      return { stdout: content };
    }
    return local(command, args, options);
  };
}

async function renders() {
  const composer = composeProjectReadinessViewResult({
    title: "Roadmap", renderedRef: "abcdef0", indeterminate: true,
    records: mergeProjectReadinessRecords([
      inFlightRecord("flight", { state: "Active", owner: "andrew", priority: "P1", cohort: "parent/cohort" }),
      record("ready", { priority: "P2" }),
      record("blocked-one", { dependsOn: ["missing"] }),
      record("blocked-two", { dependsOn: ["blocked-one"] }),
      record("parked-pointer", { scheduling: "parked", location: "active", state: "Active" }),
      record("parked-planned", { state: "Active" }),
    ]),
    derivationWarnings: [{ code: "stale-location-dropped", workUnit: "flight",
      rendered: "Meta `meta-flight.md` at `main` points to `feat/flight`; dropped stale location." }],
  });
  const options = { cwd, exec: indexExec(), currentBranch: null };
  const stagedView = await renderRoadmapFromIndexViewResult(options);
  const stagedRender = await renderRoadmapFromIndexResult(options);
  const tracked = await renderTrackedProjectReadinessViewResult({ cwd, exec: indexExec(), fs: createGitV3RepositoryTreeProjectViewFs(cwd, tree) });
  const decomposition = new TextDecoder().decode(await renderGitV3RepositoryTreeRoadmap({
    cwd, exec: indexExec(), readBlob: async () => null, readObject: async () => new Uint8Array(), cohortTemplate: new Uint8Array(),
  }, "main", tree, "a".repeat(40), undefined, "abcdef0"));
  const remote = makeExec({
    lsRemote: `${"a".repeat(40)}\trefs/heads/feat/flight`, forEachRef: "origin/feat/flight",
    metas: { "origin/feat/flight:.arc/active/meta-flight.md": metaContent({ class: "Heavy", priority: "P1", cohort: "parent/cohort" }) },
  });
  const userExec: GitExec = (command, args, options) => args[0] === "show-ref" && args[1] === "--exists"
    ? absentRef(command, args) : remote(command, args, options);
  const user = await runStatusUserView({
    exec: userExec, identity: "andrew", teamMode: false, localOnly: false,
    readLastRendered: async () => null,
    readReadyMine: async () => [{ workUnit: "ready", state: "Planning", class: "Light", priority: "P2", cohort: "parent/cohort" }],
  });
  return { composer, stagedView, stagedRender, tracked, decomposition, user };
}

it("preserves the exact project facts and every in-repository rendered body", async () => {
  const actual = await renders();
  const expected: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "../../fixtures/status/in-repo-render-identity.json"), "utf8"));
  expect(actual).toEqual(expected);
});
