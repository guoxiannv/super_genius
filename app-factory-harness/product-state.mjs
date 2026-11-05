import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
/** Read only explicitly published Worker previews. Never infer verification from a screenshot. */
export async function readPreview(directory,revision,profiles){
 let data;try{data=JSON.parse(await readFile(resolve(directory,'preview.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(data.revision!==revision||!['preview','verified','blocked'].includes(data.status)||typeof data.summary!=='string'||data.summary.length>600)throw Error('无效 preview.json：版本、状态或摘要不匹配');
 if(!Array.isArray(data.images)||data.images.length>12)throw Error('预览图片列表无效');
 const root=await realpath(directory);const images=[];
 for(const a of data.images){if(!profiles.includes(a.profile)||typeof a.path!=='string')throw Error('预览设备或路径无效');const path=await realpath(resolve(directory,a.path));if(!path.startsWith(root+sep)||! /\.(png|jpg|jpeg|webp)$/i.test(path))throw Error('预览图片必须位于本次产物目录');const info=await stat(path);if(!info.isFile()||info.size>20*1024*1024)throw Error('预览图片大小无效');images.push({profile:a.profile,path,url:'/api/media?path='+encodeURIComponent(path)});}
 const checks=profiles.map(profile=>{const c=data.checks?.find(c=>c.profile===profile);const status=c?.status||'pending';if(!['pending','passed','failed','unavailable'].includes(status))throw Error('无效验证状态');if(status==='passed'&&(!images.some(a=>a.profile===profile)||!c.evidence))throw Error('通过状态需要本版本图片和验证说明');return {profile,status,evidence:String(c?.evidence||'').slice(0,600)};});
 if(data.status==='verified'&&checks.some(c=>c.status!=='passed'))throw Error('全体验证完成需要全部尺寸通过');
 return {revision,status:data.status,summary:data.summary,images,checks,workerReported:true};
}
export function productContext(goals,room,jobs){
 const versions=jobs.filter(j=>j.thread_id===room.id&&j.revision);
 const latest=versions.findLast(j=>j.preview);
 return {goals,currentRevision:versions.at(-1)?.revision||null,latestVisible:latest?.preview||null,active:versions.filter(j=>j.status==='running').map(j=>({revision:j.revision,stage:j.stage})),rule:'历史版本的通过结果不代表当前版本通过。没有新截图时明确说明尚未验证。'};
}
