/** Saved identity history orders ancestors after every descendant despite clock skew. */
import { execa } from "execa";
import { describe, expect, it, onTestFinished } from "vitest";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { createStore } from "../../src/lib/store/create.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { hashBlob } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { syncErrand, syncErrandRef, syncRecord } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["tied", "skewed"] as const)("identity history with %s dates", (dates) => {
  it("keeps removals and merge descendants before both parents with exact content and provenance", async () => {
    const root = await createTempRepo();
    onTestFinished(() => cleanupTempDir(root));
    const exec = makeGitExec(root), execInput = makeGitExecInput(root);
    const ports = testStorePorts(root, exec, execInput);
    ports.identity = async () => SlugSchema.parse("andrew");
    const store = createStore(ports);
    const saved = new Map<string, { content: string | null; version: string | null }>();
    const commit = async (name: string, parents: string[], year: number) => {
      const content = name === "remove" ? null : serializeTransientIdentityRecord(syncRecord(name));
      const version = content === null ? null : await hashBlob(execInput, content);
      const tree = (await execInput(["mktree"], version === null ? "" : `100644 blob ${version}\talpha\n`)).trim();
      const date = `${dates === "tied" ? 2020 : year}-01-01T00:00:00Z`;
      const result = await execa("git", ["commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent])], {
        cwd: root, env: { ...environmentForGitCwd(root), GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, input: `${name}\n`,
      });
      saved.set(`${name}\n`, { content, version });
      return result.stdout.trim();
    };
    const base = await commit("base", [], 2030);
    const left = await commit("left", [base], 2020);
    const rightParent = await commit("right-parent", [base], 2015);
    const right = await commit("right", [rightParent], 2010);
    const merged = await commit("merge", [left, right], 2040);
    const removed = await commit("remove", [merged], 2000);
    await exec("git", ["update-ref", syncErrandRef, removed]);
    const history = success(await store.history({ reference: syncErrand }));
    const messages = history.map((entry) => "message" in entry.provenance ? entry.provenance.message : "");
    expect(new Set(messages)).toEqual(new Set(saved.keys()));
    for (const [descendant, ancestor] of [["remove", "merge"], ["merge", "left"], ["merge", "right"], ["left", "base"], ["right", "right-parent"], ["right-parent", "base"]]) {
      expect(messages.indexOf(`${descendant}\n`)).toBeLessThan(messages.indexOf(`${ancestor}\n`));
    }
    for (const entry of history) {
      const message = "message" in entry.provenance ? entry.provenance.message : "";
      expect(entry).toMatchObject({ reference: syncErrand, ...saved.get(message), provenance: { message } });
    }
  });
});
