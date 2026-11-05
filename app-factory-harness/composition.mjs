import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Registry,registryRoot as root} from './registry.mjs';
import {registeredApps} from './config.mjs';
export async function composition(harnessRoot){
 const packageFile=(group,pkg)=>resolve(harnessRoot,'packages',group,pkg,'lib/index.js');
 const db=new Registry();let roles,skills;try{roles=db.list('role');skills=db.list('skill').filter(s=>s.status==='active');}finally{db.close();}
 const knowledge=['team_memory_read','team_memory_write','team_memory_review','team_skill_save','group_publish','group_route','skill'];
 const control=['subagent','send_message','interrupt_agent','list_agents','wait_agent','todo_write'];
 const forbidden=['plugin_manager','schedule_create','schedule_edit','schedule_list','schedule_view'];
 const policies=Object.fromEntries(roles.map(r=>[r.id,r.kind==='chief'?{allow:[...control,...knowledge]}:{deny:[...forbidden,...(r.canDelegate?[]:['subagent']),...(r.kind==='clone'?['send_message','interrupt_agent','list_agents','wait_agent']:[])]}]));
 const common='实际工作任务开始时按需用 team_memory_read 检索相关经验；寒暄、旁听和简单在场询问不检索、不写记忆、不派 Worker。确认的经验用 team_memory_write 带来源保存，任务细节写 session，长期角色经验写 role。不要保存凭据。共享经验由幕僚长归并。发现可重复流程可随时用 team_skill_save 生成带验证证据的草稿。';
 const declarations=[];
 for(const r of roles){
  const skillDir=resolve(root,'data/skills',r.id);await rm(skillDir,{recursive:true,force:true});await mkdir(skillDir,{recursive:true});
  for(const s of skills.filter(s=>s.owner===r.id)){const dir=resolve(skillDir,s.name);await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'SKILL.md'),`---\nname: ${s.name}\ndescription: ${JSON.stringify(s.description)}\n---\n${s.body}\n`);}
  const base=await readFile(resolve(root,r.kind==='chief'?'ROUTER.md':'WORKER.md'),'utf8');
  declarations.push({id:'preset-'+r.id,name:packageFile('preset','agent-preset'),config:{id:r.id,name:r.name,plugins:[...(r.kind!=='chief'&&r.canDelegate?[{name:packageFile('subagent','tool-subagent'),config:{provider:'spawn',toolName:'subagent',agentPreset:'app-clone',allowedAgentPresets:['app-clone'],maxDepth:2}}]:[]),{name:packageFile('preset','persona'),config:{prefix:base+'\n'+r.persona+'\n'+common}},{name:packageFile('skill','skill-filesystem'),config:{providerName:'skills-'+r.id,includeDefaultRoots:false,customSkillDirs:[skillDir],watch:true}}]}});
 }
 return [
  {id:'tool-subagent',config:{provider:'spawn',toolName:'subagent',agentPreset:'app-worker',allowedAgentPresets:roles.filter(r=>r.kind!=='chief').map(r=>r.id),maxDepth:2}},
  {id:'subagent',config:{maxActiveSubagents:4,maxDepth:2}},
  {id:'tool-subagent-fork',disabled:true},{id:'tool-workflow',disabled:true},
  {insert:[{id:'app-preset-registry',name:packageFile('preset','agent-preset-registry'),config:{default:'app-router'}},...declarations,
   {id:'app-role-tools',name:resolve(root,'plugins/role-tools.mjs'),config:{routerPreset:'app-router',policies}},
   {id:'app-knowledge',name:resolve(root,'plugins/team-knowledge.mjs'),config:{toolsModule:packageFile('core','tools'),scopeModule:packageFile('core','scope'),roleRevisions:Object.fromEntries(roles.map(r=>[r.id,r.revision||0])),database:resolve(root,'data/team.sqlite'),apps:await registeredApps()}},
  ]},
 ];
}
