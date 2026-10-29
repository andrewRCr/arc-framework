/** Plumbing access to the exact repository exercised by a conformance fixture. */
import { makeGitExec } from "../integration.js";
import type { RefConformanceFixture } from "./ref-fixture.js";

export function fixtureGit(fixture: Pick<RefConformanceFixture, "root" | "gitDir">): ReturnType<typeof makeGitExec> {
  const git = makeGitExec(fixture.root);
  return (command, args, options) => git(command, [...fixture.gitDir ? [`--git-dir=${fixture.gitDir}`] : [], ...args], options);
}
