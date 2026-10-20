import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,matchProducts,reportProducts,productReferences,productEntry} from '../products.mjs';
import {lookupKnowledge} from '../knowledge.mjs';

test('current explicit product matches across transcript, title and OCR text',()=>{
  for(const text of ['最近用全新第六代赫莲娜绿宝瓶精华','口播：HR赫莲娜第6代绿宝瓶精华怎么样？','兰蔻超修小黑瓶精华']) {
    const matches=matchProducts(text);assert.equal(matches.length,1);assert.equal(matches[0].needsConfirm,false);assert.equal(matches[0].kind,'product');
  }
});
test('brand mention opens its site, not an invented SKU or an input seller',()=>{
  const r=reportProducts({original:'【自营】YSL/圣罗兰粉皮革气垫 https://untrusted.example/buy'});
  assert.equal(r.length,1);assert.equal(r[0].id,'brand:ysl');assert.equal(r[0].product,undefined);assert.equal(r[0].brand.url,'https://www.yslbeautycn.com/');assert.match(r[0].quote,/粉皮革气垫/);
});
test('nickname, missing edition and other brand need individual confirmation',()=>{
  for(const text of ['绿宝瓶','赫莲娜第五代绿宝瓶精华','兰蔻小黑瓶','雅诗兰黛小黑瓶','赫莲娜黑绷带']) {
    const r=matchProducts(text);assert.ok(r.length);assert.equal(r[0].needsConfirm,true);assert.equal(productReferences(text).length,0);
  }
});
test('unrelated or other brands do not gain a sales recommendation',()=>{
  for(const text of ['雅诗兰黛小棕瓶','普通保湿霜','香奈儿口红','小红书链接','欧莱雅集团旗下有哪些品牌','notcerave保湿霜','https://www.helenarubinstein.cn/']) assert.deepEqual(matchProducts(text),[],text);
});
test('eye cream and face serum are not conflated',()=>{
  for(const text of ['兰蔻超修小黑瓶眼霜','赫莲娜绿宝瓶眼霜','赫莲娜绿宝瓶新肌水']) assert.ok(matchProducts(text).every(m=>m.kind==='brand'));
});
test('products appearing only in parsed comments are not recommended as the post product',()=>{
  assert.deepEqual(matchProducts('今天聊粉底\n评价1（用户）：第六代赫莲娜绿宝瓶精华不错'),[]);
  assert.deepEqual(matchProducts('YSL粉皮革气垫\n评价1：CeraVe保湿霜'),[{id:'brand:ysl',quote:'YSL粉皮革气垫',needsConfirm:false,kind:'brand'}]);
});
test('supports multiple products without changing the verification conclusion',()=>{
  const report={original:'第六代赫莲娜绿宝瓶精华。兰蔻超修小黑瓶精华',verdict:'flagged',summary:'这项承诺还缺依据',evidence:[{text:'保证治好'}]};
  const before=structuredClone(report);assert.equal(reportProducts(report).filter(m=>m.kind==='product').length,2);assert.deepEqual(report,before);
});
test('confirming or hiding one item does not confirm other candidates',()=>{
  const r={original:'绿宝瓶和小黑瓶',productConfirmed:['hr-green']};
  assert.equal(reportProducts(r).find(m=>m.id==='hr-green').needsConfirm,false);
  assert.equal(reportProducts(r).find(m=>m.id==='lancome-genifique').needsConfirm,true);
  assert.equal(reportProducts({...r,productChoices:['lancome-genifique']})[0].needsConfirm,true);
});
test('corrections and hiding persist through serialized saved reports',()=>{
  const r={original:'第六代赫莲娜绿宝瓶精华',saved:true,productChoices:['brand:ysl'],productConfirmed:['brand:ysl']};
  assert.equal(reportProducts(JSON.parse(JSON.stringify(r)))[0].brand.id,'ysl');
  assert.deepEqual(reportProducts({...r,productChoices:[]}),[]);
  assert.deepEqual(reportProducts({...r,productChoices:['https://evil.example','invalid']}),[]);
});
test('sample materials never show shopping regardless of saved choices',()=>{
  assert.deepEqual(matchProducts('赫莲娜第六代绿宝瓶',{sample:true}),[]);
  assert.deepEqual(reportProducts({original:'赫莲娜第六代绿宝瓶',sample:true,productChoices:['hr-green']}),[]);
});
test('brand reference is labeled and contains no purchase link',async()=>{
  const r=await lookupKnowledge('第六代赫莲娜绿宝瓶精华');
  assert.equal(r.references.length,1);assert.equal(r.references[0].sourceType,'brand');
  assert.match(r.references[0].title,/官网说明/);assert.match(r.references[0].url,/helenarubinstein.cn\/product/);assert.doesNotMatch(r.references[0].excerpt,/tmall|购买|下单/);
});
test('all catalog destinations are fixed https pages with declared provenance',()=>{
  const allowed=new Set(['www.helenarubinstein.cn','www.lancome.com.cn','www.lorealparis.com.cn','www.yslbeautycn.com','www.cerave.com','detail.tmall.com']);
  for(const e of [...catalog.brands,...catalog.products]) for(const key of ['url','channels','buyURL','buySource']) if(e[key]){const u=new URL(e[key]);assert.equal(u.protocol,'https:');assert.ok(allowed.has(u.hostname));assert.equal(u.username,'');}
  for(const p of catalog.products){assert.ok(productEntry(p.id));if(p.buyURL)assert.ok(p.buySource);}
});
