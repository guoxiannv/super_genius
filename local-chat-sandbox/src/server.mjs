import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {saveImage,localMedia} from './attachments.mjs';
import {Store} from './store.mjs';
import {HarnessAdapter,Bridge} from './adapter.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function createChatServer({dataFile=resolve(root,'data/chat.json'),adapter=new HarnessAdapter(),port=Number(process.env.CHAT_PORT)||8790}={}){
 const store=await new Store(dataFile).load();const bridge=new Bridge({store,adapter});
 const assets=new Map(await Promise.all(['index.html','app.js','style.css'].map(async name=>['/'+name,await readFile(resolve(root,'public',name))])));
 const tick=()=>bridge.tick().catch(()=>{bridge.status={connected:false,note:'聊天桥接发生错误；请检查本地服务日志'};console.error('bridge_error');});
 const timer=setInterval(tick,1500);void tick();
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('需要 JSON');const buffers=[];let n=0;for await(const b of req){n+=b.length;if(n>9*1024*1024)throw new Error('请求过大');buffers.push(b);}return JSON.parse(Buffer.concat(buffers).toString('utf8'));}
 const server=http.createServer(async(req,res)=>{try{
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||''))return json(res,403,{error:'host_rejected'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'origin_rejected'});
  const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname;
  if(req.method==='GET'&&['/','/index.html','/app.js','/style.css'].includes(path)){
   const name=path==='/'?'/index.html':path;res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});return res.end(assets.get(name));
  }
  if(req.method==='POST'&&path==='/api/uploads')return json(res,201,await saveImage(resolve(root,'data/uploads'),await body(req)));
  if(req.method==='GET'&&path==='/api/media'){const media=await localMedia(resolve(root,'data'),url.searchParams.get('path')||'');res.writeHead(200,{'Content-Type':media.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(media.bytes);}
  if(req.method==='GET'&&path==='/api/state')return json(res,200,{...store.snapshot(),bridge:bridge.status});
  if(req.method==='GET'&&path==='/api/apps'){try{return json(res,200,{apps:await adapter.apps()});}catch{return json(res,200,{apps:[],offline:true});}}
  if(req.method==='GET'&&path==='/api/export'){
   const d=store.snapshot();const room=d.rooms.find(r=>r.id===url.searchParams.get('room'));if(!room)return json(res,404,{error:'会话不存在'});
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="chat-${room.id}.json"`});return res.end(JSON.stringify({room,people:d.people.filter(p=>room.member_ids.includes(p.id)),messages:d.messages.filter(m=>m.room_id===room.id)},null,2));
  }
  if(req.method==='POST'&&path==='/api/people')return json(res,201,await store.addPerson(await body(req)));
  if(req.method==='POST'&&path==='/api/rooms')return json(res,201,await store.createRoom(await body(req)));
  const member=path.match(/^\/api\/rooms\/([\w-]+)\/members$/);
  if(req.method==='POST'&&member){const input=await body(req);return json(res,200,await store.addMember(member[1],input.person_id));}
  const message=path.match(/^\/api\/rooms\/([\w-]+)\/messages$/);
  if(req.method==='POST'&&message){const input=await body(req);if(input.attachments){if(!Array.isArray(input.attachments)||input.attachments.length>4)throw Error('每条消息最多 4 张图片');for(const a of input.attachments){const media=await localMedia(resolve(root,'data/uploads'),a.path);a.mime=media.mime;a.url='/api/media?path='+encodeURIComponent(a.path);}}const result=await store.post(message[1],input);void tick();return json(res,201,result);}
  const retry=path.match(/^\/api\/messages\/([\w-]+)\/retry$/);
  if(req.method==='POST'&&retry){await body(req);const result=await store.retry(retry[1]);void tick();return json(res,200,result);}
  return json(res,404,{error:'not_found'});
 }catch(e){json(res,400,{error:e instanceof SyntaxError?'无效 JSON':e.message});}});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);}).catch(async e=>{clearInterval(timer);while(bridge.busy)await new Promise(r=>setTimeout(r,20));await store.close();throw e;});
 return {server,store,bridge,port:server.address().port,async close(){clearInterval(timer);await new Promise(r=>server.close(r));await adapter.close?.();while(bridge.busy)await new Promise(r=>setTimeout(r,20));await store.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createChatServer();console.log(`Local Chat: http://127.0.0.1:${app.port} — data: ${root}data/chat.json`);
 let closing=false;async function stop(){if(closing)return;closing=true;await app.close();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
