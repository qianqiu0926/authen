import test from 'node:test';import assert from 'node:assert/strict';import {resolvePublic} from '../public-page.mjs';
test('VPN synthetic DNS is resolved through verified public records',async()=>{
 const result=await resolvePublic('https://beauty.example/article',{lookupImpl:async()=>[{address:'198.18.0.2',family:4}],fetchImpl:async url=>{assert.equal(url.hostname,'dns.google');assert.equal(url.searchParams.get('name'),'beauty.example');return Response.json({Status:0,Answer:[{type:1,data:'8.8.8.8'}]})}});
 assert.equal(result.address.address,'8.8.8.8');assert.equal(result.url.hostname,'beauty.example');
});
test('private or unverified DNS cannot turn into an allowed destination',async()=>{
 for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'198.18.0.2',family:4}]]){
  await assert.rejects(resolvePublic('https://beauty.example',{lookupImpl:async()=>addresses,fetchImpl:async()=>Response.json({Status:0,Answer:[{type:1,data:'10.0.0.1'}]})}));
 }
 await assert.rejects(resolvePublic('http://198.18.0.2',{lookupImpl:async()=>[{address:'198.18.0.2',family:4}]}));
});

test('mobile share reader uses public mobile pages only for actual XHS domains',async()=>{
 const {pageHeaders}=await import('../public-page.mjs');
 for(const domain of ['xhslink.cn','xhslink.com','www.xiaohongshu.com'])assert.match(pageHeaders(new URL('https://'+domain+'/o/share'))['User-Agent'],/iPhone/);
 assert.doesNotMatch(pageHeaders(new URL('https://xiaohongshu.com.evil.example/'))['User-Agent'],/iPhone/);
 assert.equal(pageHeaders(new URL('https://xhslink.cn/')).Cookie,undefined);
});
