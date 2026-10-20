import http from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadConfig,reviewWithDeepSeek,serviceStatus,ReviewError,validateInput} from './deepseek.mjs';
import {inspect,isAdviceQuestion} from './pipeline/index.mjs';
import {serviceStatus as forensicsStatus} from './pipeline/forensics.mjs';
import {lookupKnowledge} from './knowledge.mjs';
import {transcribeAudio} from './transcribe.mjs';
let activeReviews=0,reviewWindow=[],activePages=0,pageWindow=[];
const configuredHosts=new Set((process.env.AUTHEN_ALLOWED_HOSTS||'').split(',').filter(Boolean));
const configuredOrigins=new Set((process.env.AUTHEN_ALLOWED_ORIGINS||'').split(',').filter(Boolean));
export function allowedRequest(headers){
 const host=headers.host||'',origin=headers.origin;
 const allowedHost=configuredHosts.size?configuredHosts.has(host):/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
 const allowedOrigin=!origin||(configuredOrigins.size?configuredOrigins.has(origin):/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
 return allowedHost&&allowedOrigin&&headers['sec-fetch-site']!=='cross-site';
}
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
export {publicAddress} from './public-page.mjs';
import {readPage} from './public-page.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.gz':'application/gzip','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
export const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
 try{if(req.url?.startsWith('/authen/'))req.url=req.url.slice(7);if(req.url==='/api/health')return json(200,{ok:true,service:'authen',release:process.env.AUTHEN_RELEASE||'local',analysis:'multi-agent-6dim-v2',ai:await serviceStatus(),forensics:await forensicsStatus()});
 if(req.url==='/api/transcribe'&&req.method==='POST'){
  if(!allowedRequest(req.headers))return json(403,{error:'请从AUTHEN应用或网页打开。'});
  if(!/^application\/json\b/.test(req.headers['content-type']||''))return json(415,{error:'请使用JSON音频请求。'});
  const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort()});
  try{let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>16_000_100)return json(413,{error:'音频太大，请先截取片段。'});chunks.push(c)}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json(400,{error:'音频无法读取。'})}
   const result=await transcribeAudio(body,{signal:abort.signal});return json(200,result);
  }catch(e){if(!res.destroyed)return json(e instanceof ReviewError?e.status:502,{error:e instanceof ReviewError?e.message:'音频读取暂不可用。'})}return;
 }
 if(req.url==='/api/review'&&req.method==='POST'){
  res.setHeader('Cache-Control','no-store');
  if(!allowedRequest(req.headers))return json(403,{error:'请从AUTHEN应用或网页打开。'});
  if(!/^application\/json\b/.test(req.headers['content-type']||''))return json(415,{error:'请使用JSON素材请求。'});
  reviewWindow=reviewWindow.filter(t=>Date.now()-t<60000);
  if(activeReviews>=2||reviewWindow.length>=12)return json(429,{error:'当前任务较多，请稍后再试。'});
  const abort=new AbortController();const disconnect=()=>{if(!res.writableEnded)abort.abort();};res.on('close',disconnect);
  let accepted=false;
  try{
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>16_000_000)return json(413,{error:'素材较大，请减少图片或选择较短片段。'});chunks.push(c);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(400,{error:'素材内容无法读取。'});}
   if(activeReviews>=2)return json(429,{error:'当前任务较多，请稍后再试。'});
   activeReviews++;accepted=true;reviewWindow.push(Date.now());
   const input=validateInput(body);
   if(isAdviceQuestion(input)){
    const knowledge=await lookupKnowledge(input.text,{signal:abort.signal});
    const result=await reviewWithDeepSeek(body,{signal:abort.signal,references:knowledge.references});if(!res.destroyed)return json(200,result);
   }else{
    let config=null;try{config=await loadConfig();}catch(e){if(!(e instanceof ReviewError))throw e;}
    const result=await inspect(body,{input,config,signal:abort.signal});if(!res.destroyed)return json(200,result);
   }
  }catch(e){if(!res.destroyed)return json(e instanceof ReviewError?e.status:502,{error:e instanceof ReviewError?e.message:'分析服务暂不可用。'});}
  finally{if(accepted)activeReviews--;res.off('close',disconnect);}
  return;
 }
 if(req.url==='/api/export'&&req.method==='POST'){
  if(!allowedRequest(req.headers))return json(403,{error:'请从AUTHEN应用或网页打开。'});
  let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>20_000_000)return json(413,{error:'报告太大。'});chunks.push(c)}
  const content=new URLSearchParams(Buffer.concat(chunks).toString()).get('content')||'';
  if(!content.startsWith('<!doctype html>'))return json(400,{error:'报告内容不完整。'});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename=AUTHEN-report.html','Content-Length':Buffer.byteLength(content),'Cache-Control':'no-store'});return res.end(content);
 }
 if(req.url==='/api/page'&&req.method==='POST'){
  if(!allowedRequest(req.headers))return json(403,{error:'请从AUTHEN应用或网页打开。'});
  if(!/^application\/json\b/.test(req.headers['content-type']||''))return json(415,{error:'请使用JSON链接请求。'});
  pageWindow=pageWindow.filter(t=>Date.now()-t<60000);
  if(activePages>=2||pageWindow.length>=16)return json(429,{error:'正在读取的链接有点多，稍后再试。'});
  const control=new AbortController();res.on('close',()=>{if(!res.writableEnded)control.abort()});
  let accepted=false;
  try{let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>12000)return json(413,{error:'分享内容太长，只粘贴链接试试。'})}
   let parsed;try{parsed=JSON.parse(body)}catch{return json(400,{error:'链接内容无法读取。'})}
   if(activePages>=2)return json(429,{error:'正在读取的链接有点多，稍后再试。'});
   activePages++;accepted=true;pageWindow.push(Date.now());
   const page=await readPage(parsed.url,{signal:control.signal});if(!res.destroyed)return json(200,page);
  }catch(e){if(!res.destroyed)return json(422,{code:e.code||'READ_FAILED',error:/链接|页面|这页|截图|公开|格式|分享/.test(e.message)?e.message:'这个链接暂时没读到，粘贴原文或补截图就能继续。'})}
  finally{if(accepted)activePages--;}return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'请求方式不支持。'});
 let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+name);if(file!==root&&!file.startsWith(root+path.sep))return json(403,{error:'不可读取这个文件。'});if(name==='/'||!path.extname(name))file=path.join(root,'index.html');await stat(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':name.startsWith('/art/')||name.startsWith('/ocr/')?'public,max-age=86400':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{return json(404,{error:'找不到这个文件。'})}});
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.AUTHEN_PORT||4173);server.requestTimeout=240000;server.listen(port,'127.0.0.1',()=>console.log(`AUTHEN http://127.0.0.1:${port}`));}
