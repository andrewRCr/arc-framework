/**
 * Renderer selection and one-shot pager composition for `arc view`.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { GitExec } from "./git/index.js";
import { resolveGitConfigOverride } from "./config/resolve-override.js";

const execFileAsync = promisify(execFile);

export const VIEW_RENDERERS = ["glow", "bat", "plain"] as const;
export type ViewRenderer = typeof VIEW_RENDERERS[number];

export const VIEW_RENDERER_GIT_CONFIG_KEY = "arc.viewRenderer";

export type PathCommandProbe = (command: "glow" | "bat") => Promise<boolean>;

export interface ResolveViewRendererOptions {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  probe?: PathCommandProbe;
}

export interface ResolvedViewRenderer {
  renderer: ViewRenderer;
  warnings: string[];
}

export interface PagerProcessInput {
  command: string;
  args: readonly string[];
  input: string;
  env: NodeJS.ProcessEnv;
}

export type PagerProcessRunner = (input: PagerProcessInput) => Promise<void>;

/** Probe PATH in the stable glow → bat → plain order. */
export async function detectViewRenderer(
  probe: PathCommandProbe = probePathCommand,
): Promise<ViewRenderer> {
  if (await probe("glow")) return "glow";
  if (await probe("bat")) return "bat";
  return "plain";
}

/** Resolve the personal renderer override, falling back to PATH detection. */
export async function resolveViewRenderer(
  options: ResolveViewRendererOptions,
): Promise<ResolvedViewRenderer> {
  const warnings: string[] = [];
  const override = await resolveGitConfigOverride<ViewRenderer>({
    exec: options.exec,
    readFile: options.readFile,
    cwd: options.cwd,
    gitConfigKey: VIEW_RENDERER_GIT_CONFIG_KEY,
    defaultValue: "plain",
    isValidValue: isViewRenderer,
    validValues: VIEW_RENDERERS,
    warn: (message) => warnings.push(message),
  });

  return {
    renderer: override.source === "git-config"
      ? override.value
      : await detectViewRenderer(options.probe),
    warnings,
  };
}

/** Render one document through the selected renderer's pager-composing mode. */
export function renderViewWithPager(
  input: {
    renderer: ViewRenderer;
    content: string;
    displayPath: string;
  },
  dependencies: { run: PagerProcessRunner } = { run: runPagerProcess },
): Promise<void> {
  const processInput = pagerProcessInput(input);
  return dependencies.run(processInput);
}

function pagerProcessInput(input: {
  renderer: ViewRenderer;
  content: string;
  displayPath: string;
}): PagerProcessInput {
  const baseEnvironment = { ...process.env, LESS: "FRX" };
  switch (input.renderer) {
    case "glow":
      return {
        command: "glow",
        args: ["--pager", "-"],
        input: input.content,
        env: baseEnvironment,
      };
    case "bat":
      return {
        command: "bat",
        args: ["--paging=always", "--language=md", "--file-name", input.displayPath, "-"],
        input: input.content,
        env: { ...baseEnvironment, BAT_PAGER: "less -RFX" },
      };
    case "plain":
      return {
        command: "less",
        args: ["-R", "-F", "-X"],
        input: input.content,
        env: baseEnvironment,
      };
    default: {
      const _exhaustive: never = input.renderer;
      return _exhaustive;
    }
  }
}

function isViewRenderer(value: string): value is ViewRenderer {
  return (VIEW_RENDERERS as readonly string[]).includes(value);
}

async function probePathCommand(command: "glow" | "bat"): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

function runPagerProcess(input: PagerProcessInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, [...input.args], {
      env: input.env,
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${input.command} exited with status ${code ?? "unknown"}.`));
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(input.input);
  });
}
