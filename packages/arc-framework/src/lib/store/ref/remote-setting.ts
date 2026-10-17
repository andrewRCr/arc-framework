/** Explicit remote settings preserve one state publisher and the layout it owns. */

import type { Store } from "../contract.js";
import type { StoreRemoteResult, StoreRemoteView } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, type RefDesignation } from "./designation.js";
import { readRefRepository } from "./repository.js";
import { designatedStoreLayout } from "./layout-state.js";
import { moveRefLayout } from "./migrate-layout.js";
import type { LayoutSetting } from "./migrate-record.js";
import { checkRemoteProject } from "./remote-project.js";
import { setRefBacking } from "./remote-backing.js";

/** Read the physical layout and clone-local roles without creating or moving state. */
export async function remoteView(context: RefBackendContext): Promise<StoreRemoteView> {
  const repository = await readRefRepository(context);
  const designation = await readRefDesignation(context);
  return { layout: repository.repository?.gitDir ? "separate" : "default",
    remotes: [...designation.codeRemotes, ...designation.backing ? [designation.backing] : []] };
}

/** Apply one validated setting after the caller finishes any recorded move. */
export async function applyRefRemoteSetting(context: RefBackendContext, store: Store, setting: LayoutSetting, ownState?: boolean): Promise<StoreRemoteResult> {
  const designation = await readRefDesignation(context);
  if (setting.remote === "backing") {
    const applied = await setRefBacking(context, designation, setting.role);
    return applied.status === "refused" ? applied : { status: "ok", result: await remoteView(context) };
  }
  const other = [...designation.codeRemotes, ...designation.backing ? [designation.backing] : []]
    .find(({ name, role, repository }) => name !== setting.remote && role === "push" && (name !== "backing" || repository === "backing"));
  if (setting.role === "push" && other) return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `${other.name} already carries push; moving its designation alone would strand state.`,
    remedy: { text: `Run arc store migrate --to ${setting.remote}, or arc store remote ${other.name} off before retrying.`,
      argv: ["arc", "store", "migrate", "--to", setting.remote] } } };
  return applyCodeSetting(context, store, designation, setting, ownState);
}

async function applyCodeSetting(context: RefBackendContext, store: Store, designation: RefDesignation,
  setting: LayoutSetting, ownState?: boolean): Promise<StoreRemoteResult> {
  const codeRemotes = designation.codeRemotes.filter(({ name }) => name !== "backing");
  const remote = codeRemotes.find(({ name }) => name === setting.remote);
  if (!remote) return remoteRefusal("request-invalid", `Remote ${setting.remote} is not configured.`);
  const pointer = setting.role === "push" ? await context.backingRepository() : null;
  if (pointer && !ownState) return { status: "confirmation-needed", repository: pointer,
    condition: `Publish this clone's store on ${setting.remote} instead of ${pointer}: everything it holds, including any project state pulled from that repository, stays published.`,
    remedy: { text: `Use arc store remote backing push to keep publishing to ${pointer}, or arc store remote ${setting.remote} push --own-state to publish everything this clone holds instead.`,
      argv: ["arc", "store", "remote", setting.remote, "push", "--own-state"] } };
  if (setting.role === "push") {
    const refused = await checkRemoteProject(context, remote, designation);
    if (refused) return refused;
  }
  const remotes = [...codeRemotes, ...setting.role !== "push" && designation.backing ? [designation.backing] : []]
    .map((remote) => remote.name === setting.remote ? { ...remote, role: setting.role } : remote);
  const next = { ...designation, backing: setting.role === "push" ? null : designation.backing, remotes, pushes: remotes.filter(({ role }) => role === "push") };
  const moved = await moveRefLayout(context, store, designatedStoreLayout(next), setting);
  if (moved.status === "ok" && setting.role === "push" && (await readRefDesignation(context)).backing) {
    await (await readRefRepository(context)).exec("git", ["remote", "remove", "backing"]);
  }
  if (moved.status === "ok" && pointer) moved.result.notices.push({ condition: `This clone now publishes its store independently of ${pointer}.`,
    remedy: { text: `To keep ${pointer} as a read source, add it as a code repository remote under another name and run arc store remote <name> read.`,
      argv: ["git", "remote", "add", "state-source", pointer] } });
  return moved.status === "refused" ? moved : { status: "ok", result: { ...await remoteView(context), report: moved.result } };
}

function remoteRefusal(code: "unsupported" | "request-invalid", condition: string): Extract<StoreRemoteResult, { status: "refused" }> {
  return { status: "refused", refusal: { code, class: "terminal", condition,
    remedy: { text: "Correct the remote setting and retry." } } };
}
