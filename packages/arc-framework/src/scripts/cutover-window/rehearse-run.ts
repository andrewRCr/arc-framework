/** What rehearsal steps and run plans act through, and how a step reports an unexpected outcome. */
import type { GitExec } from "../../lib/git/exec.js";
import { runWindowRehearsalCommand, type WindowRehearsalCommand, type WindowRehearsalCommandEnvironment,
  type WindowRehearsalLauncher } from "./rehearse-launch.js";
import type { WindowRehearsalLayout, WindowRehearsalSync } from "./rehearse-sync.js";
import type { WindowRehearsalExpectation, WindowRehearsalExpectedFinding } from "./rehearse-expect.js";

/** An outcome the run did not expect, which ends the run at the step that met it. */
export class WindowRehearsalStop extends Error {
  /** Name the condition met; the step running it is attached where the run stops. */
  constructor(condition: string) {
    super(condition);
    this.name = "WindowRehearsalStop";
  }
}

/** The stand-in flip the run's pull-request listing names. */
export interface WindowRehearsalFlip { branch: string; pullRequest: number }

/** The copy, the driver's Git writes, and the launch of ARC commands in the copy's checkouts. */
export interface WindowRehearsalContext {
  layout: WindowRehearsalLayout; sync: WindowRehearsalSync; exec: GitExec;
  launcher: WindowRehearsalLauncher; environment: WindowRehearsalCommandEnvironment;
  flip: WindowRehearsalFlip; anchor?: string;
  /** The search path the window's check judges for ARC executables. */
  checkPath: string;
  /** The import's bounds: an argv prefix that caps its address space, and the heap ceiling set below that cap. */
  importBounds: { prefix: readonly string[]; heapMb: number };
  /** The supplied pull-request listing the window's operations read. */
  listing: string;
  /** The identity inbox entry the sealed-write step names, once the copy holds one. */
  inboxTitle?: string;
}

/** A condition planted for the check to refuse, and removed before the check that must pass. */
export interface WindowRehearsalPlant {
  name: string;
  /** Planted before the window's lock, or between the lock and the check. */
  point: "before lock" | "after lock";
  /** Plant the condition, returning the findings the check must name for it. */
  apply: (context: WindowRehearsalContext) => Promise<readonly WindowRehearsalExpectedFinding[]>;
  /** Remove the condition; the run locks again before the passing check. */
  remove: (context: WindowRehearsalContext) => Promise<void>;
}

/** A run plan: what it plants, what it expects, and where it acts on the copy. */
export interface WindowRehearsalPlan {
  /** Once the checkouts are clean, before the tracked-state remedies; the run syncs what it publishes. */
  setup?: (context: WindowRehearsalContext) => Promise<string>;
  /** After the copy is prepared, before the window's lock. */
  prepared?: (context: WindowRehearsalContext) => Promise<void>;
  /** Conditions the check refuses together, then passes once each is removed. */
  plants?: readonly WindowRehearsalPlant[];
  /** Findings the plants cause beyond their own, read once every plant is in place. */
  collateral?: (context: WindowRehearsalContext) => Promise<readonly WindowRehearsalExpectedFinding[]>;
  /** Between the save and the import. */
  beforeImport?: (context: WindowRehearsalContext) => Promise<string>;
  /** The accounting outcome expected; by default it passes with no finding. */
  account?: (context: WindowRehearsalContext) => Promise<WindowRehearsalExpectation>;
  /** After the last step. */
  after?: (context: WindowRehearsalContext) => Promise<string>;
}

/** Run one ARC command in a copied checkout through that checkout's launch. */
export async function runWindowRehearsalArc(context: WindowRehearsalContext, checkout: string,
  args: readonly string[]): Promise<WindowRehearsalCommand> {
  return runWindowRehearsalCommand(await context.launcher(checkout), args, context.environment);
}
