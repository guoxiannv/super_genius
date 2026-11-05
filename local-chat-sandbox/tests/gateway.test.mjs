import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createGateway} from '../deployment/gateway.mjs';
test('public gateway authenticates every route and rejects foreign origins',async()=>{
 const password='test-password-with-at-least-24-characters';
 const backend=http.createServer((req,res)=>res.end(JSON.stringify({host:req.headers.host,origin:req.headers.origin,auth:req.headers.authorization,url:req.url})));
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const port=backend.address().port;
 const gateway=createGateway({password,upstreamPort:port});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const request=(path,headers={})=>new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:gateway.address().port,path,headers:{host:'supergenius.bitfun-platform.com',...headers}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
 const authorization='Basic '+Buffer.from(`admin:${password}`).toString('base64');
 try{
  for(const path of ['/','/api/state','/api/media','/api/team'])assert.equal((await request(path)).status,401);
  assert.equal((await request('/',{authorization:'Basic '+Buffer.from('admin:wrong').toString('base64')})).status,401);
  assert.equal((await request('/',{authorization,host:'evil.example'})).status,403);
  assert.equal((await request('/',{authorization,origin:'https://evil.example'})).status,403);
  assert.equal((await request('/',{authorization,'sec-fetch-site':'cross-site'})).status,403);
  const response=await request('/api/state?test=1',{authorization,origin:'https://supergenius.bitfun-platform.com'});
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(response.body),{host:`127.0.0.1:${port}`,origin:`http://127.0.0.1:${port}`,url:'/api/state?test=1'});
 }finally{await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>backend.close(r))]);}
});
