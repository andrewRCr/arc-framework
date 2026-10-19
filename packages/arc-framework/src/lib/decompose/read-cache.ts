/** Invocation-local record observations shared by decomposition preparation. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import { sameReference } from "../store/identity.js";

/** Reuse listed and individually read records during preparation; revalidation uses the original store. */
export function decomposeReadCache(store: Store): Store {
  const records: StoreRecord[] = [];
  const lists = new Map<string, ReturnType<Store["list"]>>();
  const retain = (record: StoreRecord): StoreRecord => {
    const prior = records.find(item => sameReference(item.reference, record.reference));
    if (prior !== undefined) return prior;
    records.push(record);
    return record;
  };
  const read: Store["read"] = async input => {
    if (input.asOf !== undefined) return store.read(input);
    const prior = records.find(item => sameReference(item.reference, input.reference));
    if (prior !== undefined) return { status: "ok", result: prior };
    const result = await store.read(input);
    return result.status === "refused" ? result : { status: "ok", result: retain(result.result) };
  };
  const list: Store["list"] = input => {
    const key = JSON.stringify(input);
    const prior = lists.get(key);
    if (prior !== undefined) return prior;
    const result = store.list(input).then(outcome => outcome.status === "ok"
      && outcome.result.status === "complete" && input.asOf === undefined
      ? { ...outcome, result: { ...outcome.result, records: outcome.result.records.map(retain) } } : outcome);
    lists.set(key, result);
    return result;
  };
  return new Proxy(store, { get(target, property): unknown {
    if (property === "read") return read;
    if (property === "list") return list;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
