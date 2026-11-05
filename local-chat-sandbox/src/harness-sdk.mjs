// Transport only: agent turns, tools, history and execution belong to DeepSeek Harness.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {readPreview,productContext} from '../../app-factory-harness/product-state.mjs';
import {composition} from '../../app-factory-harness/composition.mjs';
const localRoot=fileURLToPath(new URL('../',import.meta.url));
export class HarnessAdapter{
 constructor({root=process.env.DSH_ROOT||'/Users/hw/Desktop/deepseek-harness',dataDir=resolve(localRoot,'data/sdk'),factory,env}={}){this.root=root;this.dataDir=dataDir;this.factory=factory;this.env=env;this.url='DeepSeek Harness · sdk';this.sessions=new Map();this.operations=new Set();this.tail=Promise.resolve();this.roomQueues=new Map();this.monitors=new Map();this.closing=false;}
 async save(){const op=this.tail.then(async()=>{await writeFile(resolve(this.dataDir,'bridge.json.tmp'),JSON.stringify(this.state,null,2),{mode:0o600});await rename(resolve(this.dataDir,'bridge.json.tmp'),resolve(this.dataDir,'bridge.json'));});this.tail=op.catch(()=>{});return op;}
 async ensure(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   await mkdir(this.dataDir,{recursive:true});
   try{this.state=JSON.parse(await readFile(resolve(this.dataDir,'bridge.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.state={rooms:{},jobs:[]};}
   if(this.state.architecture!==2){this.state.legacyRooms=this.state.rooms;this.state.rooms={};this.state.architecture=2;}
   // Never silently replay side effects after a process interruption.
   for(const j of this.state.jobs)if(j.status==='running'){j.status='failed';j.error='上次执行被中断；请先查看 Harness 会话，再明确发送继续指令。';}
   await this.save();
   let env=this.env||{...process.env};
   if(!this.factory&&!env.DEEPSEEK_API_KEY){const {default:c}=await import(pathToFileURL(resolve(homedir(),'.local/lib/node_modules/deepseek-cli/src/config.js')));if(!c.get('apiKey')||c.get('baseURL')!=='https://api.deepseek.com')throw Error('请配置官方 DeepSeek 凭据');env={...env,DEEPSEEK_API_KEY:c.get('apiKey')};}
   // The official Harness Messages adapter has a different endpoint from CLI chat/completions.
   env={...env,DEEPSEEK_BASE_URL:process.env.DSH_MESSAGES_BASE_URL||'https://api.deepseek.com/anthropic',DSH_TELEMETRY_DISABLED:'1',DSH_PERMISSION_MODE:'danger-full-access',DEVECO_CLI_STUDIO_PATH:'/Applications/DevEco-Studio.app'};
   const patch=resolve(this.dataDir,'app-factory.patch.yml');await writeFile(patch,JSON.stringify(await composition(this.root),null,2));
   const options={patches:[patch],dshBin:resolve(this.root,'apps/cli/lib/bin.js'),profile:'sdk',dshHome:resolve(this.dataDir,'home'),processCwd:this.root,cwd:resolve(localRoot,'../case-apps/xiaoyi-music'),model:process.env.DEEPSEEK_MODEL||'deepseek-flash',maxTokens:16384,initializeTimeoutMs:60000,env};
   this.harness=this.factory?this.factory(options):new (await import(pathToFileURL(resolve(this.root,'packages/sdk/client/lib/index.js')))).DeepSeekHarness(options);
   await this.harness.start();return this.harness;
  })();
  try{return await this.ready;}catch(e){await this.harness?.close();this.ready=null;throw e;}
 }
 async health(){await this.ensure();return {ok:true,runtime:'deepseek-harness',router:'Harness Router → Harness Worker',profile:'sdk'};}
 async apps(){const {apps}=JSON.parse(await readFile(resolve(localRoot,'../app-factory/config/apps.local.json'),'utf8'));return apps.map(a=>({...a,root:resolve(localRoot,'../app-factory',a.root)}));}
 async session(room,app){
  if(this.sessions.has(room.id))return this.sessions.get(room.id);
  const saved=this.state.rooms[room.id];
  if(saved&&saved.appId!==app.id)throw Error('此群已绑定另一 App，请新建群，避免混用工作区');
  const session=saved?await this.harness.resumeSession(saved.sessionId):this.harness.session();
  if(!saved){await session.setWorkingDirectory(app.root);this.state.rooms[room.id]={sessionId:session.id,appId:app.id,seen:[]};await this.save();}
  this.sessions.set(room.id,session);return session;
 }
 async submit(message,room,quoted,context=[]){
  if(this.closing)throw Error('Harness 正在关闭');
  await this.ensure();
  if(this.state.jobs.some(j=>j.event_id===message.event_id))return {action:'duplicate'};
  const job={event_id:message.event_id,project_id:'local-chat-sandbox',thread_id:room.id,status:'running',stage:'Router 正在接收消息',outcome:{},progress:[],replies:[]};
  this.state.jobs.push(job);await this.save();
  // Serialize admission, not execution: the Router can receive steering while its Worker runs.
  const prior=this.roomQueues.get(room.id)||Promise.resolve();
  const op=prior.then(()=>this.admit(message,room,quoted,context,job)).catch(async e=>{job.status='failed';job.error=e.message;await this.save();});
  this.roomQueues.set(room.id,op);this.operations.add(op);op.finally(()=>this.operations.delete(op));
  return {action:'queued'};
 }
 async admit(message,room,quoted,context,job){
  const apps=await this.apps();const app=room.app_id?apps.find(a=>a.id===room.app_id):apps.length===1?apps[0]:null;
  if(!app)throw Error('请选择群关联的 App 后再执行');
  const session=await this.session(room,app);job.outcome.task_id=session.id;
  const roomState=this.state.rooms[room.id];const seen=new Set(roomState.seen||[]);
  const fresh=context.filter(m=>m.type==='human'&&m.id!==message.id&&!seen.has(m.id));
  const artifactDir=resolve(localRoot,'data/artifacts',message.id);await mkdir(artifactDir,{recursive:true});job.artifactDir=artifactDir;
  const catalog=JSON.parse(await readFile(new URL('../../app-factory-harness/app-goals.json',import.meta.url),'utf8'));
  const goals=catalog[app.id]||{objective:'按群内确认目标迭代 App',acceptance:[],profiles:['phone'],validationScope:'待核实'};
  roomState.revision=(roomState.revision||0)+1;job.revision=`r${roomState.revision}`;job.profiles=goals.profiles;
  const product=productContext(goals,room,this.state.jobs);
  const instructions=resolve(localRoot,'harness/HARMONY.md');
  const blocks=[{type:'text',text:JSON.stringify({kind:'group_message',product,revision:job.revision,preview_contract:{path:resolve(artifactDir,'preview.json'),schema:{revision:job.revision,status:'preview | verified | blocked',summary:'一句面向用户的变化说明',images:[{profile:'phone | unfolded | tablet',path:'截图相对路径'}],checks:[{profile:'phone | unfolded | tablet',status:'pending | passed | failed | unavailable',evidence:'实际验证说明'}]},rule:'交给 Worker：第一张可看的真实截图完成后就用原生 write 工具发布 preview.json；后续更新同文件。不要等全部回归完成。passed 需要同版本截图与证据。'},room:{id:room.id,name:room.name},app,actor:message.author,addressed:message.addressed,text:message.text,quote:quoted?{text:quoted.text,task:quoted.task_id,revision:quoted.preview?.revision,images:quoted.preview?.images}:null,unseen_history:fresh.map(m=>({id:m.id,actor:m.author,text:m.text,images:m.attachments?.map(a=>a.path)})),images:message.attachments?.map(a=>a.path),worker_harmony_instructions:instructions,artifact_directory:artifactDir,instructions:'将鸿蒙操作说明路径与参考图路径交给 Worker 自行读取。所有执行任务通过原生 subagent，继续同一任务通过 send_message。普通消息判断是否静默；无须群回复时输出 [[SILENT]]。'},null,2)}];
  for(const a of message.attachments||[])blocks.push({type:'image',mimeType:a.mime,data:(await readFile(a.path)).toString('base64')});
  // Subscribe before prompt; session/wait joins native descendants AND the final Router summary.
  let monitor=this.monitors.get(room.id);
  if(!monitor){monitor={session,subscription:this.harness.client.subscribeSessionTree(session.id),jobs:[],lastText:'',reason:null,workers:new Map(),admitting:0,version:0};this.monitors.set(room.id,monitor);}
  monitor.jobs.push(job);monitor.admitting++;monitor.version++;
  try{job.receipt=await this.harness.client.prompt(session.id,blocks);job.stage='Router 已接收，正在处理';}catch(e){monitor.jobs=monitor.jobs.filter(x=>x!==job);if(!monitor.started){monitor.subscription.close();this.monitors.delete(room.id);}throw e;}finally{monitor.admitting--;}
  roomState.seen=[...seen,...fresh.map(m=>m.id),message.id];await this.save();
  if(!monitor.started){monitor.started=true;const op=this.observe(room.id,monitor);this.operations.add(op);op.finally(()=>this.operations.delete(op));}
 }
 async observe(roomId,m){
  let draining=true;
  const consume=n=>{
   if(n.method==='subagent.started'){m.workers.set(n.params.childSessionId,{id:n.params.childSessionId,status:'running'});for(const j of m.jobs)j.stage='Worker 正在执行';}
   if(n.method==='subagent.finished')m.workers.set(n.params.childSessionId,{id:n.params.childSessionId,status:n.params.status,stopReason:n.params.stopReason});
   if(n.method!=='session.event')return;
   const {sessionId,event:e}=n.params;const role=sessionId===m.session.id?'router':'worker';
   if(role==='router'&&e.type==='assistant/message'){m.lastText=e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');const text=m.lastText.trim();if(text&&text!=='[[SILENT]]'){const j=m.jobs.at(-1);j.replies??=[];if(!j.replies.some(r=>r.id===`${sessionId}:${e.seq}`))j.replies.push({id:`${sessionId}:${e.seq}`,text,time:e.time});}}
   if(role==='router'&&e.type==='turn/end')m.reason=e.data.reason;
   if(e.type==='tool/call')for(const j of m.jobs)j.stage=`${role==='worker'?'Worker':'Router'} 正在执行 ${e.data.name||'工具'}`;
   if(['tool/call','tool/result','turn/start','turn/end'].includes(e.type))for(const j of m.jobs){j.progress.push({role,sessionId,type:e.type,time:e.time,data:e.data});if(j.progress.length>200)j.progress.shift();}
  };
  const drain=(async()=>{try{while(draining)consume(await m.subscription.next());}catch(e){if(draining)throw e;}})();
  try{
   // A newly admitted prompt can race the previous idle receipt; wait for its own activity too.
   for(;;){const version=m.version;await this.harness.client.request('session/wait',{sessionId:m.session.id});while(m.admitting)await new Promise(r=>setTimeout(r,10));if(version===m.version)break;}
   // Already queued wire events are drained before final presentation.
   draining=false;const queued=[];let n;while((n=m.subscription.tryNext()))queued.push(n);m.subscription.close();await drain;for(const event of queued)consume(event);
   if(this.monitors.get(roomId)===m)this.monitors.delete(roomId);
   const last=m.jobs.at(-1);const reply=m.lastText.trim()==='[[SILENT]]'?null:m.lastText;
   for(const j of m.jobs){j.status=m.reason?.kind==='error'?'failed':'done';j.stage=j.status==='done'?'本轮已完成':'执行失败';j.workers=[...m.workers.values()];j.outcome={...j.outcome,reply:j===last?reply:null,finishReason:m.reason?.kind};if(j.status==='failed')j.error=m.reason.error?.message||'Harness Router 执行失败';}
  }catch(e){for(const j of m.jobs){j.status='failed';j.error=e.message;}}
  finally{draining=false;m.subscription.close();await drain.catch(e=>{for(const j of m.jobs){j.status='failed';j.error=e.message;}});if(this.monitors.get(roomId)===m)this.monitors.delete(roomId);await this.save();}
 }
 async events(){await this.ensure();let changed=false;
  for(const job of this.state.jobs.filter(j=>j.revision&&j.artifactDir)){
   try{const preview=await readPreview(job.artifactDir,job.revision,job.profiles);if(preview&&JSON.stringify(preview)!==JSON.stringify(job.preview)){job.preview=preview;delete job.previewError;changed=true;}}
   catch(e){if(job.previewError!==e.message){job.previewError=e.message;changed=true;}}
  }
  if(changed)await this.save();return structuredClone(this.state.jobs);
 }
 async close(){this.closing=true;await this.harness?.close();await Promise.allSettled(this.operations);await this.tail;}
}
