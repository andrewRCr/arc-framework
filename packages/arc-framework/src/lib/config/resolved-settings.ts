/**
 * Resolver wrapper for the release-mode keys.
 *
 * Composes {@link readConfigSettings} (yaml-only) with per-key
 * {@link resolveGitConfigOverride} calls so callers needing the resolved
 * surface read a single function. Each release-mode key returns a
 * `{ value, source }` pair so diagnostic surfaces (orchestrator `--json`
 * envelope, audit logs) carry provenance alongside the value.
 *
 * **Key surface.** Four per-developer-only keys with `git config arc.* →
 * default` precedence — autonomy / interaction-cadence preferences and the
 * release-wrappers opt-in flag are personal-by-design:
 *
 * - `arc.commitInterlock`
 * - `arc.pushInterlock`
 * - `arc.syncInterlock`
 * - `arc.releaseOptedIn`
 *
 * Plus one dual-scope key with `git config arc.* → arc-config.yml → default`
 * precedence — yaml carries the project default, git-config carries the
 * per-developer override:
 *
 * - `arc.notesPush` / `user.notes_push`
 *
 * **Validator source-of-truth.** Per-key validators live here (passed once
 * into the generic helper). `status-reader.ts` deliberately omits the
 * release-mode keys from its `ENUM_VALIDATORS` map — yaml values flow
 * through the reader as raw strings, and validation lands once in this
 * wrapper. Callers that bypass the wrapper (`arc config status` reads the
 * reader directly) see raw yaml values without warnings; the operational
 * read paths (handlers, orchestrator) validate via the wrapper.
 *
 * **Spawn cost.** Five `git config --get` calls fire concurrently via
 * `Promise.all`, alongside the yaml read — roughly one round-trip latency.
 * Add caching only if profiling shows it.
 *
 * **Direct primitive access.** Constants and type guards are exported so
 * downstream consumers (interlock-release wrappers per
 * `plan-interlock-release-wrappers.md`) can call
 * {@link resolveGitConfigOverride} per key without going through the
 * composite wrapper.
 *
 * @module
 */

import {
  resolveGitConfigOverride,
  type ResolvedConfigOverride,
} from "./resolve-override.js";
import { readConfigSettings } from "./status-reader.js";
import type { ConfigSettings } from "../../commands/config/types.js";
import type { GitExec } from "../git/index.js";

// --- Per-key constants and type guards ---

/**
 * Valid commit-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-task-approval` (agent fires on approved
 * task work) < `on-workflow` (agent fires on any workflow-mediated event,
 * including ceremony commits).
 */
export type CommitInterlock = "manual" | "on-task-approval" | "on-workflow";

export const COMMIT_INTERLOCK_GIT_CONFIG_KEY = "arc.commitInterlock";
export const DEFAULT_COMMIT_INTERLOCK: CommitInterlock = "manual";
const COMMIT_INTERLOCK_VALUES: readonly CommitInterlock[] = [
  "manual",
  "on-task-approval",
  "on-workflow",
];

function isCommitInterlock(value: string): value is CommitInterlock {
  return (COMMIT_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/**
 * Valid push-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-sync` (agent fires push leg from sync) <
 * `on-workflow` (agent fires push from any workflow-mediated path, including
 * ceremony pushes via `arc release push`).
 */
export type PushInterlock = "manual" | "on-sync" | "on-workflow";

export const PUSH_INTERLOCK_GIT_CONFIG_KEY = "arc.pushInterlock";
export const DEFAULT_PUSH_INTERLOCK: PushInterlock = "manual";
const PUSH_INTERLOCK_VALUES: readonly PushInterlock[] = [
  "manual",
  "on-sync",
  "on-workflow",
];

function isPushInterlock(value: string): value is PushInterlock {
  return (PUSH_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/**
 * Valid sync-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-handoff` (agent fires sync at handoff) <
 * `on-workflow` (agent fires sync at handoff or any other workflow-mediated
 * event). Today `on-workflow` is behaviorally equivalent to `on-handoff` (no
 * other workflow fires sync); reserved for forward-compatibility with future
 * workflows that need to fire sync.
 */
export type SyncInterlock = "manual" | "on-handoff" | "on-workflow";

export const SYNC_INTERLOCK_GIT_CONFIG_KEY = "arc.syncInterlock";
export const DEFAULT_SYNC_INTERLOCK: SyncInterlock = "on-handoff";
const SYNC_INTERLOCK_VALUES: readonly SyncInterlock[] = [
  "manual",
  "on-handoff",
  "on-workflow",
];

function isSyncInterlock(value: string): value is SyncInterlock {
  return (SYNC_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/** Valid notes-push policy values. */
export type NotesPushPolicy = "manual" | "prompt" | "on-sync";

export const NOTES_PUSH_GIT_CONFIG_KEY = "arc.notesPush";
export const NOTES_PUSH_YAML_KEY = "user.notes_push";
export const DEFAULT_NOTES_PUSH_POLICY: NotesPushPolicy = "on-sync";
const NOTES_PUSH_VALUES: readonly NotesPushPolicy[] = ["manual", "prompt", "on-sync"];

function isNotesPushPolicy(value: string): value is NotesPushPolicy {
  return (NOTES_PUSH_VALUES as readonly string[]).includes(value);
}

/**
 * Valid release-wrappers opt-in flag values. String-typed for resolver
 * consistency with the other release-mode keys; consumers convert to
 * boolean (`value === "true"`) at the application boundary.
 */
export type ReleaseOptedIn = "true" | "false";

export const RELEASE_OPTED_IN_GIT_CONFIG_KEY = "arc.releaseOptedIn";
export const DEFAULT_RELEASE_OPTED_IN: ReleaseOptedIn = "false";
const RELEASE_OPTED_IN_VALUES: readonly ReleaseOptedIn[] = ["true", "false"];

function isReleaseOptedIn(value: string): value is ReleaseOptedIn {
  return (RELEASE_OPTED_IN_VALUES as readonly string[]).includes(value);
}

// --- Per-key resolver helpers ---

/**
 * Shared options for the per-key resolver helpers — covers the I/O surface
 * each helper threads into `resolveGitConfigOverride`.
 */
export interface ResolveSingleKeyOptions {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  cwd: string;
  warn?: (message: string) => void;
}

/** Resolve `arc.commitInterlock` → default. */
export async function resolveCommitInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<CommitInterlock>> {
  return resolveGitConfigOverride<CommitInterlock>({
    ...opts,
    gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_COMMIT_INTERLOCK,
    isValidValue: isCommitInterlock,
    validValues: COMMIT_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.pushInterlock` → default. */
export async function resolvePushInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<PushInterlock>> {
  return resolveGitConfigOverride<PushInterlock>({
    ...opts,
    gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_PUSH_INTERLOCK,
    isValidValue: isPushInterlock,
    validValues: PUSH_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.syncInterlock` → default. */
export async function resolveSyncInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<SyncInterlock>> {
  return resolveGitConfigOverride<SyncInterlock>({
    ...opts,
    gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_SYNC_INTERLOCK,
    isValidValue: isSyncInterlock,
    validValues: SYNC_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.notesPush` → `user.notes_push` → default. */
export async function resolveNotesPushPolicy(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<NotesPushPolicy>> {
  return resolveGitConfigOverride<NotesPushPolicy>({
    ...opts,
    gitConfigKey: NOTES_PUSH_GIT_CONFIG_KEY,
    yamlKey: NOTES_PUSH_YAML_KEY,
    defaultValue: DEFAULT_NOTES_PUSH_POLICY,
    isValidValue: isNotesPushPolicy,
    validValues: NOTES_PUSH_VALUES,
  });
}

/** Resolve `arc.releaseOptedIn` → default. */
export async function resolveReleaseOptedIn(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<ReleaseOptedIn>> {
  return resolveGitConfigOverride<ReleaseOptedIn>({
    ...opts,
    gitConfigKey: RELEASE_OPTED_IN_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_RELEASE_OPTED_IN,
    isValidValue: isReleaseOptedIn,
    validValues: RELEASE_OPTED_IN_VALUES,
  });
}

// --- Composite wrapper ---

/** Per-key `{value, source}` pairs for the release-mode keys. */
export interface ResolvedReleaseModeSettings {
  commitInterlock: ResolvedConfigOverride<CommitInterlock>;
  pushInterlock: ResolvedConfigOverride<PushInterlock>;
  syncInterlock: ResolvedConfigOverride<SyncInterlock>;
  notesPush: ResolvedConfigOverride<NotesPushPolicy>;
  releaseOptedIn: ResolvedConfigOverride<ReleaseOptedIn>;
}

export interface ResolvedSettingsResult {
  /**
   * Full agent-consumable settings — `user.notes_push` reflects the resolved
   * value (git-config override → yaml → default); other keys carry raw yaml
   * values per `readConfigSettings`. The four per-developer-only release-mode
   * keys are not surfaced here — callers needing their resolved values read
   * `resolved.{commitInterlock,pushInterlock,syncInterlock,releaseOptedIn}`.
   */
  settings: ConfigSettings;
  /** Per-key `{value, source}` provenance for the release-mode keys. */
  resolved: ResolvedReleaseModeSettings;
  /**
   * Keys absent from `arc-config.yml` that received documented defaults.
   * Matches `readConfigSettings` semantics (yaml absence, not override-tier
   * fallback) — `user.notes_push` may appear here while
   * `resolved.notesPush.source === "git-config"`.
   */
  defaultsApplied: string[];
  /**
   * Combined non-fatal diagnostics: yaml-read failures from
   * `readConfigSettings` plus invalid-value warnings from each per-key
   * resolver. Per-developer-only keys warn only at the git-config tier;
   * `notesPush` warns at git-config and yaml tiers.
   */
  warnings: string[];
}

export interface ResolveAllSettingsOptions {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /**
   * Invoked once per accumulated warning after resolution completes. Fires
   * for every entry in the returned `warnings` array; callers wanting only
   * the array can omit this.
   */
  warn?: (message: string) => void;
}

/**
 * Resolve the full release-mode key surface plus other agent-consumable
 * settings.
 *
 * Yaml read and five git-config-override resolutions fire concurrently. The
 * returned `settings` map mirrors `readConfigSettings`, with `user.notes_push`
 * substituted by its resolved value (the sole remaining dual-scope release-mode
 * key in yaml); `resolved` carries the typed `{value, source}` pairs for all
 * five release-mode keys.
 */
export async function resolveAllSettings(
  opts: ResolveAllSettingsOptions,
): Promise<ResolvedSettingsResult> {
  const overrideWarnings: string[] = [];
  const collectOverrideWarning = (message: string): void => {
    overrideWarnings.push(message);
  };

  const sharedOpts: ResolveSingleKeyOptions = {
    exec: opts.exec,
    readFile: opts.readFile,
    cwd: opts.cwd,
    warn: collectOverrideWarning,
  };

  const [base, commit, push, sync, notes, releaseOptedIn] = await Promise.all([
    readConfigSettings(opts.cwd),
    resolveCommitInterlock(sharedOpts),
    resolvePushInterlock(sharedOpts),
    resolveSyncInterlock(sharedOpts),
    resolveNotesPushPolicy(sharedOpts),
    resolveReleaseOptedIn(sharedOpts),
  ]);

  const warnings = [...base.warnings, ...overrideWarnings];
  if (opts.warn) {
    for (const message of warnings) {
      opts.warn(message);
    }
  }

  const settings: ConfigSettings = {
    ...base.settings,
    "user.notes_push": notes.value,
  };

  return {
    settings,
    resolved: {
      commitInterlock: commit,
      pushInterlock: push,
      syncInterlock: sync,
      notesPush: notes,
      releaseOptedIn,
    },
    defaultsApplied: base.defaultsApplied,
    warnings,
  };
}
