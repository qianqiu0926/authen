import test from 'node:test';import assert from 'node:assert/strict';
import {lookupKnowledge,relevantSources} from '../knowledge.mjs';import {normalizeResult,validateInput} from '../deepseek.mjs';
test('retrieval selects only fixed official URLs; failure is empty, not fabricated evidence',async()=>{
 assert.equal(relevantSources('普通口红').length,0);
 const result=await lookupKnowledge('防晒spf30',{fetchImpl:async url=>{assert.ok(url.startsWith('https://www.aad.org/'));return new Response('blocked',{status:403})}});
 assert.equal(result.attempted,1);assert.deepEqual(result.references,[]);
});
test('a citation must quote an actually retrieved passage, and cannot provide its own URL',()=>{
 const source={id:'official',url:'https://example.org/verified',title:'已读取的资料',excerpt:'A sunscreen with SPF 30 or higher is recommended.',retrievedAt:'2026-10-15'};
 const input=validateInput({kind:'text',text:'防晒SPF怎么选',images:[],lines:[]});
 const raw={summary:'建议参考SPF30或更高。',next:'查看产品标识。',findings:[],citations:[{sourceId:'official',quote:source.excerpt,url:'https://invented.invalid'}]};
 const r=normalizeResult(raw,input,'deepseek-flash',[source]);assert.equal(r.references.length,1);assert.equal(r.references[0].url,source.url);assert.equal(r.verdict,'unclear');
 for(const citation of [{sourceId:'unknown',quote:source.excerpt},{sourceId:'official',quote:'invented advice that is absent'}]){assert.equal(normalizeResult({...raw,citations:[citation]},input,'deepseek-flash',[source]).references.length,0)}
});

test('numeric cards preserve original values instead of invented certainty',()=>{
 const input=validateInput({kind:'text',text:'标签写2%，文案写10%。',images:[],lines:[]});
 const raw={summary:'数字不一致。',next:'确认版本。',findings:[],numbers:[{label:'标签',value:'2%',quote:'标签写2%'},{label:'真实概率',value:'99%',quote:'标签写2%'}]};
 const r=normalizeResult(raw,input,'deepseek-flash');assert.deepEqual(r.numbers,[{label:'标签',value:'2%',quote:'标签写2%'}]);
});
