/** Supplied rehearsal facts cannot replace the host of any effective remote URL. */
import { resolve } from "node:path";
import { runWindow } from "../../../../src/scripts/cutover-window/main.js";
import { describe, expect, it } from "vitest";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { hasWindowHost, readWindowHostFacts, type WindowHostPort, type WindowPullRequests }
  from "../../../../src/scripts/cutover-window/host.js";

const listing: WindowPullRequests = {
  open: [{ number: 7, headBranch: "feat/flip", baseBranch: "main" }],
  flip: { number: 7, headBranch: "feat/flip", baseBranch: "main", autoMergeArmed: false },
};
const noHostReads: WindowHostPort = {
  refs: async () => { throw new Error("Unexpected host read"); },
  pullRequests: async () => { throw new Error("Unexpected host read"); },
  mergeSettings: async () => { throw new Error("Unexpected host read"); },
  discoverRepository: async () => { throw new Error("Unexpected host read"); },
};

function urls(remotes: Record<string, { fetch: string[]; push?: string[] }>) {
  return scriptGitExec([
    { match: ["remote"], responses: [{ stdout: Object.keys(remotes).join("\n") }] },
    ...Object.entries(remotes).flatMap(([name, values]) => [
      { match: ["remote", "get-url", "--all", name], responses: [{ stdout: values.fetch.join("\n") }] },
      { match: ["remote", "get-url", "--push", "--all", name], responses: [{ stdout: (values.push ?? values.fetch).join("\n") }] },
    ]),
  ]).exec;
}

describe("window supplied host facts", () => {
  it.each(["C:\\mirror\\repo.git", "C:/mirror/repo.git"])("reads drive-letter URL %s as local only on Windows", async url => {
    expect(await hasWindowHost(urls({ origin: { fetch: [url] } }), "win32")).toBe(false);
    expect(await hasWindowHost(urls({ origin: { fetch: [url] } }), "linux")).toBe(true);
    expect(await hasWindowHost(urls({ origin: { fetch: [url] } }), "darwin")).toBe(true);
  });

  it.each(["/mirror/repo.git", "../mirror.git", "file:///mirror.git"])(
    "accepts rehearsal facts with local URL %s", async url => {
      const exec = urls({ origin: { fetch: [url] } });
      expect(await hasWindowHost(exec)).toBe(false);
      expect(await readWindowHostFacts({ exec, host: noHostReads }, 7, { anchor: "a".repeat(40), pullRequests: listing }))
        .toEqual({ hosted: false, anchor: "a".repeat(40), pullRequests: listing });
    },
  );

  it.each<Record<string, { fetch: string[]; push?: string[] }>>([
    { origin: { fetch: ["https://github.com/owner/repo.git"] } },
    { origin: { fetch: ["git@github.com:owner/repo.git"] } },
    { origin: { fetch: ["/mirror.git"], push: ["/mirror.git", "https://github.com/owner/repo.git"] } },
    { origin: { fetch: ["/mirror.git"] }, upstream: { fetch: ["https://github.com/owner/repo.git"] } },
  ])("refuses supplied facts before host reads for %j", async remotes => {
    const exec = urls(remotes);
    expect(await hasWindowHost(exec)).toBe(true);
    for (const supplied of [{ anchor: "a".repeat(40) }, { pullRequests: listing }]) {
      await expect(readWindowHostFacts({ exec, host: noHostReads }, 7, supplied)).rejects.toMatchObject({
        findings: [expect.objectContaining({ condition: expect.stringContaining("Supplied host facts"),
          remedy: expect.stringContaining("Remove") })],
      });
    }
  });

  it("names the missing listing when a repository has no host", async () => {
    const exec = urls({ origin: { fetch: ["/mirror.git"] } });
    await expect(readWindowHostFacts({ exec, host: noHostReads }, 7)).rejects.toMatchObject({
      findings: [expect.objectContaining({ condition: expect.stringContaining("supplied pull-request listing"),
        remedy: expect.stringContaining("Supply") })],
    });
  });

  it("reads the host normally when no supplied fact replaces it", async () => {
    const exec = urls({ origin: { fetch: ["https://github.com/owner/repo.git"] } });
    const host = { ...noHostReads, pullRequests: async () => listing };
    expect(await readWindowHostFacts({ exec, host }, 7)).toEqual({ hosted: true, pullRequests: listing });
  });
});


it("reports a host-boundary refusal as one typed entry result", async () => {
  const exec = urls({ origin: { fetch: ["https://github.com/owner/repo.git"] } });
  const stdout: string[] = []; const stderr: string[] = [];
  const check = async () => {
    await readWindowHostFacts({ exec, host: noHostReads }, 7, { pullRequests: listing });
    throw new Error("The supplied fact was accepted unexpectedly");
  };
  expect(await runWindow(["check", "--repo", resolve("target"), "--json"], { check }, {
    stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
  })).toBe(1);
  expect(stdout.join("")).toContain('"status":"refused"');
  expect(JSON.parse(stdout.join(""))).toMatchObject({ operation: "check", status: "refused", findings: [
    { subject: "host facts", condition: expect.stringContaining("Supplied host facts"), remedy: expect.stringContaining("Remove") },
  ] });
  expect(stderr.join("")).toContain("Supplied host facts");
  expect(stderr.join("")).not.toContain("Usage:");
});


it("loads supplied request facts after admitting the local rehearsal repository", async () => {
  const exec = urls({ origin: { fetch: ["/mirror.git"] } });
  expect(await readWindowHostFacts({ exec, host: noHostReads }, 7, { pullRequests: async () => listing }))
    .toEqual({ hosted: false, pullRequests: listing });
});


it("does not load supplied facts in a repository with a host", async () => {
  const exec = urls({ origin: { fetch: ["https://github.com/owner/repo.git"] } });
  await expect(readWindowHostFacts({ exec, host: noHostReads }, 7, { pullRequests: async () => {
    throw new Error("A forbidden supplied listing was read");
  } })).rejects.toMatchObject({ findings: [expect.objectContaining({ condition: expect.stringContaining("Supplied host facts") })] });
});
