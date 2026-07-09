/**
 * Handler for the `arc errand check` subcommand.
 *
 * `check` is the read half of errand prep: it runs the foreign-artifact overlap
 * detection over the oracle-backed in-flight set and emits the facts (JSON for
 * skill consumption) so the caller can word an advisory caveat before relocating
 * to the errand's execution locus. Sourcing the oracle (not the local worktree
 * roster) lets the gate see work units in flight on another machine.
 *
 * `arc errand` is a noun, not a flat verb: it owns this subcommand and has no
 * default action, mirroring `arc active` / `arc user`.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runActiveInFlight } from "../commands/active.js";
import { detectForeignArtifactOverlap, projectInFlightToOverlapRoster } from "../lib/git/index.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  openErrand,
  linkErrandToInbox,
  closeErrand,
  retireErrand,
  promoteErrand,
  isErrandBranchType,
  ERRAND_BRANCH_TYPES,
  DEFAULT_ERRAND_BRANCH_TYPE,
} from "../lib/errand/index.js";
import {
  clearErrandPartialPushMarker,
  recordErrandPartialPushMarker,
} from "../lib/user-sync/index.js";
import { runUserInboxRemove } from "../commands/user.js";
import { gitExec, createUserIOContext } from "../lib/io-context.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

export interface ErrandCheckOptions {
  /** Target path(s) the errand will edit — matched by prefix against in-flight WUs. */
  target?: string[];
  /** Emit the overlap facts as JSON (for skill consumption). */
  json?: boolean;
  /** `--local`: skip the oracle's network read; derive from local refs. */
  local?: boolean;
  /** `--no-fetch`: Commander sets `fetch === false` — same effect as `--local`. */
  fetch?: boolean;
}

export async function handleErrandCheck(opts: ErrandCheckOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const targetPaths = (opts.target ?? []).map((t) => t.trim()).filter((t) => t !== "");
  if (targetPaths.length === 0) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ overlaps: [] })}\n`);
      return;
    }
    p.intro("arc errand check");
    p.log.error("No --target paths given; nothing to check.");
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";
  const baseBranch = settings["branch.base"];
  const localOnly = Boolean(opts.local) || opts.fetch === false;

  const { entries, warnings, reachable } = await runActiveInFlight({
    exec: gitExec,
    identity,
    teamMode,
    localOnly,
  });

  const result = await detectForeignArtifactOverlap({
    exec: gitExec,
    roster: projectInFlightToOverlapRoster(entries),
    targetPaths,
    baseBranch,
    originatingWorktreePath: await currentWorktreePath(cwd),
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ...result, warnings, reachable })}\n`);
    return;
  }

  p.intro("arc errand check");
  if (result.overlaps.length === 0) {
    p.note("No in-flight work unit touches the target — proceed without a caveat.", "Advisory");
  } else {
    const lines = result.overlaps.map(
      (o) => `${o.branch}  touches  ${o.matchedPaths.join(", ")}  (${o.worktreePath ?? "remote-only"})`,
    );
    p.note(lines.join("\n"), "Foreign overlap — coordinate or sequence after it integrates");
  }
  if (!reachable && !localOnly) {
    p.log.warn("Remote unreachable — checked local refs only; work in flight on another machine may be missed.");
  }
  p.outro("Done.");
}

/** Options for the `arc errand open` subcommand. */
export interface ErrandOpenOptions {
  /** Branch nature-type (`fix` / `chore` / `refactor` / `hotfix`); defaults to `chore`. */
  type?: string;
  /** Free-text statement of the errand's concern; defaults to the slug. */
  intent?: string;
  /**
   * Originating `USER-INBOX` capture this errand adopts (its bold title). Marks
   * the record `inbox`-origin so `arc errand close` drops the capture; omitted
   * for a free-description launch.
   */
  fromInbox?: string;
}

/**
 * Open an errand: mint the identity record, cut a nature-typed branch as its
 * projection, push the record, and occupy the branch in place.
 *
 * A full-protection verb — under partial protection an errand is a direct base
 * commit with no branch and no record, so `open` refuses there. The record push
 * is non-fatal: a failure records the errand partial-push marker (the same
 * machinery `arc sync` reconciles) rather than aborting the open.
 *
 * `--from-inbox <entry-title>` adopts a `USER-INBOX` capture: the record is
 * minted `inbox`-origin with the capture as its back-pointer, so `arc errand
 * close` drops that capture instead of orphaning it.
 */
export async function handleErrandOpen(slug: string, opts: ErrandOpenOptions): Promise<void> {
  p.intro("arc errand open");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    p.log.error(
      "`arc errand open` is a full-protection verb. Under partial protection an errand is a direct "
      + "base commit — no branch, no record — so it never opens.",
    );
    process.exitCode = 1;
    return;
  }

  const base = settings["branch.base"].trim();
  if (base === "") {
    p.log.error("No branch.base configured — cannot resolve the base to cut from.");
    process.exitCode = 1;
    return;
  }

  const type = opts.type ?? DEFAULT_ERRAND_BRANCH_TYPE;
  if (!isErrandBranchType(type)) {
    p.log.error(`Unknown errand branch type '${type}'. Valid types: ${ERRAND_BRANCH_TYPES.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    p.log.error("No identity resolved — the errand record ref is identity-scoped. Set arc.identity first.");
    process.exitCode = 1;
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    p.log.error("The stdin git seam is unavailable — cannot mint the errand record.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await openErrand(
      { exec: io.exec, execInput: io.execInput, identity },
      { slug, base, type, intent: opts.intent, originEntry: opts.fromInbox, createdAt: new Date().toISOString() },
    );
  } catch (err) {
    p.log.error(`Could not open the errand: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Mirror the sync leg's marker discipline: a clean push clears any stale errand
  // partial-push marker; a failed push records it for later recovery and is
  // non-fatal — the record is written locally and rides `arc sync`.
  switch (result.push.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      break;
    case "no-remote":
    case "conflict":
    case "failed":
      await recordErrandPartialPushMarker(cwd, io, identity);
      p.log.warn(`Record push deferred (${result.push.kind}); it reconciles on the next \`arc sync\`.`);
      break;
  }

  const cutVerb = result.branchCreated ? "cut" : "reused";
  const adopted = result.record.origin === "inbox"
    ? ` — adopted inbox capture '${result.record.originEntry ?? ""}'`
    : "";
  p.log.success(
    `Opened errand '${slug}' — ${cutVerb} ${result.record.branch}, record minted, occupied in place${adopted}.`,
  );
  p.outro("Done.");
}

/** Options for the `arc errand link` subcommand. */
export interface ErrandLinkOptions {
  /** USER-INBOX capture title to associate with this errand. */
  fromInbox?: string;
}

/**
 * Link an already-open errand to a USER-INBOX capture.
 *
 * This is the late-adoption counterpart to `open --from-inbox`: it updates the
 * existing errand record to carry the inbox back-pointer, so the normal close or
 * promote path can drop the capture after the record is removed.
 */
export async function handleErrandLink(slug: string, opts: ErrandLinkOptions): Promise<void> {
  p.intro("arc errand link");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    p.log.error(
      "`arc errand link` is a full-protection verb. Under partial protection an errand is a direct "
      + "base commit — no branch, no record — so there is nothing to link.",
    );
    process.exitCode = 1;
    return;
  }

  const originEntry = opts.fromInbox?.trim();
  if (originEntry === undefined || originEntry === "") {
    p.log.error("`arc errand link` requires `--from-inbox <entry-title>`.");
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    p.log.error("No identity resolved — the errand record ref is identity-scoped. Set arc.identity first.");
    process.exitCode = 1;
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    p.log.error("The stdin git seam is unavailable — cannot update the errand record.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await linkErrandToInbox(
      { exec: io.exec, execInput: io.execInput, identity },
      { slug, originEntry },
    );
  } catch (err) {
    p.log.error(`Could not link the errand: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (result.kind === "no-record") {
    p.log.info(`No errand record for '${slug}' — nothing to link.`);
    p.outro("Done.");
    return;
  }

  if (result.kind === "link-conflict") {
    p.log.error(
      `Errand '${slug}' is already linked to inbox capture '${result.record.originEntry ?? ""}' `
      + `(requested '${result.requestedEntry}'). Changing an existing link is refused so the original capture `
      + "cannot be orphaned.",
    );
    process.exitCode = 1;
    return;
  }

  // Mirror the sync leg's marker discipline (see handleErrandOpen): a clean push
  // of the update clears any stale marker; a failed push records it and is
  // non-fatal — the update rides the next `arc sync`.
  switch (result.push.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      break;
    case "no-remote":
    case "conflict":
    case "failed":
      await recordErrandPartialPushMarker(cwd, io, identity);
      p.log.warn(`Record-link push deferred (${result.push.kind}); it reconciles on the next \`arc sync\`.`);
      break;
  }

  const suffix = result.changed ? "" : " (already linked)";
  p.log.success(`Linked errand '${slug}' to inbox capture '${result.record.originEntry ?? ""}'${suffix}.`);
  p.outro("Done.");
}

/** Options for the `arc errand close` subcommand. */
export interface ErrandCloseOptions {
  /** Bypass the containment safety check — the deliberate shipped / abandon override. */
  force?: boolean;
}

/**
 * Close an errand: reap its branch (containment-safe), remove the identity
 * record and push the removal, then drop the originating inbox capture.
 *
 * A full-protection verb, like `open`. The reap refuses (record kept) when the
 * branch's commits are not provably preserved, so an abandoned errand stays
 * recoverable; `--force` is the explicit override for the deliberate shipped /
 * abandon case. The inbox drop targets the record's originating entry — present
 * only for inbox-promoted errands — and is an idempotent no-op otherwise.
 */
export async function handleErrandClose(slug: string, opts: ErrandCloseOptions): Promise<void> {
  p.intro("arc errand close");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    p.log.error(
      "`arc errand close` is a full-protection verb. Under partial protection an errand is a direct "
      + "base commit — no branch, no record — so it never closes.",
    );
    process.exitCode = 1;
    return;
  }

  const base = settings["branch.base"].trim();
  if (base === "") {
    p.log.error("No branch.base configured — cannot resolve the base to hop to.");
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    p.log.error("No identity resolved — the errand record ref is identity-scoped. Set arc.identity first.");
    process.exitCode = 1;
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    p.log.error("The stdin git seam is unavailable — cannot remove the errand record.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await closeErrand(
      { exec: io.exec, execInput: io.execInput, identity },
      { slug, base, force: opts.force === true },
    );
  } catch (err) {
    p.log.error(`Could not close the errand: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (result.kind === "no-record") {
    p.log.info(`No errand record for '${slug}' — nothing to close.`);
    p.outro("Done.");
    return;
  }

  if (result.kind === "unsafe-reap") {
    p.log.error(
      `Refusing to reap ${result.record.branch}: ${result.reason}. The record is kept, so the errand stays `
      + "recoverable — push or merge it then retry, or re-run with `--force` if you've verified it shipped.",
    );
    process.exitCode = 1;
    return;
  }

  // Mirror the sync leg's marker discipline (see handleErrandOpen): a clean push
  // of the removal clears any stale marker; a failed push records it and is
  // non-fatal — the removal rides the next `arc sync`.
  switch (result.push.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      break;
    case "no-remote":
    case "conflict":
    case "failed":
      await recordErrandPartialPushMarker(cwd, io, identity);
      p.log.warn(`Record-removal push deferred (${result.push.kind}); it reconciles on the next \`arc sync\`.`);
      break;
  }

  // Drop the originating inbox capture (only inbox-promoted errands carry one);
  // idempotent — an absent entry or missing inbox file is a clean no-op.
  await dropOriginatingInboxCapture(cwd, io, identity, result.record.originEntry);

  p.log.success(`Closed errand '${slug}' — reaped ${result.record.branch}, record removed.`);
  p.outro("Done.");
}

/**
 * Retire an errand's identity record without touching its branch — the
 * promotion counterpart to `close`.
 *
 * A full-protection verb, like `open` / `close`. Promotion renames the errand
 * branch into the work-unit branch and mints a meta that supersedes the record;
 * this removes the now-redundant record and pushes the removal, leaving the
 * renamed branch untouched. There is no reap and so no containment gate.
 */
export async function handleErrandRetire(slug: string): Promise<void> {
  p.intro("arc errand retire");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    p.log.error(
      "`arc errand retire` is a full-protection verb. Under partial protection an errand is a direct "
      + "base commit — no branch, no record — so it never retires.",
    );
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    p.log.error("No identity resolved — the errand record ref is identity-scoped. Set arc.identity first.");
    process.exitCode = 1;
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    p.log.error("The stdin git seam is unavailable — cannot remove the errand record.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await retireErrand({ exec: io.exec, execInput: io.execInput, identity }, { slug });
  } catch (err) {
    p.log.error(`Could not retire the errand record: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (result.kind === "no-record") {
    p.log.info(`No errand record for '${slug}' — nothing to retire.`);
    p.outro("Done.");
    return;
  }

  // Mirror the sync leg's marker discipline (see handleErrandClose): a clean push
  // of the removal clears any stale marker; a failed push records it and is
  // non-fatal — the removal rides the next `arc sync`.
  switch (result.push.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      break;
    case "no-remote":
    case "conflict":
    case "failed":
      await recordErrandPartialPushMarker(cwd, io, identity);
      p.log.warn(`Record-removal push deferred (${result.push.kind}); it reconciles on the next \`arc sync\`.`);
      break;
  }

  await dropOriginatingInboxCapture(cwd, io, identity, result.record.originEntry);

  p.log.success(`Retired errand record '${slug}' — the branch is preserved for the promoted work unit.`);
  p.outro("Done.");
}

/** Options for the `arc errand promote` subcommand. */
export interface ErrandPromoteOptions {
  /** The new WU name (the meta filename stem and branch leaf); defaults to the slug. */
  name?: string;
  /** The WU branch nature-type prefixing the name; defaults to `feat`. */
  type?: string;
  /** Which floor the errand crossed — `derivation` | `scale`. Required (the agent's judgment). */
  floor?: string;
  /** WU priority for the minted meta. */
  priority?: string;
  /** WU `Class` for the minted meta. */
  class?: string;
}

/**
 * Promote an errand to a work unit: rename its branch (commits preserved), mint
 * the backing meta at the floor-dictated stage, and retire the identity record.
 *
 * A full-protection verb, like `open` / `close` / `retire`. The crossed floor is
 * the agent's judgment and is required — `derivation` enters planning at
 * `draft-design`, `scale` enters `Active` for a brief + task-list backfill. The
 * deterministic mechanics (rename, meta mint, record retire, push) run here; only
 * the WU name/type, the floor, and optional priority/`Class` are supplied.
 */
export async function handleErrandPromote(slug: string, opts: ErrandPromoteOptions): Promise<void> {
  p.intro("arc errand promote");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    p.log.error(
      "`arc errand promote` is a full-protection verb. Under partial protection an errand is a direct "
      + "base commit — no branch, no record — so promotion is just starting a normal work unit from the base.",
    );
    process.exitCode = 1;
    return;
  }

  const floor = opts.floor?.trim();
  if (floor !== "derivation" && floor !== "scale") {
    p.log.error(
      "`arc errand promote` requires `--floor derivation|scale` — the crossed floor is the agent's judgment "
      + "and routes the entry stage (derivation → planning at draft-design; scale → Active for a brief backfill).",
    );
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    p.log.error("No identity resolved — the errand record ref is identity-scoped. Set arc.identity first.");
    process.exitCode = 1;
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    p.log.error("The stdin git seam is unavailable — cannot retire the errand record.");
    process.exitCode = 1;
    return;
  }

  const rawName = opts.name?.trim();
  const wuName = rawName !== undefined && rawName !== "" ? rawName : slug;
  const type = opts.type?.trim();

  let result;
  try {
    result = await promoteErrand(
      {
        io: { exec: io.exec, execInput: io.execInput, identity },
        fs: { mkdir, writeFile, readFile: (path) => readFile(path, "utf8") },
        cwd,
      },
      {
        slug,
        name: wuName,
        type: type !== undefined && type !== "" ? type : "feat",
        floor,
        owner: identity,
        priority: opts.priority,
        class: opts.class,
      },
    );
  } catch (err) {
    p.log.error(`Could not promote the errand: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (result.kind === "no-record") {
    p.log.info(`No errand record for '${slug}' — nothing to promote.`);
    p.outro("Done.");
    return;
  }

  if (result.kind === "name-taken") {
    p.log.error(`A work unit meta already exists at ${result.metaPath} — choose a different --name.`);
    process.exitCode = 1;
    return;
  }

  // Mirror the sync leg's marker discipline (see handleErrandClose): a clean push
  // of the removal clears any stale marker; a failed push records it and is
  // non-fatal — the removal rides the next `arc sync`.
  switch (result.push.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      break;
    case "no-remote":
    case "conflict":
    case "failed":
      await recordErrandPartialPushMarker(cwd, io, identity);
      p.log.warn(`Record-removal push deferred (${result.push.kind}); it reconciles on the next \`arc sync\`.`);
      break;
  }

  await dropOriginatingInboxCapture(cwd, io, identity, result.record.originEntry);

  const stage = floor === "derivation" ? "Planning (draft-design)" : "Active";
  p.log.success(
    `Promoted errand '${slug}' → work unit on ${result.branch}; minted ${result.metaPath} at ${stage}, `
    + "record retired.",
  );
  // ROADMAP regen is advisory until roadmap-tooling ships the renderer (mirrors the
  // WU lifecycle's reconcile-roadmap side-effect): nudge a hand-render for the new WU.
  p.log.info(
    `ROADMAP regen pending (no renderer yet): \`${wuName}\` promoted to ${stage} — hand-render the readiness view.`,
  );
  p.outro("Done.");
}

/** Drop the originating capture, if the record carries a back-pointer. */
async function dropOriginatingInboxCapture(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string,
  originEntry: string | undefined,
): Promise<void> {
  if (originEntry === undefined) return;
  const dropped = await runUserInboxRemove({ cwd, io, identity, slug: originEntry });
  if (dropped.removed) p.log.info("Dropped the originating inbox capture.");
}

/** The current worktree's root, in `git worktree list` path form (for self-exclusion). */
async function currentWorktreePath(fallback: string): Promise<string> {
  try {
    const { stdout } = await gitExec("git", ["rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top === "" ? fallback : top;
  } catch {
    return fallback;
  }
}
