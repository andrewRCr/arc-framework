/**
 * Handler for the `arc join` command.
 *
 * @module
 */

import { confirmPersonalIdentity } from "./identity-setup.js";
import * as p from "../lib/terminal.js";
import { joinIdentityPromptSite, joinIdentityInUsePromptSite } from "../prompts/identity-prompt-sites.js";
import { unlink, rmdir } from "node:fs/promises";

import { runJoin, runJoinReconfigure, buildPostJoinMessage } from "../commands/join.js";
import type { JoinPromptResult } from "../commands/join.js";
import { resolveJoinCommandInput, type JoinCommandOptions } from "../commands/join-input.js";
import { runJoinPrompts } from "../prompts/join-prompts.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../lib/paths.js";
import { getFrameworkVersion } from "../lib/version.js";
import { createIOContext } from "../lib/io-context.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { InputResolution } from "../lib/command-input/resolution.js";
import {
  requireArcProjectRoot, requireSetupGitRepo, resolveIdentityWithPrompt,
  isHandledError,
} from "./shared.js";

import { execa } from "execa";
import type { GitExec } from "../lib/git/exec.js";
import { SlugSchema, type Slug } from "../lib/kernel/index.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import type { Store } from "../lib/store/contract.js";
import { bindStoreSyncPort, type StoreSyncPort } from "../lib/store/operational-sync.js";
import { consumePull } from "../lib/store/pull-consumption.js";
import { describeStorePull, type StoreSessionInitUserValue } from "../lib/session-init/store-user-pull.js";
import { joinStoreDesignationSite } from "../prompts/join-store-designation.js";
import { prompt, type PromptRenderer } from "../lib/command-input/prompter.js";

/** Optional backend bindings for the identity being set up. */
export interface JoinStorePorts {
  openStore?: (input: { cwd: string; exec: GitExec; identity: Slug }) => Store;
  sync?: (store: Store) => StoreSyncPort;
  execute?: (argv: readonly string[], cwd: string, context: InteractionContext) => Promise<JoinDesignationOutcome>;
  renderer?: PromptRenderer;
}

/** A designation run's outcome; a failed run's own output already reached the terminal it inherited. */
export type JoinDesignationOutcome = { status: "ok" } | { status: "failed"; reason: string };

/** Cancellation stops setup before identity or workspace writes. */
export type JoinStorePullResult = StoreSessionInitUserValue | { status: "cancelled" } | null;

/** Pull the selected person's state and offer an explicit remote designation when required. */
export async function pullJoinStore(input: { cwd: string; exec: GitExec; identity: Slug | null; context: InteractionContext },
  ports: JoinStorePorts = {}): Promise<JoinStorePullResult> {
  if (input.identity === null) return null;
  const store = ports.openStore?.({ cwd: input.cwd, exec: input.exec, identity: input.identity })
    ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd, exec: input.exec, identity: input.identity }));
  if (!store.capabilities.stateOffBranch) return null;
  const result = await (ports.sync?.(store) ?? bindStoreSyncPort(store)).pull();
  const value = describeStorePull(result), consumed = consumePull(result);
  for (const line of consumed.kind === "stop" ? [consumed.reason] : consumed.notices) p.log.warn(line);
  if (result.status !== "designation-needed") return value;
  p.log.info(value.summary);
  if (input.context.interaction !== "allowed") return value;
  const remedyArgv = result.remedy.argv ?? [];
  const recommended = remedyArgv.at(-1);
  const answer = await prompt(joinStoreDesignationSite, input.context, {
    message: `How should remote ${result.remote} serve store state?`,
    options: result.choices.map(choice => ({ value: choice, label: choice,
      ...(choice === recommended ? { hint: remedyArgv.join(" ") } : {}) })),
    ...(recommended !== undefined && result.choices.includes(recommended) ? { initialValue: recommended } : {}),
  }, ports.renderer);
  if (answer.kind === "cancelled") return { status: "cancelled" };
  if (answer.kind !== "answered" || !result.choices.includes(answer.value)) return value;
  const argv = answer.value === recommended ? [...remedyArgv] : ["arc", "store", "remote", result.remote, answer.value];
  const designated = await (ports.execute ?? executeJoinDesignation)(argv, input.cwd, input.context);
  if (designated.status === "failed") {
    p.log.warn(`${argv.join(" ")} ${designated.reason}; setup continues without that designation. Resolve its output above, then run it again.`);
  }
  return value;
}

async function executeJoinDesignation(argv: readonly string[], cwd: string, context: InteractionContext): Promise<JoinDesignationOutcome> {
  const [command, ...args] = argv;
  if (command === undefined) return { status: "ok" };
  const result = await execa(command, args, { cwd, reject: false, stdin: context.subprocess.ambientStdin === "closed" ? "ignore" : "inherit",
    stdout: "inherit", stderr: "inherit", env: context.subprocess.terminalPrompts === "forbidden" ? { GIT_TERMINAL_PROMPT: "0" } : {} });
  if (!result.failed) return { status: "ok" };
  return { status: "failed", reason: result.exitCode !== undefined ? `exited with code ${result.exitCode}`
    : result.signal ? `was ended by ${result.signal}` : `could not start: ${result.shortMessage}` };
}

export type JoinOptions = JoinCommandOptions;

/** Set up a personal workspace, then pull through its selected-identity store. */
export async function handleJoin(opts: JoinOptions, context: InteractionContext, storePorts: JoinStorePorts = {}): Promise<void> {
  const io = createIOContext(context.subprocess);

  if (opts.reconfigure) {
    await handleJoinReconfigure(opts, context);
    return;
  }

  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Join Project`);

  if (!(await requireSetupGitRepo(io.exec, "join"))) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const input = await resolveJoinCommandInput({
    options: opts,
    context,
    prompt: async (supplied) => runJoinPrompts(context, {
      suppliedRole: supplied.role,
      suppliedTools: supplied.tools,
    }),
    resolveIdentity: () => resolveIdentityWithPrompt(joinIdentityPromptSite, context, io.exec),
  });
  if (input.kind !== "resolved") {
    reportJoinInputFailure(input);
    return;
  }
  const prompts: JoinPromptResult = { role: input.value.role, tools: input.value.tools };
  const identityResult = input.value.identity ?? null;

  const templateDir = getArcTemplatePath();

  const spinner = p.spinner();
  spinner.start("Setting up developer workspace...");

  try {
    const identity = identityResult === null ? null : SlugSchema.parse(identityResult);
    const store = identity === null ? undefined : storePorts.openStore?.({ cwd, exec: io.exec, identity })
      ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: io.exec, identity }));
    if (store?.capabilities.stateOffBranch) {
      const pulled = await pullJoinStore({ cwd, exec: io.exec, identity, context }, { ...storePorts, openStore: () => store });
      if (pulled?.status === "cancelled") { spinner.stop("Workspace setup cancelled."); return; }
    }
    const result = await runJoin({
      cwd,
      io,
      templateDir,
      internalTemplateDir: getInternalTemplatePath(),
      prompts,
      identityResult,
      store,
      confirmIdentityInUse: confirmPersonalIdentity(joinIdentityInUsePromptSite, context, storePorts.renderer),
    });

    spinner.stop("Workspace setup complete.");
    if (!store?.capabilities.stateOffBranch) {
      await pullJoinStore({ cwd, exec: io.exec, identity, context }, { ...storePorts, ...(store === undefined ? {} : { openStore: () => store }) });
    }

    p.note(buildPostJoinMessage(result), "What's next");
  } catch (err) {
    spinner.stop("Setup failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

function reportJoinInputFailure(input: Exclude<InputResolution<unknown>, { kind: "resolved" }>): void {
  if (input.kind === "cancelled") return;
  if (input.kind === "unavailable") {
    p.log.error(`Missing required input: ${input.missing.map((item) => {
      const syntax = item.acceptedSyntax.length === 0 ? "" : ` (${item.acceptedSyntax.join(" or ")})`;
      return `${item.name}${syntax}`;
    }).join(", ")}`);
  } else {
    p.log.error(input.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("\n"));
  }
  process.exitCode = 1;
}

// --- Join Reconfigure path ---

async function handleJoinReconfigure(opts: JoinOptions, context: InteractionContext): Promise<void> {
  p.intro(`ARC Framework v${getFrameworkVersion()} \u2502 Reconfigure Workspace`);
  const io = createIOContext(context.subprocess);

  if (!(await requireSetupGitRepo(io.exec, "join"))) return;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  // Read current role from git config
  let currentRole: "maintainer" | "contributor" = "maintainer";
  try {
    const result = await io.exec("git", ["config", "--get", "arc.role"]);
    const val = result.stdout.trim();
    if (val === "contributor") currentRole = "contributor";
  } catch {
    // Not set — default to maintainer
  }

  // Read current tools from git config
  let currentTools: string[] = [];
  try {
    const result = await io.exec("git", ["config", "--get", "arc.tools"]);
    const val = result.stdout.trim();
    if (val) {
      currentTools = val.split(",").map((t) => t.trim()).filter(Boolean);
    }
  } catch {
    // Not set — default to empty
  }

  const input = await resolveJoinCommandInput({
    options: opts,
    context,
    prompt: async (supplied) => runJoinPrompts(context, {
      suppliedRole: supplied.role,
      suppliedTools: supplied.tools,
      currentRole,
      currentTools,
    }),
  });
  if (input.kind !== "resolved") {
    reportJoinInputFailure(input);
    return;
  }
  const prompts: JoinPromptResult = { role: input.value.role, tools: input.value.tools };

  // No-change detection
  if (
    prompts.role === currentRole &&
    prompts.tools.length === currentTools.length &&
    prompts.tools.every((t) => currentTools.includes(t))
  ) {
    p.log.info("Nothing to change — all settings match the current configuration.");
    p.outro("Done.");
    return;
  }

  const templateDir = getArcTemplatePath();

  const spinner = p.spinner();
  spinner.start("Reconfiguring workspace...");

  try {
    const result = await runJoinReconfigure({
      cwd,
      io,
      templateDir,
      prompts,
      previousTools: currentTools,
      removeIO: { access: io.access, unlink, rmdir },
    });

    spinner.stop("Workspace reconfiguration complete.");

    const parts: string[] = [];
    if (result.role !== currentRole) {
      parts.push(`Role: ${currentRole} → ${result.role}`);
    }
    if (result.removedSkills.length > 0) {
      parts.push(`${result.removedSkills.length} old skill(s) removed`);
    }
    if (result.tools.length > 0) {
      parts.push(`Skills generated for: ${result.tools.join(", ")}`);
    }

    if (parts.length > 0) {
      p.log.info(parts.join("\n"));
    }

    if (result.tools.length > 0) {
      p.note("Restart your AI tool so updated skills are available.", "What's next");
    }
  } catch (err) {
    spinner.stop("Reconfiguration failed.");
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}
