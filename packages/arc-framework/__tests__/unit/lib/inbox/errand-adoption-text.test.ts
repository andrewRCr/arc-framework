/** Free-text concerns remain literal and complete when adopted and returned. */
import MarkdownIt from "markdown-it";
import { expect, it } from "vitest";
import { createInboxHarness } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { prepareErrandReturn } from "../../../../src/lib/inbox/errand-return.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { transitionStoreErrand } from "../../../../src/lib/errand/store-runtime.js";
import { TransientIdentityRecordV3Schema } from "../../../../src/lib/errand/identity-record.js";

const concerns = [
  { name: "structural lines", intent: "Complete concern\n\n## Description\n## Elsewhere\n### Child\n###\tTabbed\n---  \n```md\n## Inbound\n### Nested\n```\nLast line" },
  { name: "comments and markup", intent: "Keep **literal** \\ title \\* \\_ <!-- opaque\nbefore <!-- unclosed\n</pre>\nAmp & <tags> &#95;" },
  { name: "field-like heading", intent: "_Hold:_ `false`\nComplete concern" },
  { name: "field-like body", intent: "Field examples\n- _Hold:_ `true`\n- _Remind:_ `true`\n- _WU_Target:_ `target`\n- _Cites:_ `deadbeef`\n- _Id:_ `deadbeef`" },
  { name: "inline and fenced code", intent: "`some_name`\nUse `some_name`\n```ts\nconst some_name = 1;\n```" },
  { name: "complete whitespace and Unicode", intent: "  Full concern café 🐈\n\nDo the work\n\n" },
  { name: "leading blank line", intent: "\nFull concern\n" },
];
const markdown = new MarkdownIt({ html: true });
function renderedConcern(raw: string): string {
  const body = /<pre>([\s\S]*?)<\/pre>/u.exec(markdown.render(raw))?.[1];
  if (body === undefined) throw new Error("Missing literal concern in the rendered entry");
  const code = /^<code>([\s\S]*)<\/code>$/u.exec(body)?.[1];
  const text = markdown.utils.unescapeAll(code ?? body);
  // HTML drops the first LF directly inside pre, including an encoded LF.
  return code === undefined ? text.replace(/^\n/u, "") : text;
}
it.each(["\n", "\r\n"].flatMap(newline => concerns.map(concern => ({ newline, ...concern }))))(
  "keeps $name as one literal entry through text adoption and return with $newline endings", async ({ newline, intent }) => {
    const h = createInboxHarness(), slug = "complete-concern", concern = intent.replaceAll("\n", newline);
    const adoption = await prepareErrandAdoption({ slug, intent: concern }, h.context);
    if (adoption.status !== "ok") throw new Error(adoption.refusal.condition);
    const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug,
      claimId: "a".repeat(32), createdAt: "2026-02-01T12:00:00Z", updatedAt: "2026-02-01T12:00:00Z", intent: concern,
      branch: `chore/${slug}`, origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
    if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
    expect(await transitionStoreErrand({ store: h.context.store, identity: h.context.identity,
      projectId: async () => "repo", companionWrites: adoption.result.writes, provenanceVerb: "errand-open" },
    { kind: "create", record })).toMatchObject({ kind: "applied" });
    const description = await listInbox({ list: slug }, h.context);
    expect(description).toMatchObject({ entries: [{ title: slug, fields: { Created: "2026-02-01" } }] });
    if (description.state === "refused" || description.entries.length !== 1) throw new Error("Expected one complete concern");
    const row = description.entries[0]!;
    expect(row.fields).toEqual({ Id: row.id, Created: "2026-02-01" });
    expect(renderedConcern(row.raw)).toBe(concern);
    h.context.now = () => new Date("2026-02-02T12:00:00Z");
    const returned = await prepareErrandReturn(slug, h.context);
    if (returned.status !== "ok") throw new Error(returned.refusal.condition);
    expect(returned.result.returned).toEqual([row.id]);
    success(await h.context.store.batch({ writes: returned.result.writes, provenance: { verb: "errand-abandon", lifecycleAction: "abandon" } }));
    const home = await listInbox({ list: "personal" }, h.context);
    expect(home).toMatchObject({ entries: [{ id: row.id, title: slug }] });
    if (home.state === "refused" || home.entries.length !== 1) throw new Error("Expected one returned concern");
    expect(home.entries[0]?.fields).toEqual({ Id: row.id, Created: "2026-02-02" });
    expect(renderedConcern(home.entries[0]!.raw)).toBe(concern);
    expect(await listInbox({ list: slug }, h.context)).toMatchObject({ entries: [] });
  });
