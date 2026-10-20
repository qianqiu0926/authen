import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,normalizeResult,reviewWithDeepSeek} from '../deepseek.mjs';
const config={key:'unit-test-not-a-real-key',model:'deepseek-flash'};
const input={kind:'text',text:'商家说100%无刺激，但没有给出资料。',scope:'提交的文字',lines:[],images:[]};
const reply={summary:'这项保证需要依据。',next:'补充产品说明。',findings:[{status:'needs_evidence',quote:'100%无刺激',finding:'缺少支持依据',why:'提交内容没有给出适用条件。'}]};
test('official endpoint and credentials stay in server headers; tracking metadata is not sent',async()=>{
 const r=await reviewWithDeepSeek(input,{config,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(opts.headers.Authorization,'Bearer '+config.key);
  assert.ok(!opts.body.includes(config.key));assert.ok(!opts.body.includes('tracking_id'));
  assert.equal(JSON.parse(opts.body).response_format.type,'json_object');
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]});
 }});
 assert.equal(r.verdict,'flagged');assert.ok(!JSON.stringify(r).includes(config.key));assert.equal(r.checks.imageForensics,'not_connected');
});
test('unknown quotes, model URLs, boxes and claimed supported verdict are not trusted',()=>{
 const r=normalizeResult({...reply,verdict:'supported',findings:[{...reply.findings[0],quote:'并不存在的原话',box:[0,0,1,1],sourceURL:'https://invented.invalid'}]},validateInput(input),'deepseek-flash');
 assert.equal(r.verdict,'unclear');assert.deepEqual(r.evidence,[]);
});
test('only positions supplied by the reader can become evidence coordinates',()=>{
 const im='data:image/png;base64,iVBORw0KGgo=';
 const body=validateInput({...input,images:[im],lines:[{text:'100%无刺激',imageIndex:0,seconds:12,box:[.1,.2,.3,.1]}]});
 const r=normalizeResult({...reply,findings:[{...reply.findings[0],box:[0,0,1,1],imageIndex:0,seconds:99}]},body,'deepseek-flash');
 assert.equal(r.evidence[0].seconds,12);assert.deepEqual(r.evidence[0].box,[.1,.2,.3,.1]);
});
test('upstream errors never return upstream secrets or request bodies',async()=>{
 await assert.rejects(reviewWithDeepSeek(input,{config,fetchImpl:async()=>new Response('provider included '+config.key,{status:401})}),e=>e.status===502&&!e.message.includes(config.key)&&e.message.includes('验证失败'));
});
test('truncated, empty or malformed completions are rejected',async()=>{
 for(const choice of [{finish_reason:'length',message:{content:JSON.stringify(reply)}},{finish_reason:'stop',message:{content:''}},{finish_reason:'stop',message:{content:'{}'}}]){
  await assert.rejects(reviewWithDeepSeek(input,{config,fetchImpl:async()=>Response.json({choices:[choice]})}),e=>e.status===502);
 }
});
test('rejects URLs used as image inputs and out-of-range locations',()=>{
 assert.throws(()=>validateInput({...input,images:['http://127.0.0.1/private']}));
 assert.throws(()=>validateInput({...input,lines:[{text:'100%无刺激',imageIndex:99}]}));
 assert.throws(()=>validateInput({...input,text:'a'.repeat(16001)}));
});
test('neutral observations do not produce a suspicious verdict',()=>{
 const result=normalizeResult({...reply,findings:[{...reply.findings[0],status:'observation'}]},validateInput(input),'deepseek-flash');
 assert.equal(result.verdict,'unclear');
});

test('advice remains concise without fabricated suspicious findings',()=>{
 const r=normalizeResult({summary:'把颜色集中在唇内侧，向外晕开。',next:'',answerKind:'advice',tips:['先薄涂在唇内侧。','轻抿，再向外晕开。'],findings:[]},validateInput({...input,text:'3CE口红怎么涂更好看？'}),'deepseek-flash');
 assert.deepEqual(r.evidence,[]);assert.equal(r.answerKind,'advice');assert.equal(r.tips.length,2);assert.equal(r.next,'');assert.deepEqual(r.references,[]);
});
test('content classification is constrained to supported types and kept separate from verdict',()=>{
 const r=normalizeResult({...reply,contentType:'reviews',findings:[]},validateInput(input),'deepseek-flash');assert.equal(r.contentType,'reviews');assert.equal(r.verdict,'unclear');
 assert.equal(normalizeResult({...reply,contentType:'proven-fake'},validateInput(input),'deepseek-flash').contentType,'other');
});
