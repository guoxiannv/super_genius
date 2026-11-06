const $=id=>document.getElementById(id);
let attachments=[];
let state={rooms:[],people:[],messages:[],deletedRooms:[]},roomId=new URLSearchParams(location.search).get('room'),stateRoom=null,lastRevision=-1,quoteId=null,loading=false,posting=false,pendingId=null,personSignature='',lastRoom=null;
const windowId=new URLSearchParams(location.search).get('window')||crypto.randomUUID();
{const u=new URL(location);u.searchParams.set('window',windowId);history.replaceState({},'',u);}
const labels={queued:'已存本地 · 等待转发',submitted:'已转发 · 等待主服务',observed:'已作为上下文接收',done:'已处理',failed:'转发或处理失败',missing_result:'结果待核对'};
const speakerKey=()=>`local-chat:${windowId}:${roomId}:speaker`;
const draftKey=()=>`local-chat:${windowId}:${roomId}:draft`;
const currentRoom=()=>state.rooms.find(r=>r.id===roomId);
function node(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'请求失败');return data;}
function avatar(person,index=0){return node('span','avatar c'+(index%4),person.name.slice(0,1));}
function openRoomWindow(id){const u=new URL(location.origin);u.searchParams.set('room',id);u.searchParams.set('window',crypto.randomUUID());const w=window.open(u.toString(),'_blank','popup,width=1240,height=850');if(w)w.opener=null;else toast('浏览器阻止了弹窗；请允许本地页面弹窗，或在当前窗口打开群。');}
function selectRoom(id){if(roomId)sessionStorage.setItem(draftKey(),$('message-text').value);roomId=id;quoteId=null;const u=new URL(location);u.searchParams.set('room',id);history.replaceState({},'',u);lastRevision=-1;render();void refresh();}
function render(){
 const active=state.messages.filter(m=>m.room_id===roomId&&['queued','submitted'].includes(m.delivery));$('work-status').hidden=!active.length;$('work-status').textContent=active.length?`Agent 工作中 · ${active.length} 项`:'';
 $('bridge-status').textContent=state.bridge?.connected?`已连接 ${state.bridge.runtime||'服务'} · ${state.bridge.router||'unknown'}`:state.bridge?.note||'主服务未连接';$('status-dot').classList.toggle('online',!!state.bridge?.connected);
 if(lastRevision===state.revision&&lastRoom===roomId)return;lastRevision=state.revision;
 $('room-count').textContent=state.rooms.length;$('room-list').replaceChildren();
 const roomQuery=($('room-search')?.value||'').trim().toLowerCase();for(const room of state.rooms.filter(r=>!roomQuery||r.name.toLowerCase().includes(roomQuery))){const button=node('button','room-button'+(room.id===roomId?' active':''));button.append(node('strong','',room.name),node('small','',`${room.member_ids.length} 人 · ${room.message_count??0} 条消息`));button.onclick=()=>selectRoom(room.id);$('room-list').append(button);}
 $('people-list').replaceChildren();for(const [i,p] of state.people.entries())$('people-list').append(personNode(p,i));
 const room=currentRoom();$('delete-room').disabled=!room;$('message-form').hidden=!room;$('open-window').disabled=!room;$('add-member').disabled=!room;$('export').hidden=!room;
 if(!room){$('room-title').textContent='让团队在这里聊起来。';$('room-meta').textContent='创建一个群，切换身份，@app-factory。';$('messages').textContent=roomId?'这个群不存在或已移入回收站，请从左侧选择。':'选择一个群，或创建新群。';lastRoom=null;return;}
 $('room-title').textContent=room.name;$('room-meta').textContent=`${room.member_ids.length} 位成员 + app-factory${room.app_id?' · App: '+room.app_id:''} · 本地持久会话`;
 document.title=room.name+' · Local Room';$('export').href='/api/export?room='+encodeURIComponent(room.id);
 const people=state.people.filter(p=>room.member_ids.includes(p.id));const signature=room.id+people.map(p=>p.id).join();
 if(signature!==personSignature){personSignature=signature;const saved=sessionStorage.getItem(speakerKey());$('speaker').replaceChildren();for(const p of people){const o=node('option','',`${p.name} · ${p.role}`);o.value=p.id;$('speaker').append(o);}if(people.some(p=>p.id===saved))$('speaker').value=saved;}
 $('members').replaceChildren();for(const [i,p] of people.entries())$('members').append(personNode(p,i,true));
 const changed=lastRoom!==roomId;if(changed){clearAttachments();renderPending();$('message-text').value=sessionStorage.getItem(draftKey())||'';quoteId=null;pendingId=null;}
 const messages=state.messages.filter(m=>m.room_id===roomId);const atBottom=changed||$('messages').scrollHeight-$('messages').scrollTop-$('messages').clientHeight<100;const scroll=$('messages').scrollTop;
 const expanded=new Set([...$('messages').querySelectorAll('article:has(details[open])')].map(n=>n.dataset.messageId));
 $('messages').replaceChildren();if(!messages.length){const empty=node('div','empty');empty.append(node('div','empty-glyph','✳'),node('h2','','讨论从这里开始'),node('p','','先选择发言身份。普通消息记入讨论，@app-factory 会唤起主服务。'));$('messages').append(empty);}
 for(const m of messages){const item=node('article','message'+(m.type==='bot'?' bot':''));item.dataset.messageId=m.id;const a=avatar(m.author,state.people.findIndex(p=>p.id===m.person_id));if(m.type==='bot')a.textContent='a.';item.append(a);const content=node('div','message-content');const title=node('div','message-head');title.append(node('b','',m.author.name),node('span','role',m.author.role),node('time','',new Date(m.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})));content.append(title);
  if(m.reply_to){const q=messages.find(x=>x.id===m.reply_to);if(q)content.append(node('div','quote-preview',`${q.author.name}：${q.text.slice(0,120)}`));}
  const bubble=node('div','bubble');const parts=m.text.split(/(@app-factory)/gi);for(const part of parts)bubble.append(part.toLowerCase()==='@app-factory'?node('span','at',part):document.createTextNode(part));if(m.type==='bot'&&!m.preview&&m.text.length>450){const detail=node('details','reply-detail');detail.append(node('summary','','查看完整说明'),bubble);content.append(node('div','bubble',m.text.split('\n').find(x=>x.trim())||'结果说明'),detail);}else content.append(bubble);
  if(m.preview){const card=node('section','version-card');card.append(node('b','',`${m.preview.revision} · ${m.preview.status==='verified'?'验证完成':m.preview.status==='blocked'?'有阻碍':'预览 · 验证中'}`));const names={phone:'手机',unfolded:'折叠展开',tablet:'平板'};const states={pending:'待验证',passed:'通过',failed:'未通过',unavailable:'设备不可用'};const checks=node('div','profile-checks');for(const c of m.preview.checks){const badge=node('span','check-'+c.status,`${names[c.profile]||c.profile}：${states[c.status]}`);badge.title=c.evidence||'';checks.append(badge);}card.append(checks);const gallery=node('div','preview-gallery');for(const a of m.preview.images){const figure=node('figure');const link=node('a');link.href=a.url;link.target='_blank';link.rel='noopener';const img=node('img','chat-image');img.loading='lazy';img.src=a.url;img.alt=names[a.profile]||a.profile;link.append(img);figure.append(link,node('figcaption','',names[a.profile]||a.profile));gallery.append(figure);}card.append(gallery);const replyVersion=node('button','',`基于 ${m.preview.revision} 继续改`);replyVersion.type='button';replyVersion.onclick=()=>{quoteId=m.id;renderQuote();$('message-text').focus();};card.append(replyVersion);content.append(card);}

  for(const a of m.attachments||[]){const link=node('a');link.href=a.url;link.target='_blank';link.rel='noopener';const img=node('img','chat-image');img.loading='lazy';img.src=a.url;img.alt=a.name||'参考图';link.append(img);content.append(link);}
  if(m.type==='bot')for(const match of m.text.matchAll(/!\[[^\]]*\]\(<?([^)>]+)>?\)/g)){if(match[1].startsWith('/')&&(m.artifactDirs||[m.artifactDir]).some(dir=>dir&&match[1].startsWith(dir+'/'))){const img=node('img','chat-image');img.loading='lazy';img.src='/api/media?path='+encodeURIComponent(match[1]);img.alt='Harness 实际输出截图';content.append(img);}}
  if(m.progress_count&&m.disposition!=='observe'&&m.disposition!=='answer'){const details=node('details','execution');details.append(node('summary','',`Harness 执行过程 · ${m.progress_count} 条`));details.ontoggle=async()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='1';try{const data=await api(`/api/messages/${m.id}/progress`);for(const step of data.progress)details.append(node('pre','',(step.role||'Harness')+' · '+step.type+' '+step.text));}catch(e){details.dataset.loaded='';details.append(node('p','error',e.message));}};details.open=expanded.has(m.id);content.append(details);}
  if(m.error)content.append(node('p','error',m.error));
  const actions=node('div','message-actions');if(m.type==='human')actions.append(node('span','',m.delivery==='submitted'?(m.stage||'Router 已接收，正在处理'):(labels[m.delivery]||m.delivery)));const reply=node('button','','回复');reply.onclick=()=>{quoteId=m.id;renderQuote();$('message-text').focus();};actions.append(reply);
  if(['failed','missing_result'].includes(m.delivery)){const retry=node('button','','重试 / 查结果');retry.onclick=async()=>{try{await api(`/api/messages/${m.id}/retry`,{});await refresh();}catch(e){toast(e.message);}};actions.append(retry);actions.title=m.error||'';}
  content.append(actions);item.append(content);$('messages').append(item);
 }
 lastRoom=roomId;renderQuote();if(atBottom)$('messages').scrollTop=$('messages').scrollHeight;else $('messages').scrollTop=scroll;
}
function personNode(p,i,choose=false){const d=node('div','person');const detail=node('div');detail.append(node('b','',p.name),node('small','',p.role));d.append(avatar(p,i),detail);if(choose){const b=node('button','choose','切换');b.onclick=()=>{$('speaker').value=p.id;sessionStorage.setItem(speakerKey(),p.id);toast('现在以 '+p.name+' 发言');};d.append(b);}return d;}
function renderQuote(){const q=state.messages.find(m=>m.id===quoteId&&m.room_id===roomId);$('quote').hidden=!q;$('quote-text').textContent=q?`回复 ${q.author.name}：${q.text.slice(0,100)}`:'';}
async function refresh(){if(loading)return;loading=true;const target=roomId;try{const data=await api('/api/state?room='+encodeURIComponent(target||'')+(stateRoom===target?'&since='+encodeURIComponent(state.revision||''):''));if(target!==roomId)return;if(!data.unchanged){state=data;stateRoom=target;}else state.bridge=data.bridge;render();}catch(e){$('bridge-status').textContent='本地聊天服务未连接：'+e.message;$('status-dot').classList.remove('online');}finally{loading=false;if(target!==roomId)void refresh();}}
function personDialog(){ $('person-form').reset();$('person-dialog').showModal();$('person-name').focus();}
function roomDialog(){ $('room-form').reset();$('member-choices').replaceChildren();for(const p of state.people){const label=node('label','check');const input=node('input');input.type='checkbox';input.name='members';input.value=p.id;input.checked=true;label.append(input,document.createTextNode(`${p.name} · ${p.role}`));$('member-choices').append(label);} $('room-app').replaceChildren(new Option('未绑定 / 由 Agent 询问',''));api('/api/apps').then(({apps})=>{for(const a of apps)$('room-app').append(new Option(a.name,a.id));}).catch(()=>{});$('room-dialog').showModal();$('room-name').focus();}
$('room-search').oninput=()=>{lastRevision=-1;render();};document.querySelectorAll('[data-quick]').forEach(button=>button.onclick=()=>{const input=$('message-text');input.value=button.dataset.quick;input.dispatchEvent(new Event('input'));input.focus();});$('new-room').onclick=roomDialog;$('empty-create').onclick=roomDialog;$('new-person').onclick=personDialog;
$('open-window').onclick=()=>openRoomWindow(roomId);$('refresh').onclick=refresh;
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
$('person-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const p=await api('/api/people',{name:$('person-name').value,role:$('person-role').value});if(currentRoom())await api(`/api/rooms/${roomId}/members`,{person_id:p.id});$('person-dialog').close();await refresh();toast(currentRoom()?'人员已创建并加入当前群':'人员已创建');}catch(e){toast(e.message);}finally{button.disabled=false;}};
$('room-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;const win=$('room-new-window').checked?window.open('about:blank','_blank','popup,width=1240,height=850'):null;if(win)win.opener=null;
 try{const r=await api('/api/rooms',{name:$('room-name').value,member_ids:[...document.querySelectorAll('#member-choices input:checked')].map(i=>i.value),app_id:$('room-app').value||null});$('room-dialog').close();await refresh();selectRoom(r.id);if(win)win.location.href=`${location.origin}/?room=${r.id}&window=${crypto.randomUUID()}`;else if($('room-new-window').checked)toast('新群已创建；弹窗被阻止，已在当前窗口打开。');}catch(e){win?.close();toast(e.message);}finally{button.disabled=false;}};
$('speaker').onchange=()=>sessionStorage.setItem(speakerKey(),$('speaker').value);
$('message-text').oninput=()=>{sessionStorage.setItem(draftKey(),$('message-text').value);pendingId=null;};
$('mention').onclick=()=>{const input=$('message-text');const pos=input.selectionStart;input.setRangeText('@app-factory ',pos,input.selectionEnd,'end');input.dispatchEvent(new Event('input'));input.focus();};
$('clear-quote').onclick=()=>{quoteId=null;renderQuote();};
$('message-form').onsubmit=async e=>{e.preventDefault();if(posting||!roomId||(!$('message-text').value.trim()&&!attachments.length))return;if(attachments.some(a=>a.status!=='ready')){toast('请等待图片上传完成，或重试 / 移除失败图片。');return;}posting=true;$('send').disabled=true;pendingId ||=crypto.randomUUID();const sentRoom=roomId;
 try{await api(`/api/rooms/${roomId}/messages`,{client_id:pendingId,person_id:$('speaker').value,text:$('message-text').value,reply_to:quoteId,attachments:attachments.map(a=>a.uploaded)});if(sentRoom===roomId){clearAttachments();renderPending();$('message-text').value='';sessionStorage.removeItem(draftKey());quoteId=null;pendingId=null;}$('messages').scrollTop=$('messages').scrollHeight;await refresh();$('message-text').focus();}catch(e){toast(e.message);}finally{posting=false;$('send').disabled=false;}};
$('message-text').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('message-form').requestSubmit();}};
$('add-member').onclick=()=>{const room=currentRoom();$('available-members').replaceChildren();const people=state.people.filter(p=>!room.member_ids.includes(p.id));if(!people.length)$('available-members').textContent='所有人员都已在群里，也可以创建新人员。';for(const p of people){const b=node('button','room-button',`${p.name} · ${p.role} ＋`);b.onclick=async()=>{try{await api(`/api/rooms/${roomId}/members`,{person_id:p.id});$('member-dialog').close();await refresh();}catch(e){toast(e.message);}};$('available-members').append(b);}$('member-dialog').showModal();};
$('create-member').onclick=()=>{$('member-dialog').close();personDialog();};
window.addEventListener('focus',refresh);window.addEventListener('beforeunload',()=>{if(roomId)sessionStorage.setItem(draftKey(),$('message-text').value);});await refresh();setInterval(()=>{if(!document.hidden)void refresh();},3000);

function clearAttachments(){for(const a of attachments)URL.revokeObjectURL(a.previewUrl);attachments=[];}
function renderPending(){
 $('pending-images').replaceChildren();
 for(const a of attachments){
  const card=node('div','pending-image');const image=node('img');image.src=a.previewUrl;image.alt=a.name;card.append(image);
  const info=node('div','pending-image-info');info.append(node('span','pending-image-name',a.name),node('span',a.status==='error'?'error':'pending-image-status',a.status==='ready'?'已上传':a.status==='error'?a.error:'上传中…'));
  if(a.status==='error'){const retry=node('button','','重试');retry.type='button';retry.onclick=()=>{if(!posting)void uploadAttachment(a);};info.append(retry);}
  const remove=node('button','pending-image-remove','×');remove.type='button';remove.setAttribute('aria-label','移除图片 '+a.name);remove.onclick=()=>{if(posting)return;attachments=attachments.filter(x=>x!==a);URL.revokeObjectURL(a.previewUrl);pendingId=null;renderPending();};card.append(info,remove);$('pending-images').append(card);
 }
}
async function uploadAttachment(a){
 if(a.inflight)return;a.inflight=true;a.status='uploading';a.error=null;renderPending();
 try{
  const data=await new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result.split(',')[1]);reader.onerror=()=>no(Error('无法读取图片'));reader.readAsDataURL(a.file);});
  const uploaded=await api('/api/uploads',{name:a.name,data});
  if(!attachments.includes(a))return;a.uploaded=uploaded;a.status='ready';pendingId=null;
 }catch(e){if(attachments.includes(a)){a.status='error';a.error=e.message||'上传失败';}}
 finally{a.inflight=false;if(attachments.includes(a))renderPending();}
}
async function uploadImages(files){
 if(posting||!currentRoom())return;
 const pending=[];
 for(const file of Array.from(files)){
  if(attachments.length>=4){toast('每条消息最多 4 张图片');break;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('仅支持 PNG、JPEG、WebP 图片');continue;}
  if(file.size>6*1024*1024){toast('每张图片最多 6MB');continue;}
  const a={name:file.name||'粘贴图片',file,previewUrl:URL.createObjectURL(file),status:'uploading'};
  attachments.push(a);pending.push(a);pendingId=null;
 }
 renderPending();await Promise.all(pending.map(uploadAttachment));
}
$('attach').onclick=()=>$('image-input').click();$('image-input').onchange=async()=>{await uploadImages($('image-input').files);$('image-input').value='';};
$('message-text').addEventListener('paste',e=>{const files=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();void uploadImages(files);}});

function openTeam(){const url='/team.html?embedded=1&room='+encodeURIComponent(roomId||'');if($('team-frame').getAttribute('src')!==url)$('team-frame').src=url;$('team-drawer').showModal();}
$('team-open').onclick=openTeam;$('bot-profile').onclick=openTeam;$('team-close').onclick=()=>$('team-drawer').close();

$('delete-room').onclick=async()=>{const room=currentRoom();if(!room)return;try{await api(`/api/rooms/${room.id}/delete`,{});roomId=null;stateRoom=null;quoteId=null;const u=new URL(location);u.searchParams.delete('room');history.replaceState({},'',u);await refresh();toast('已移入回收站，可恢复。');}catch(e){toast(e.message);}};
$('trash-open').onclick=()=>{const list=$('trash-list');list.replaceChildren();for(const room of state.deletedRooms||[]){const row=node('div','person');row.append(node('span','',room.name));const button=node('button','','恢复');button.onclick=async()=>{try{await api(`/api/rooms/${room.id}/restore`,{});$('trash-dialog').close();await refresh();selectRoom(room.id);}catch(e){toast(e.message);}};row.append(button);list.append(row);}if(!list.childNodes.length)list.textContent='回收站为空';$('trash-dialog').showModal();};
