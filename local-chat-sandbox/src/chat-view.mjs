import {createHash} from 'node:crypto';
export function chatView(data,roomId,bridge){
 const rooms=data.rooms.filter(r=>!r.deleted_at).map(r=>({...r,message_count:data.messages.filter(m=>m.room_id===r.id).length}));
 const messages=data.messages.filter(m=>rooms.some(r=>r.id===m.room_id)&&(roomId===null||m.room_id===roomId)).map(m=>{
  const {progress,workers,...message}=m;
  return {...message,progress_count:progress?.length||0};
 });
 const view={version:data.version,rooms,people:data.people,messages,deletedRooms:data.rooms.filter(r=>r.deleted_at).map(r=>({id:r.id,name:r.name,deleted_at:r.deleted_at})),bridge};
 // Ignore internal log changes so quiet pages do not download or redraw unchanged content.
 const revision=createHash('sha256').update(JSON.stringify(view)).digest('hex');
 return {...view,revision};
}
