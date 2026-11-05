import {Registry} from '../registry.mjs';
export const name='app-factory-team-knowledge';
export const inject=['tools','agentPresets'];
export async function apply(ctx,config){
 const {defineTool}=await import(config.toolsModule);const db=new Registry(config.database);
 ctx.effect(()=>()=>db.close());
 const actor=agent=>{if(!agent)throw Error('需要 Agent 身份');const role=ctx.agentPresets.composedPreset(agent.ctx);const r=db.get('role',role);if(!r)throw Error('未知角色');const instance=db.get('instance',agent.id);return {role,kind:r.kind,session:agent.id,app:instance?.app||''};};
 ctx.on('agent/created',({agent})=>{const role=ctx.agentPresets.composedPreset(agent.ctx);const app=config.apps.find(a=>a.root===agent.session.header?.cwd)?.id||'';db.put('instance',{id:agent.id,role,app,parent:agent.session.header?.parentSession||null,createdAt:db.get('instance',agent.id)?.createdAt||new Date().toISOString()});});
 const register=(name,description,parameters,execute)=>ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(args,exec){return JSON.stringify(await execute(actor(exec.agent),args));}})));
 register('team_memory_read','按当前 App、角色和分身读取分层记忆；不会返回其他角色的私人记忆。',{query:{type:'string'}},(a,p)=>db.memories(a,p.query));
 register('team_memory_write','记录带来源的经验。Worker 写共享范围时只生成候选，由幕僚长归并；角色和分身记忆直接保存。',{scope:{type:'string',required:true},title:{type:'string',required:true},body:{type:'string',required:true},source:{type:'string',required:true},id:{type:'string'},revision:{type:'integer'}},(a,p)=>db.remember(a,p));
 register('team_memory_review','幕僚长归并或退役共享经验，不能借此读取别人的私人记忆。',{id:{type:'string',required:true},status:{type:'string',required:true},revision:{type:'integer',required:true}},(a,p)=>{if(a.kind!=='chief')throw Error('仅幕僚长可归并');const m=db.get('memory',p.id);if(!m||!['global','app'].includes(m.scope)||(m.scope==='app'&&m.key!==a.app))throw Error('不是可归并的共享记忆');return db.reviewMemory(p.id,p.status,p.revision);});
 register('team_skill_save','沉淀当前角色的 Skill 草稿，包含适用范围、步骤、限制和验证证据；草稿不会自动成为可执行 Skill。',{name:{type:'string',required:true},description:{type:'string',required:true},body:{type:'string',required:true},evidence:{type:'string',required:true},revision:{type:'integer'}},(a,p)=>db.saveSkill(a,p));
}
