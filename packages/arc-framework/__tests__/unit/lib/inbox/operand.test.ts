/** Off-branch origins accept IDs and refuse every title/file form before input I/O. */
import {expect,it} from "vitest";
import {resolveInboxEntryOperand} from "../../../../src/lib/inbox-entry-operand.js";
it("admits qualified IDs and refuses legacy title sources without reading files",async()=>{
 const forbidden = async () => { throw new Error("Off-branch origins must not acquire title input"); };
 const io={readFile:forbidden,readStdin:forbidden};
 expect(await resolveInboxEntryOperand({literal:"project:12345678",stateOffBranch:true},io)).toBe("project:12345678");
 for(const operand of [{literal:"A title"},{file:"title.md"},{file:"-"}])await expect(resolveInboxEntryOperand({...operand,stateOffBranch:true},io)).rejects.toThrow(/personal:<id>.*project:<id>.*arc inbox/u);
});
