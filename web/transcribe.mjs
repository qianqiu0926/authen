import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {ReviewError} from './deepseek.mjs';
const run=promisify(execFile),project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');let active=false;
export async function transcribeAudio(body,{signal}={}){
 if(typeof body?.audioBase64!=='string'||body.audioBase64.length>16_000_000||!body.audioBase64.length||(body.audioBase64.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.audioBase64)))throw new ReviewError(400,'音频无法读取或过大。');
 if(active)throw new ReviewError(429,'上一段音频还在读取，请稍后再试。');
 const python=process.env.AUTHEN_PYTHON||path.join(project,'.venv-audio/bin/python');try{await access(python)}catch{throw new ReviewError(503,'语音服务暂不可用。')}
 active=true;let dir;
 try{
  dir=await mkdtemp(path.join(os.tmpdir(),'authen-audio-'));const file=path.join(dir,'input.audio');await writeFile(file,Buffer.from(body.audioBase64,'base64'),{mode:0o600});
  const {stdout}=await run(python,[path.join(project,'services/transcribe.py'),file],{signal,timeout:210000,maxBuffer:2_000_000});const result=JSON.parse(stdout);
  if(!result.text?.trim()||!Array.isArray(result.segments))throw new ReviewError(422,'没有听清有效人声，试试更清楚的录音。');
  return {text:result.text,segments:result.segments,engine:'faster-whisper/small · 语音转文字'};
 }catch(e){if(e instanceof ReviewError)throw e;throw new ReviewError(422,'这段声音没有读完，请选择60秒以内的清晰音频。')}
 finally{if(dir)await rm(dir,{recursive:true,force:true});active=false}
}
