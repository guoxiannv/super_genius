import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
const timestamp=()=>new Date().toISOString();
export class Store {
 constructor(path){this.path=path;this.tail=Promise.resolve();}
 async load(){
  await mkdir(dirname(this.path),{recursive:true});
  this.lock=await open(this.path+'.lock','wx').catch(()=>{throw new Error('聊天服务已运行或锁文件尚未清理');});
  await this.lock.writeFile(String(process.pid));
  try{
   try{this.data=JSON.parse(await readFile(this.path,'utf8'));}
   catch(e){if(e.code!=='ENOENT')throw e;this.data={version:1,revision:0,people:[{id:randomUUID(),name:'林晓',role:'产品',color:'#ac5b30'},{id:randomUUID(),name:'陈禾',role:'设计',color:'#537e63'},{id:randomUUID(),name:'周予',role:'开发',color:'#5a70aa'}],rooms:[],messages:[]};}
   if(this.data.version!==1)throw new Error('不支持的聊天数据版本');
   await this.write(()=>{});return this;
  }catch(e){await this.close();throw e;}
 }
 snapshot(){return structuredClone(this.data);}
 setRoomDeleted(id,deleted){return this.write(d=>{const room=d.rooms.find(r=>r.id===id);if(!room)throw Error('群不存在');if(deleted&&d.messages.some(m=>m.room_id===id&&m.type==='human'&&['queued','submitted'].includes(m.delivery)))throw Error('群里仍有待处理或执行中的任务，请结束后再删除');if(deleted)room.deleted_at=timestamp();else delete room.deleted_at;return room;});}
 write(fn){const operation=this.tail.then(async()=>{const next=structuredClone(this.data);const result=await fn(next);next.revision++;await writeFile(this.path+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(this.path+'.tmp',this.path);this.data=next;return structuredClone(result);});this.tail=operation.catch(()=>{});return operation;}
 async close(){await this.tail;if(this.lock){await this.lock.close();this.lock=null;await unlink(this.path+'.lock');}}
 addPerson({name,role}){
  if(typeof name!=='string'||!name.trim()||name.length>40||typeof role!=='string'||!role.trim()||role.length>40||/app-factory/i.test(name))throw new Error('请填写姓名与职责（各 1–40 字），机器人名称不可使用');
  return this.write(d=>{const p={id:randomUUID(),name:name.trim(),role:role.trim(),color:['#ac5b30','#537e63','#5a70aa','#9364a2'][d.people.length%4]};d.people.push(p);return p;});
 }
 createRoom({name,member_ids,app_id=null}){
  if(typeof name!=='string'||!name.trim()||name.length>80||!Array.isArray(member_ids)||!member_ids.length)throw new Error('请填写群名称并选择至少一名人员');
  if(app_id!==null&&(typeof app_id!=='string'||app_id.length>120))throw new Error('无效 App');
  return this.write(d=>{if(member_ids.some(id=>!d.people.some(p=>p.id===id)))throw new Error('人员不存在');const r={id:randomUUID(),name:name.trim(),member_ids:[...new Set(member_ids)],app_id,created_at:timestamp()};d.rooms.push(r);return r;});
 }
 addMember(roomId,personId){return this.write(d=>{const r=d.rooms.find(r=>r.id===roomId);if(!r||r.deleted_at||!d.people.some(p=>p.id===personId))throw new Error('群或人员不存在');if(!r.member_ids.includes(personId))r.member_ids.push(personId);return r;});}
 post(roomId,{client_id,person_id,text,reply_to=null,attachments=[]}){
  if(typeof client_id!=='string'||!/^[\w-]{8,100}$/.test(client_id)||typeof text!=='string'||(!text.trim()&&!attachments.length)||text.length>20000)throw new Error('消息不能为空且需少于 20000 字');
  return this.write(d=>{
   const existing=d.messages.find(m=>m.room_id===roomId&&m.client_id===client_id);if(existing)return existing;
   const room=d.rooms.find(r=>r.id===roomId);const person=d.people.find(p=>p.id===person_id);
   if(!room||room.deleted_at||!person||!room.member_ids.includes(person_id))throw new Error('群已删除或当前身份不是当前群成员');
   const quoted=reply_to?d.messages.find(m=>m.id===reply_to&&m.room_id===roomId):null;
   if(reply_to&&!quoted)throw new Error('引用消息不属于当前群');
   const m={id:randomUUID(),client_id,room_id:roomId,person_id,author:structuredClone(person),text:text.trim(),attachments,reply_to,created_at:timestamp(),type:'human',addressed:/(^|[\s，。,:：！!？?])@app-factory(?=$|[\s，。,:：！!？?])/i.test(text),delivery:'queued',attempts:0,next_attempt_at:0,app_id:room.app_id,event_id:'',task_id:quoted?.task_id??null};
   m.event_id='localchat-'+m.id;d.messages.push(m);return m;
  });
 }
 retry(id){return this.write(d=>{const m=d.messages.find(m=>m.id===id&&m.type==='human');if(!m)throw new Error('消息不存在');if(d.rooms.find(r=>r.id===m.room_id)?.deleted_at)throw Error('请先恢复该群');if(!['failed','missing_result','queued'].includes(m.delivery))throw new Error('该消息无需重试');m.delivery=m.delivery==='missing_result'?'submitted':'queued';m.attempts=0;m.next_attempt_at=0;delete m.error;return m;});}
}
