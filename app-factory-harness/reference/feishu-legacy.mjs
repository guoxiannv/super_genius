import * as Lark from '@larksuiteoapi/node-sdk';

export function normalizeFeishu(data,{channels,botId}){
 const {sender,message:m}=data;
 if(sender?.sender_type!=='user'||!m?.message_id)return null;
 const channel=channels.find(c=>c.chat_id===m.chat_id);if(!channel)return null;
 let content;try{content=JSON.parse(m.content);}catch{return null;}
 if(m.message_type!=='text')return null; // Image/file/transcript-fetch is explicitly deferred.
 const mentions=m.mentions??[];let text=content.text??'';
 const addressed=m.chat_type==='p2p'||mentions.some(x=>x.id?.open_id===botId);
 for(const mention of mentions)text=text.split(mention.key).join(mention.id?.open_id===botId?'@小鸿':`@${mention.name}`);
 return {event_id:m.message_id,source:'feishu',project_id:channel.project_id,thread_id:m.thread_id||m.root_id||m.message_id,reply_to:m.parent_id||null,actor_id:sender.sender_id?.open_id||null,kind:'message',text,addressed,app_id:channel.default_app_id||null,allowed_app_ids:channel.app_ids,delivery:{message_id:m.message_id,chat_id:m.chat_id}};
}

export async function deliverOutbox({store,send,now=Date.now()}){
 const jobs=store.snapshot().outbox.filter(o=>o.status==='pending'&&o.next_attempt_at<=now);
 for(const job of jobs){
  try{const messageId=await send(job);await store.transact(d=>{const o=d.outbox.find(o=>o.id===job.id);o.status='sent';o.remote_message_id=messageId;o.sent_at=new Date().toISOString();});}
  catch{await store.transact(d=>{const o=d.outbox.find(o=>o.id===job.id);o.attempts++;o.status=o.attempts>=3?'failed':'pending';o.next_attempt_at=Date.now()+5000*o.attempts;o.error='delivery_failed_check_bot_permissions';});}
 }
}
export async function startFeishu({config,agent,store,env=process.env}){
 if(env.FEISHU_ENABLED!=='true')return {status:()=>({state:'disabled'}),close(){}};
 const required=['FEISHU_APP_ID','FEISHU_APP_SECRET','FEISHU_BOT_OPEN_ID'];
 if(required.some(k=>!env[k])||!config.channels.length)throw new Error('feishu_configuration_missing: credentials, bot open_id and channels.local.json required');
 const client=new Lark.Client({appId:env.FEISHU_APP_ID,appSecret:env.FEISHU_APP_SECRET});
 const ws=new Lark.WSClient({appId:env.FEISHU_APP_ID,appSecret:env.FEISHU_APP_SECRET,loggerLevel:Lark.LoggerLevel.error});
 const dispatcher=new Lark.EventDispatcher({}).register({'im.message.receive_v1':async data=>{const e=normalizeFeishu(data,{channels:config.channels,botId:env.FEISHU_BOT_OPEN_ID});if(e)await agent.ingest(e);}});
 // Handler only persists the event, so model/worker latency cannot hold up SDK event ACK.
 let sending=false;const tick=async()=>{if(sending)return;sending=true;try{await deliverOutbox({store,send:async job=>{
  const r=await client.im.v1.message.reply({path:{message_id:job.delivery.message_id},data:{msg_type:'text',content:JSON.stringify({text:job.text}),reply_in_thread:true,uuid:job.id}});
  if(r.code!==0||!r.data?.message_id)throw new Error('reply_failed');return r.data.message_id;
 }});}catch{console.error('outbox_storage_error');}finally{sending=false;}};
 const timer=setInterval(tick,1000);
 void ws.start({eventDispatcher:dispatcher}).catch(()=>console.error('feishu_connection_failed_check_credentials'));
 return {status:()=>ws.getConnectionStatus(),async close(){clearInterval(timer);ws.close({force:true});while(sending)await new Promise(r=>setTimeout(r,20));}};
}
