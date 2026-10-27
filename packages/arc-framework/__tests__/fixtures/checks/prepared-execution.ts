/** Real selected repositories and standalone protocol fixtures for prepared execution tests. */
import { GIT_REPOSITORY_LOCAL_ENVIRONMENT } from "../../../src/lib/git/process-executor.js";
import type { PrepareSelectedCheckExecutionInput, CheckExecutionIO } from "../../../src/lib/checks/runner/execution.js";
import { createRunnerCheckRepository } from "./runner.js";

export type PreparedAdapterMode = "unknown" | "known" | "missing-runtime" | "source-bytes" | "manifest"
  | "environment" | "unavailable" | "disappeared" | "bad-source-claim" | "execute" | "group" | "wait-prepare" | "cancel-run" | "drift" | "cancel-ready"
  | "group-loss" | "group-malformed" | "cleanup-warning";

export function preparedAdapterScript(mode: PreparedAdapterMode, gate?: string, observations?: string): string {
  return `const mode=${JSON.stringify(mode)};const gate=${JSON.stringify(gate)};const observations=${JSON.stringify(observations)};const gitNames=${JSON.stringify([...GIT_REPOSITORY_LOCAL_ENVIRONMENT])};` + `
    const fs=require('node:fs');
    const path=require('node:path');
    const lines=require('node:readline').createInterface({input:process.stdin});
    const send=message=>process.stdout.write(JSON.stringify(message)+'\\n');
    const record=(name,value)=>{if(observations){const file=path.join(observations,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}};
    let plan;
    let generation;
    let cancelled=false;
    let waitingPreparation;
    let preparationTimer;
    const finishWaitingPreparation=()=>{
      if(!waitingPreparation)return;
      clearInterval(preparationTimer);
      const request=waitingPreparation;
      waitingPreparation=undefined;
      send({jsonrpc:'2.0',id:request.id,result:{status:'unavailable',planId:plan.planId,
        reason:'Preparation cancelled and settled',remedy:'Retry with a fresh attempt.',settled:true}});
    };
    const children=new Set();
    const childEnvironment=invocation=>{
      const normalize=name=>process.platform==='win32'?name.toUpperCase():name;
      const explicit=new Set(Object.keys(plan.environment).map(normalize));
      const owned=new Set([...gitNames,'ARC_CHECK_TREE','ARC_CHECK_BASE','ARC_CHECK_MERGED','ARC_CHECK_NOTICE']);
      const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!owned.has(name.toUpperCase())&&!explicit.has(normalize(name))));
      for(const [name,binding]of Object.entries(plan.environment)){
        const value=binding.kind==='value'?(binding.state==='set'?binding.value:undefined)
          :(binding.state==='empty'?'':binding.state==='file'?binding.path:undefined);
        if(value!==undefined)Object.defineProperty(env,name,{value,writable:true,enumerable:true,configurable:true});
      }
      if(invocation.commandContent){
        env.ARC_CHECK_TREE=invocation.commandContent.tree;
        if(invocation.commandContent.base!==undefined)env.ARC_CHECK_BASE=invocation.commandContent.base;
        if(invocation.commandContent.merged?.length)env.ARC_CHECK_MERGED=invocation.commandContent.merged.join(' ');
      }
      return env;
    };
    const execute=(invocation,report=true)=>new Promise(resolve=>{
      const stdout=[];
      const child=require('node:child_process').spawn(invocation.argv[0],invocation.argv.slice(1),{
        cwd:path.resolve(plan.source.root,invocation.cwd),shell:invocation.shell,env:childEnvironment(invocation),
        stdio:['ignore','pipe','pipe']});
      children.add(child);
      let launchError=false;
      child.on('error',()=>{launchError=true;});
      for(const stream of ['stdout','stderr'])child[stream].on('data',bytes=>{
        if(!report){if(stream==='stdout')stdout.push(bytes);return;}
        for(let offset=0;offset<bytes.length;offset+=65536)send({jsonrpc:'2.0',method:'check/output',params:{
          contextId:'prepared-context',invocationId:invocation.id,stream,dataBase64:bytes.subarray(offset,offset+65536).toString('base64')}});
      });
      child.on('close',(code,signal)=>{
        children.delete(child);
        const outcome=cancelled&&mode==='cancel-run'?{status:'cancelled',reason:'Child cancellation settled'}
          :launchError?{status:'unavailable',reason:'Child executable could not start',remedy:'Repair the command and retry.'}
          :{status:'completed',exitCode:code===null?128+require('node:os').constants.signals[signal]:code};
        if(report)send({jsonrpc:'2.0',method:'check/outcome',params:{contextId:'prepared-context',invocationId:invocation.id,outcome}});
        resolve({outcome,stdout:Buffer.concat(stdout)});
      });
    });
    lines.on('close',()=>{for(const child of children)child.kill('SIGTERM');finishWaitingPreparation();});
    process.on('exit',()=>{for(const child of children)child.kill('SIGTERM');record('closed',{pid:process.pid});});
    if(mode==='wait-prepare'&&observations)process.on('SIGTERM',()=>process.exit(0));
    const qualify=async()=>{
      if(mode==='missing-runtime')return {kind:'known',bindings:[]};
      if(mode!=='known'&&mode!=='drift'&&mode!=='cleanup-warning')return {kind:'unknown',reason:'Test placement has no reusable qualification.'};
      generation=mode==='drift'?fs.readFileSync(gate,'utf8'):undefined;
      const probes=[...plan.probes.global,...plan.probes.check];
      const results=await Promise.all(probes.map(probe=>execute(probe,false)));
      if(results.some(result=>result.outcome.status!=='completed'||result.outcome.exitCode!==0))return {kind:'unknown',reason:'Probe failed.'};
      let outputs;
      try{outputs=results.map(result=>new TextDecoder('utf-8',{fatal:true}).decode(result.stdout));}
      catch{return {kind:'unknown',reason:'Probe stdout was not UTF-8.'};}
      return {kind:'known',bindings:plan.invocations.map(invocation=>({invocationId:invocation.id,
        identity:'sha256:'+(generation===undefined?'b'.repeat(64):require('node:crypto').createHash('sha256').update(generation).digest('hex')),
        probes:probes.map((probe,index)=>({id:probe.id,stdout:outputs[index]}))}))};
    };
    const handle=async line=>{
      const request=JSON.parse(line);
      if(request.method==='check/prepare'){
        plan=request.params;
        record('source',plan.source);
        record('preparing',{planId:plan.planId,source:plan.source,pid:process.pid});
        if(mode==='unavailable'){
          send({jsonrpc:'2.0',id:request.id,result:{status:'unavailable',planId:plan.planId,
            reason:'No compatible placement',remedy:'Repair adapter placement and retry.',settled:true}});
          return;
        }
        const recovery={jsonrpc:'2.0',method:'check/recovery',params:{planId:plan.planId,
          instructions:mode==='group-loss'||mode==='group-malformed'
            ?'For plan '+plan.planId+', wait for this scripted adapter process to exit. Its only launched child closes before transport ends; after process closure, remove retained captures manually.'
            :'Inspect and settle this test attempt by its plan UUID.'}};
        if(mode==='disappeared'){
          process.stdout.write(JSON.stringify(recovery)+'\\n',()=>process.exit(0));
          return;
        }
        await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(recovery)+'\\n',error=>error?reject(error):resolve()));
        if(mode==='wait-prepare'||mode==='cancel-ready'){
          waitingPreparation=request;
          if(mode==='wait-prepare')preparationTimer=setInterval(()=>{if(gate&&fs.existsSync(gate))finishWaitingPreparation();},10);
          process.stderr.write('waiting for cancellation\\n');
          return;
        }
        if(mode==='source-bytes')fs.writeFileSync(path.join(plan.source.root,'input.txt'),'altered source');
        if(mode==='manifest')fs.writeFileSync(plan.source.manifest,'invalid manifest');
        if(mode==='environment')fs.writeFileSync(plan.environment.EXPLICIT_FILE.path,'altered explicit input');
        const runtime=await qualify();
        send({jsonrpc:'2.0',id:request.id,result:{status:'ready',planId:plan.planId,contextId:'prepared-context',
          sourceDigest:mode==='bad-source-claim'?'sha256:'+'c'.repeat(64):plan.source.digest,
          capabilities:{runGroup:mode==='group'||mode==='group-loss'||mode==='group-malformed'},runtime}});
      }else if(request.method==='check/release'){
        if(mode==='cancel-ready'&&gate)fs.writeFileSync(gate,'released');
        const result={contextId:request.params.contextId,released:true};
        if(mode==='cleanup-warning'){
          const artifact=path.join(observations,'settled-resource');
          fs.writeFileSync(artifact,'settled provider resource');
          result.cleanupWarning='Remove settled provider resource manually: '+artifact;
        }
        send({jsonrpc:'2.0',id:request.id,result});
      }else if(request.method==='check/cancel'){
        cancelled=true;
        record('cancel',request.params);
        if(mode==='cancel-run')for(const child of children)child.kill('SIGTERM');
        send({jsonrpc:'2.0',id:request.id,result:{planId:request.params.planId,accepted:true}});
        if(mode==='cancel-ready'&&waitingPreparation){
          const preparing=waitingPreparation;
          waitingPreparation=undefined;
          send({jsonrpc:'2.0',id:preparing.id,result:{status:'ready',planId:plan.planId,contextId:'prepared-context',
            sourceDigest:plan.source.digest,capabilities:{runGroup:false},runtime:{kind:'unknown',reason:'Unqualified test runtime'}}});
        }
      }else if(request.method==='check/run'||request.method==='check/runGroup'){
        const ids=request.method==='check/run'?[request.params.invocationId]:request.params.invocationIds;
        if(mode==='group-loss'||mode==='group-malformed'){
          await execute(plan.invocations.find(invocation=>invocation.id===ids[0]));
          process.stdout.write(mode==='group-malformed'?'not a JSON frame'+String.fromCharCode(10):'',()=>process.exit(mode==='group-malformed'?1:0));
          return;
        }
        if(mode==='drift'&&fs.readFileSync(gate,'utf8')!==generation){
          for(const id of ids)send({jsonrpc:'2.0',method:'check/outcome',params:{contextId:'prepared-context',invocationId:id,
            outcome:{status:'unavailable',reason:'Prepared runtime changed',remedy:'Retry explicitly with fresh preparation.'}}});
          send({jsonrpc:'2.0',id:request.id,result:{contextId:'prepared-context',settled:true,outputComplete:true,invocationIds:ids}});
          return;
        }
        Promise.all(ids.map(id=>execute(plan.invocations.find(invocation=>invocation.id===id)))).then(()=>{
          send({jsonrpc:'2.0',id:request.id,result:{contextId:'prepared-context',settled:true,outputComplete:true,invocationIds:ids}});
        });
      }
    };
    lines.on('line',line=>{void handle(line).catch(()=>process.exit(1));});
  `;
}

export async function selectedExecutionFixture(directories: string[], mode: PreparedAdapterMode = "unknown"):
Promise<{ root: string; stateRoot: string; input: PrepareSelectedCheckExecutionInput; io: CheckExecutionIO; captures: string[] }> {
  const fixture = await createRunnerCheckRepository(directories);
  return { ...fixture, input: { ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript(mode)] } } };
}
