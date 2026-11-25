/** No test setup or spawn helper selects the in-repo store unless a test asks for it, so a spawned command opens the
 * ref backend. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcNoTty, runArcWithStdin, runArcWithStdoutPipe } from "./helpers.js";

interface Spawned { readonly stdout: string; readonly stderr: string; readonly exitCode: number }

const spawners: readonly { readonly name: string; readonly status: (cwd: string) => Promise<Spawned> }[] = [
  { name: "runArc", status: cwd => runArc(["status", "--json"], cwd) },
  { name: "runArcNoTty", status: cwd => runArcNoTty(["status", "--json"], cwd) },
  { name: "runArcWithStdin", status: cwd => runArcWithStdin(["status", "--json"], cwd, "") },
  ...(process.platform === "win32" ? [] : [
    { name: "runArcWithStdoutPipe", status: (cwd: string) => runArcWithStdoutPipe(["status", "--json"], cwd) },
  ]),
  { name: "runCli", status: cwd => runCli(["status", "--json"], { cwd }) },
];

let root = "";
beforeAll(async () => {
  root = await createTempRepo("arc-spawn-store-");
  // The project initializes on the ref backend whatever the helpers default to, so only the observed spawn decides.
  const init = await runArcNoTty(["--no-input", "init", "--name", "spawn-store", "--identity", "test-user", "--tools", ""],
    root, { env: { [IN_REPO_STORE_OVERRIDE]: undefined } });
  expect(init.exitCode, JSON.stringify(init)).toBe(0);
  await git(root, ["add", "-A"]);
  await git(root, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "initialize"]);
}, 60_000);
afterAll(async () => { if (root !== "") await cleanupTempDir(root); });

it("leaves the in-repo store override unset in the end-to-end worker", () => {
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
});

it.each(spawners)("$name spawns the built CLI on the ref backend by default", async ({ status }) => {
  const result = await status(root);
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  // The in-repo store reports its projection disabled; the ref backend's is ready.
  expect(/"projection":\s*\{\s*"ok":\s*true,\s*"value":\s*\{\s*"kind":\s*"([a-z-]+)"/u.exec(result.stdout)?.[1],
    result.stdout).toBe("ready");
});
