/** Over a tree that still tracks ARC state, Git hook commands run with their projection off and every other command
 * refuses before its projection starts. */
import { execFile } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { StorePorts } from "../../../../src/lib/store/ports.js";
import { PROJECTION_STATE_FOLDER } from "../../../../src/lib/store/projection/location.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { cleanupTempDir, commitAll, createTempRepo } from "../../../helpers/integration.js";

const execFileAsync = promisify(execFile);
const CREATE_MODULE = "../../../../src/lib/store/create.js";
const cleanup: string[] = [];

/** A registered command's path, with the arguments Commander needs to reach its action. */
interface Invocation { readonly path: readonly string[]; readonly args: readonly string[] }

/** The commands this repository's Git hooks run. */
const HOOK_COMMANDS: readonly Invocation[] = [
  { path: ["check", "pre-commit"], args: [] },
  { path: ["check", "commit-msg"], args: ["message.txt"] },
  { path: ["check", "pre-push"], args: ["origin", "https://example.invalid/project.git"] },
  { path: ["hook-remedy-roadmap-conflict"], args: [] },
  { path: ["hook-validate-frontmatter"], args: [] },
];

/** Commands no Git hook runs, among them a sibling of the hook checks. */
const OTHER_COMMANDS: readonly Invocation[] = [{ path: ["status"], args: [] }, { path: ["check", "run"], args: ["lint:md"] }];

function cases(invocations: readonly Invocation[]): [string, Invocation][] {
  return invocations.map((invocation) => [invocation.path.join(" "), invocation]);
}

afterEach(async () => {
  beginProjectionCommand();
  await Promise.all(cleanup.splice(0).map((dir) => cleanupTempDir(dir)));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

/** A checkout whose `HEAD` tracks a work unit's meta, or tracks nothing under the state roots. */
async function repository(tracksState: boolean): Promise<string> {
  const root = await createTempRepo("arc-tracked-state-hooks-");
  cleanup.push(root);
  const path = tracksState ? ".arc/active/meta-example.md" : ".arc/system/notes.md";
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), "tracked\n", "utf8");
  await commitAll(root, `track ${path}`);
  return root;
}

interface Dispatched {
  /** The command paths whose actions ran, with whether a spawn materialization was bound while each ran. */
  readonly ran: readonly { readonly command: string; readonly spawnBound: boolean }[];
  /** Every store operation any composed store received. */
  readonly operations: readonly string[];
  readonly error?: unknown;
}

/** Run a command through the real registration tree from the checkout, with the default store bound to the selection. */
async function dispatch(root: string, invocation: Invocation): Promise<Dispatched> {
  const ran: { command: string; spawnBound: boolean }[] = [];
  const operations: string[] = [];
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    await dispatchRegisteredCli([...invocation.path, ...invocation.args], (program) => { recordAction(program, invocation.path, ran); }, () => {
      vi.doMock(CREATE_MODULE, async (importOriginal) => {
        const actual = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
        return { ...actual, createStore: (ports: StorePorts) => recording(actual.selectStore(ports, {}), operations) };
      });
      return Promise.resolve();
    });
    return { ran, operations };
  } catch (error) {
    return { ran, operations, error };
  } finally {
    cwd.mockRestore();
    vi.doUnmock(CREATE_MODULE);
  }
}

/** Replace the dispatched command's action, keeping its registration, with one that records it ran. */
function recordAction(program: Command, path: readonly string[], ran: { command: string; spawnBound: boolean }[]): void {
  let command = program;
  for (const name of path) {
    const next = command.commands.find((candidate) => candidate.name() === name);
    if (next === undefined) throw new Error(`No registered command for ${path.join(" ")}.`);
    command = next;
  }
  command.action(() => { ran.push({ command: path.join(" "), spawnBound: projectionProcessState().materializeSpawn !== null }); });
}

function recording(store: Store, operations: string[]): Store {
  return new Proxy(store, { get(target, key, receiver) {
    const value: unknown = Reflect.get(target, key, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => { operations.push(String(key)); return (value as (...a: unknown[]) => unknown).apply(target, args); };
  } });
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, () => false);
}

/** Assert nothing reached the ref store's directory or the projection's state and lock directory. */
async function expectUntouched(root: string): Promise<void> {
  const commonDir = await git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const gitDir = await git(root, "rev-parse", "--path-format=absolute", "--git-dir");
  expect(await exists(join(commonDir, "arc"))).toBe(false);
  expect(await exists(join(gitDir, PROJECTION_STATE_FOLDER))).toBe(false);
}

describe("a checkout whose HEAD tracks ARC state", () => {
  it.each(cases(HOOK_COMMANDS))("runs %s with its projection off, opening no store", async (name, invocation) => {
    const root = await repository(true);
    const result = await dispatch(root, invocation);
    expect(result.error).toBeUndefined();
    expect(result.ran).toEqual([{ command: name, spawnBound: false }]);
    expect(result.operations).toEqual([]);
    expect(projectionProcessState().skip).toMatchObject({ reason: "tracked-state", mark: {
      reason: expect.stringContaining(".arc/active/"), remedy: { text: expect.stringContaining("git rm -r -- .arc/active/") } } });
    await expectUntouched(root);
  });

  it.each(cases(OTHER_COMMANDS))("refuses %s with the remedy before its projection starts", async (_name, invocation) => {
    const root = await repository(true);
    const result = await dispatch(root, invocation);
    // The dispatch loads its own module graph, so the error is matched by shape rather than class identity.
    expect(result.error).toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal: {
      code: "tracked-state", class: "recoverable", roots: [".arc/active/"],
      remedy: { text: expect.stringContaining("git rm -r -- .arc/active/") } } });
    expect(result.ran).toEqual([]);
    expect(result.operations).toEqual([]);
    await expectUntouched(root);
  });
});

describe("the remedy", () => {
  it("lets a refused command start its projection once the deletion is committed", async () => {
    const root = await repository(true);
    const status: Invocation = { path: ["status"], args: [] };
    expect((await dispatch(root, status)).error).toMatchObject({ refusal: { code: "tracked-state" } });
    await git(root, "rm", "-r", "-q", ".arc/active");
    const staged = await dispatch(root, status);
    expect(staged.error).toMatchObject({ refusal: { code: "tracked-state" } });
    await git(root, "commit", "-q", "-m", "chore: remove tracked state");
    const result = await dispatch(root, status);
    expect(result.error).toBeUndefined();
    expect(result.ran).toEqual([{ command: "status", spawnBound: true }]);
    const gitDir = await git(root, "rev-parse", "--path-format=absolute", "--git-dir");
    expect(await exists(join(gitDir, PROJECTION_STATE_FOLDER))).toBe(true);
  });
});

describe("a checkout whose HEAD tracks no ARC state", () => {
  it.each(cases([...HOOK_COMMANDS, ...OTHER_COMMANDS]))("starts the projection for %s as before", async (name, invocation) => {
    const root = await repository(false);
    const result = await dispatch(root, invocation);
    expect(result.error).toBeUndefined();
    expect(result.ran).toEqual([{ command: name, spawnBound: true }]);
    expect(projectionProcessState().skip?.reason).not.toBe("tracked-state");
    const gitDir = await git(root, "rev-parse", "--path-format=absolute", "--git-dir");
    expect(await exists(join(gitDir, PROJECTION_STATE_FOLDER))).toBe(true);
  });
});
