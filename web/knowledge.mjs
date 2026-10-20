import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {productReferences} from './products.mjs';
export const sources=[
 {id:'aad-sunscreen',title:'美国皮肤科学会 · 如何选择防晒',url:'https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-select-sunscreen',match:/防晒|spf|紫外线|sunscreen/i,passage:/SPF|broad.spectrum|water.resistan|reapply|two hours/i},
 {id:'nhs-acne',title:'英国 NHS · 痤疮治疗',url:'https://www.nhs.uk/conditions/acne/treatment/',match:/痘|痤疮|水杨酸|维.a|retinoid|acne/i,passage:/benzoyl|retinoid|weeks|irritation|treatment/i},
 {id:'aad-testing',title:'美国皮肤科学会 · 新护肤品试用',url:'https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products',match:/刺激|敏感|过敏|irritation|allerg|试用|patch test/i,passage:/seven|10 days|reaction|irritat|allerg|twice a day|test/i}
];
const cache=new Map();
export function relevantSources(text){return sources.filter(s=>s.match.test(text)).slice(0,2)}
export async function lookupKnowledge(text,{fetchImpl=fetch,signal}={}){
 const selected=relevantSources(text);
 const results=await Promise.all(selected.map(async s=>{
  if(cache.has(s.id)&&Date.now()-cache.get(s.id).cachedAt<3600000)return cache.get(s.id).value;
  try{
   const r=await fetchImpl(s.url,{headers:{'User-Agent':'AUTHEN/2.0 (beauty information reader)'},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(9000),...(signal?[signal]:[])])});
   if(!r.ok||!(r.headers.get('content-type')||'').includes('text/html')){await r.body?.cancel();return null}
   let bytes=0,chunks=[];for await(const c of r.body){bytes+=c.length;if(bytes>2_000_000)throw Error();chunks.push(c)}
   const $=load(Buffer.concat(chunks).toString('utf8'));$('nav,header,footer,script,style,aside').remove();
   const container=$('main').length?$('main'):$('body');
   const paragraphs=container.find('p,li').map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get().filter(t=>t.length>35&&t.length<1300&&s.passage.test(t));
   const excerpt=[...new Set(paragraphs)].slice(0,7).join('\n').slice(0,6000);
   if(excerpt.length<80)return null;
   const value={id:s.id,title:s.title,url:s.url,excerpt,retrievedAt:new Date().toISOString()};cache.set(s.id,{value,cachedAt:Date.now()});return value;
  }catch{return null}
 }));
 const references=[...results.filter(Boolean),...productReferences(text)];
 // Curated source text is an actual dated YouTube description, not a generated citation.
 if(/3ce|渐变唇|咬唇|唇妆|blotted|gradient lip/i.test(text)){
  try{
   const entries=JSON.parse(await readFile(new URL('../Research/social-v3/manifest.json',import.meta.url),'utf8'));
   const item=entries.find(e=>e.id==='zg5xAafJ080');
   if(item)references.push({id:'youtube-'+item.id,title:item.author+' · 3CE 渐变唇教程（视频简介，'+item.publishedAt+'）',url:item.sourceURL,excerpt:item.description,retrievedAt:item.retrievedAt});
  }catch{}
 }
 return {references,attempted:selected.length};
}
