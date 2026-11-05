import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('./',import.meta.url));
/** A normal dsh SDK profile overlay, using native presets and delegation. */
export async function composition(harnessRoot){
 const packageFile=(group,pkg)=>resolve(harnessRoot,'packages',group,pkg,'lib/index.js');
 const persona=packageFile('preset','persona');
 const role=(id,text)=>({id:'app-'+id,name:packageFile('preset','agent-preset'),config:{id:'app-'+id,name:id==='router'?'App Factory Router':'App Factory Worker',plugins:[{name:persona,config:{prefix:text}}]}});
 return [
  {id:'tool-subagent',config:{provider:'spawn',toolName:'subagent',agentPreset:'app-worker',maxDepth:1}},
  {id:'tool-subagent-fork',disabled:true},
  {id:'tool-workflow',disabled:true},
  {insert:[
   {id:'app-role-tools',name:resolve(root,'plugins/role-tools.mjs'),config:{routerPreset:'app-router',policies:{'app-router':{allow:['subagent','send_message','interrupt_agent','list_agents','wait_agent','todo_write']},'app-worker':{deny:['subagent','send_message','interrupt_agent','list_agents','wait_agent','plugin_manager','schedule_create','schedule_edit','schedule_list','schedule_view']}}}},
   {id:'app-preset-registry',name:packageFile('preset','agent-preset-registry'),config:{default:'app-router'}},
   role('router',await readFile(resolve(root,'ROUTER.md'),'utf8')),
   role('worker',await readFile(resolve(root,'WORKER.md'),'utf8')),
  ]},
 ];
}
