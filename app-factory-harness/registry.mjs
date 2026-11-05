import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const registryRoot=dirname(fileURLToPath(import.meta.url));
const roles=[
 {id:'app-router',name:'幕僚长',kind:'chief',persona:'维护团队目标、决策和任务依赖，拆解与委派专业角色；只把确实阻塞的决定交给人。',canDelegate:true},
 {id:'app-worker',name:'应用工程师',kind:'worker',persona:'负责实现与构建，保持现有功能，按验收条件完成交付。',canDelegate:true},
 {id:'app-designer',name:'体验设计师',kind:'worker',persona:'负责视觉和交互方案，先给可看的可逆方案；关注多设备布局和连续体验。',canDelegate:true},
 {id:'app-verifier',name:'鸿蒙验证工程师',kind:'worker',persona:'负责设备操作、复现、回归和截图证据。未测不能算通过；不修改产品需求。',canDelegate:true},
 {id:'app-clone',name:'任务分身',kind:'clone',persona:'执行单个边界清晰的任务。保留独立会话记忆，不再委派。完成后只回传摘要和证据。',canDelegate:false},
];
function text(value,label,max=12000){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label}无效`);return value.trim();}
function slug(value){if(typeof value!=='string'||! /^[a-z][a-z0-9-]{1,63}$/.test(value))throw Error('标识必须为 2–64 位小写字母、数字和连字符');return value;}
export class Registry{
 constructor(path=resolve(registryRoot,'data/team.sqlite')){
  mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS items(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id));');
  for(const role of roles)this.db.prepare('INSERT OR IGNORE INTO items VALUES(?,?,?)').run('role',role.id,JSON.stringify(role));
 }
 close(){this.db.close();}
 list(kind){return this.db.prepare('SELECT value FROM items WHERE kind=? ORDER BY id').all(kind).map(x=>JSON.parse(x.value));}
 get(kind,id){const row=this.db.prepare('SELECT value FROM items WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.value):null;}
 put(kind,item){this.db.prepare('INSERT INTO items VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,item.id,JSON.stringify(item));return item;}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 saveRole(input){return this.transaction(()=>{const id=slug(input.id);const prev=this.get('role',id);if(!prev)throw Error('请通过模板导入创建新角色');if(input.revision!==(prev.revision||0))throw Error('角色已更新，请刷新后再保存');return this.put('role',{...prev,name:text(input.name,'名称',100),persona:text(input.persona,'职责'),revision:(prev.revision||0)+1});});}
 remember(actor,input){return this.transaction(()=>{
  const scope=input.scope;const keys={global:'team',app:actor.app,role:actor.role,session:actor.session};if(!Object.hasOwn(keys,scope)||!keys[scope])throw Error('无效记忆范围');
  const title=text(input.title,'标题',120),body=text(input.body,'记忆',4000),source=text(input.source,'来源',1000);
  const shared=scope==='global'||scope==='app';const status=shared&&actor.kind!=='chief'?'proposed':'active';
  const old=input.id?this.get('memory',input.id):null;if(input.id&&(!old||old.scope!==scope||old.key!==keys[scope]))throw Error('无法修改该记忆');
  if(old&&input.revision!==old.revision)throw Error('记忆已更新，请重新读取');
  if(old&&shared&&actor.kind!=='chief')throw Error('Worker 只能提出新的共享经验，不能覆盖共享记忆');
  return this.put('memory',{id:old?.id||randomUUID(),scope,key:keys[scope],title,body,source,status,revision:(old?.revision||0)+1,author:actor.session,updatedAt:new Date().toISOString()});
 });}
 memories(actor,query=''){const q=String(query).toLowerCase();return this.list('memory').filter(m=>(m.status==='active'||actor.kind==='chief')&&(m.scope==='global'||m.scope==='app'&&m.key===actor.app||m.scope==='role'&&m.key===actor.role||m.scope==='session'&&m.key===actor.session)&&JSON.stringify([m.title,m.body]).toLowerCase().includes(q)).slice(-30);}
 reviewMemory(id,status,revision){return this.transaction(()=>{if(!['active','retired'].includes(status))throw Error('无效状态');const m=this.get('memory',id);if(!m||m.revision!==revision)throw Error('记忆版本冲突');return this.put('memory',{...m,status,revision:m.revision+1});});}
 saveSkill(actor,input){return this.transaction(()=>{const name=slug(input.name),description=text(input.description,'用途',500),body=text(input.body,'Skill 内容',30000),evidence=text(input.evidence,'来源与验证',3000);const owner=actor.role;const id=owner+'--'+name;const previous=this.get('skill',id);if(previous&&input.revision!==previous.revision)throw Error('Skill 版本冲突');return this.put('skill',{id,name,owner,description,body,evidence,status:'draft',revision:(previous?.revision||0)+1,author:actor.session,updatedAt:new Date().toISOString()});});}
 activateSkill(id,revision){return this.transaction(()=>{const skill=this.get('skill',id);if(!skill||skill.revision!==revision)throw Error('Skill 版本冲突');return this.put('skill',{...skill,status:'active',revision:skill.revision+1});});}
 exportTemplate(roleId){const r=this.get('role',roleId);if(!r)throw Error('角色不存在');return {format:'app-factory-bot',version:1,role:{name:r.name,persona:r.persona,canDelegate:r.canDelegate},skills:this.list('skill').filter(s=>s.owner===r.id&&s.status==='active').map(s=>({name:s.name,description:s.description,body:s.body}))};}
 importTemplate(input){
  if(!input||input.format!=='app-factory-bot'||input.version!==1||!input.role||!Array.isArray(input.skills)||input.skills.length>30)throw Error('不支持的模板格式');
  const role={id:'bot-'+randomUUID().slice(0,8),kind:'worker',name:text(input.role.name,'角色名称',100),persona:text(input.role.persona,'职责'),canDelegate:input.role.canDelegate===true};
  const skills=input.skills.map(s=>({name:slug(s.name),description:text(s.description,'用途',500),body:text(s.body,'Skill 内容',30000)}));if(new Set(skills.map(s=>s.name)).size!==skills.length)throw Error('模板有重复 Skill');
  return this.transaction(()=>{this.put('role',role);for(const s of skills)this.put('skill',{...s,id:role.id+'--'+s.name,owner:role.id,status:'draft',revision:1,evidence:'由模板导入；未在本机验证',author:'template'});return role;});
 }
 editSkill(input){const previous=this.get('skill',input.id);if(!previous)throw Error('Skill 不存在');return this.saveSkill({role:previous.owner,session:'local-user'},{...input,name:previous.name});}
 snapshot(){return {roles:this.list('role'),memories:this.list('memory'),skills:this.list('skill'),instances:this.list('instance')};}
}
