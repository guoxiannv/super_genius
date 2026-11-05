// Presentation bookkeeping only. The native Router decides message semantics.
export function consumeGroupEvent(m,n,allJobs=m.jobs){
 m.workerOwners??=new Map();m.publicCalls??=new Map();
 const find=id=>allJobs.find(j=>j.event_id===id&&j.thread_id===m.jobs[0]?.thread_id);
 if(n.method==='subagent.started'){
  const id=n.params.childSessionId;
  const owner=m.workerOwners.get(n.params.parentSessionId)||m.activeWork;
  if(owner)m.workerOwners.set(id,owner);
  m.workers.set(id,{id,status:'running'});
  if(owner&&owner.status==='running')owner.stage='Worker 正在执行';
 }
 if(n.method==='subagent.finished')m.workers.set(n.params.childSessionId,{id:n.params.childSessionId,status:n.params.status,stopReason:n.params.stopReason});
 if(n.method!=='session.event')return;
 const {sessionId,event:e}=n.params;const role=sessionId===m.session.id?'router':'worker';
 if(role==='router'&&e.type==='turn/start')m.currentInput=null;
 if(role==='router'&&e.type==='tool/call'&&['group_route','group_publish'].includes(e.data.name))m.publicCalls.set(e.data.callId,e.data.name);
 if(role==='router'&&e.type==='tool/result'&&!e.data.message?.isError){
  const tool=m.publicCalls.get(e.data.message?.toolCallId);
  if(tool){
   m.publicCalls.delete(e.data.message.toolCallId);
   try{
    const p=JSON.parse(e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''));
    const j=find(p.event_id);
    if(j&&tool==='group_route'&&p.routed&&['observe','answer','work'].includes(p.disposition)){
     j.disposition=p.disposition;m.currentInput=j;
     if(p.disposition==='work'){m.activeWork=j;j.stage='任务处理中';}
     else {j.progress=[];j.workers=[];j.stage=p.disposition==='observe'?'已旁听 · 无需回复':'正在简短答复';}
     if(p.disposition==='observe'){j.status='done';j.outcome={...j.outcome,reply:null};}
    }
    if(j&&tool==='group_publish'&&p.published&&typeof p.text==='string'&&j.disposition!=='observe'){
     j.replies??=[];
     // Do not turn a simple presence question into a series of status reports.
     if(!(j.disposition==='answer'&&j.replies.length)&&!j.replies.some(r=>r.text.trim()===p.text.trim())){
      j.replies.push({id:`${sessionId}:${e.seq}`,text:p.text,time:e.time});j.outcome={...j.outcome,reply:p.text};
     }
    }
   }catch{/* Unknown or invalid publications never fall back to the latest chat. */}
  }
 }
 if(role==='router'&&e.type==='turn/end'){
  m.reason=e.data.reason;
  if(m.currentInput?.disposition==='answer'){m.currentInput.status=e.data.reason.kind==='error'?'failed':'done';m.currentInput.stage='已答复';}
 }
 const owner=role==='worker'?m.workerOwners.get(sessionId):m.currentInput;
 if(!owner||owner.disposition!=='work')return;
 if(e.type==='tool/call')owner.stage=`${role==='worker'?'Worker':'Router'} 正在执行 ${e.data.name||'工具'}`;
 if(['tool/call','tool/result','turn/start','turn/end'].includes(e.type)){
  owner.progress.push({role,sessionId,type:e.type,time:e.time,data:e.data});if(owner.progress.length>200)owner.progress.shift();
 }
}
