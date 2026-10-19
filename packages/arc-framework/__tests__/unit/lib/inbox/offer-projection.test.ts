/** Both cold-start and terminal public contracts admit queue refusal reports. */
import {expect,it} from "vitest";
import {buildErrandNextResult} from "../../../../src/handlers/errand.js";
it("carries separate left-out and skipped reports into empty and available startup results",()=>{
 const reports={leftOut:[{inbox:"project" as const,id:"12345678",reason:"Gone",remedy:{text:"Use arc errand queue set."}}],skipped:[{inbox:"personal" as const,id:"87654321",reason:"Conflict",remedy:{text:"Use arc errand queue set."}}]};
 for(const nextOffer of [null,{kind:"errand" as const,key:"personal:11111111",parentCheckoutPath:null}])expect(buildErrandNextResult({kind:"resolved",nextOffer,...reports})).toMatchObject(reports);
});
