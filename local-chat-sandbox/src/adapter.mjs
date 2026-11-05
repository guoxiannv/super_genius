export {HarnessAdapter} from './harness-sdk.mjs';
export class Bridge{
 constructor({store,adapter}){this.store=store;this.adapter=adapter;this.status={connected:false,note:'正在检查本机主服务',url:adapter.url};}
 async tick(){if(this.busy)return;this.busy=true;try{
  let health;try{health=await this.adapter.health();this.status={connected:true,note:'已连接主服务',url:this.adapter.url,...health};}catch{this.status={connected:false,note:'主服务未启动；聊天已本地保存，消息等待转发',url:this.adapter.url};return;}
  // Serialize within each room: follow-up changes cannot overtake their task creation.
  let d=this.store.snapshot();const selected=new Map();
  for(const m of d.messages.filter(m=>m.type==='human'&&m.delivery==='queued')){if(!selected.has(m.room_id))selected.set(m.room_id,m);}
  for(const m of selected.values()){
   if(m.delivery!=='queued'||m.next_attempt_at>Date.now())continue;
   try{
    const room=d.rooms.find(r=>r.id===m.room_id);const quote=d.messages.find(q=>q.id===m.reply_to);
    const r=await this.adapter.submit(m,room,quote,d.messages.filter(x=>x.room_id===room.id&&x.created_at<=m.created_at));if(!['queued','duplicate'].includes(r.action))throw new Error('invalid_receipt');
    await this.store.write(data=>{const current=data.messages.find(x=>x.id===m.id);current.delivery='submitted';current.submitted_at=new Date().toISOString();delete current.error;});
   }catch{await this.store.write(data=>{const current=data.messages.find(x=>x.id===m.id);current.attempts++;current.delivery=current.attempts>=3?'failed':'queued';current.error='主服务接收失败，可重试';current.next_attempt_at=Date.now()+3000*current.attempts;});}
  }
  d=this.store.snapshot();const waiting=d.messages.filter(m=>m.delivery==='submitted');if(!waiting.length)return;
  let events;try{events=await this.adapter.events();}catch{return;}
  for(const m of waiting){
   const event=events.find(e=>e.event_id===m.event_id&&e.project_id==='local-chat-sandbox'&&e.thread_id===m.room_id);
   if(!event){if(Date.now()-Date.parse(m.submitted_at)>60000)await this.store.write(data=>{const current=data.messages.find(x=>x.id===m.id);current.delivery='missing_result';current.error='Harness 未找到此事件；请核对持久会话，勿直接重复执行';});continue;}
   await this.store.write(data=>{
    const current=data.messages.find(x=>x.id===m.id);current.stage=event.stage||'Harness 正在处理';current.task_id=event.outcome?.task_id??current.task_id;
    const dirs=events.filter(e=>e.thread_id===m.room_id).map(e=>e.artifactDir).filter(Boolean);
    for(const reply of event.replies||[]){const id='harness-'+reply.id;if(!data.messages.some(x=>x.id===id))data.messages.push({id,room_id:m.room_id,type:'bot',author:{name:'app-factory',role:'DeepSeek Harness',color:'#267265'},text:reply.text,artifactDirs:dirs,reply_to:m.id,task_id:current.task_id,event_id:m.event_id,created_at:new Date(reply.time||Date.now()).toISOString(),delivery:'done'});}
   });
   if(event.status==='failed'){await this.store.write(data=>{const current=data.messages.find(x=>x.id===m.id);current.delivery='failed';current.error=event.error||'Harness 执行失败；请查看过程';});continue;}
   if(event.status!=='done'){if(event.progress?.length)await this.store.write(data=>{const current=data.messages.find(x=>x.id===m.id);current.progress=event.progress;});continue;}
   await this.store.write(data=>{
    const current=data.messages.find(x=>x.id===m.id);current.delivery=event.outcome?.reply?'done':'observed';current.task_id=event.outcome?.task_id??current.task_id;current.progress=event.progress||[];current.workers=event.workers||[];
    if(event.outcome?.reply&&!event.replies?.length&&!data.messages.some(x=>x.id==='bot-'+m.id))data.messages.push({id:'bot-'+m.id,room_id:m.room_id,type:'bot',author:{name:'app-factory',role:'DeepSeek Harness',color:'#267265'},text:event.outcome.reply,artifactDir:event.artifactDir,artifactDirs:events.filter(e=>e.thread_id===m.room_id).map(e=>e.artifactDir).filter(Boolean),workers:event.workers,reply_to:m.id,task_id:current.task_id,event_id:m.event_id,created_at:new Date().toISOString(),delivery:'done'});
   });
  }
 }finally{this.busy=false;}}
}
