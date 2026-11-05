import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Separate deployment boundary: the temporary chat and Harness stay on loopback.
export function createGateway({password,origin='https://supergenius.bitfun-platform.com',upstreamPort=8790}) {
 if(typeof password!=='string' || !password.trim())throw Error('A non-empty password is required');
 const expected=createHash('sha256').update(`admin:${password}`).digest();
 const publicHost=new URL(origin).host;
 return http.createServer((req,res)=>{
  const reply=(status,message,headers={})=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(message);};
  if(req.headers.host!==publicHost)return reply(403,'Host rejected');
  if(req.headers.origin && req.headers.origin!==origin)return reply(403,'Origin rejected');
  if(req.headers['sec-fetch-site']==='cross-site')return reply(403,'Cross-site request rejected');
  const auth=req.headers.authorization||'';
  const supplied=createHash('sha256').update(auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64'):Buffer.alloc(0)).digest();
  if(!timingSafeEqual(expected,supplied))return reply(401,'请使用本机部署凭据登录 Super Genius',{'WWW-Authenticate':'Basic realm="Super Genius", charset="UTF-8"'});
  if(!req.url.startsWith('/') || req.url.startsWith('//'))return reply(400,'Invalid path');
  const headers={...req.headers,host:`127.0.0.1:${upstreamPort}`};
  for(const key of Object.keys(headers))if(key.startsWith('cf-') || key.startsWith('x-forwarded-') || ['authorization','cookie','connection','proxy-authorization','forwarded'].includes(key))delete headers[key];
  if(headers.origin)headers.origin=`http://127.0.0.1:${upstreamPort}`;
  const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers},response=>{
   res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)reply(502,'Local chat service is unavailable');else res.destroy();});
  req.on('aborted',()=>upstream.destroy());
  res.on('close',()=>upstream.destroy());
  req.pipe(upstream);
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const password=(await readFile(new URL('../data/tunnel/password',import.meta.url),'utf8')).trim();
 const server=createGateway({password});
 server.listen(8791,'127.0.0.1',()=>console.log('Super Genius authenticated gateway listening on 127.0.0.1:8791'));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
}
