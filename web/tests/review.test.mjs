import test from 'node:test';import assert from 'node:assert/strict';import {review} from '../src/review.ts';
const m=(kind='text',text='')=>({kind,text,images:[]});
test('ordinary text is not certified true',()=>{const r=review(m(),'这瓶乳液很滋润。',[],'文字',[]);assert.equal(r.verdict,'unclear');assert.equal(r.sample,false)});
test('evidence preserves input text and position',()=>{const r=review(m('image'),'7天变白，100%无刺激。',[{text:'7天变白',box:[.1,.2,.3,.1],imageIndex:0}],'图片',[]);assert.equal(r.verdict,'flagged');assert.equal(r.evidence[0].text,'7天变白');assert.deepEqual(r.evidence[0].box,[.1,.2,.3,.1]);assert.equal(r.evidence[0].imageIndex,0)});
test('repeated frames are not repeated comments',()=>{const text=Array(4).fill('这瓶乳液很滋润而且挺舒服').join('\n');assert.equal(review(m('video'),text,[],'关键帧',[]).verdict,'unclear');assert.equal(review(m('text'),text,[],'评论',[]).verdict,'flagged');assert.equal(review(m('comments'),text,[],'评论',[]).verdict,'flagged')});
test('samples disclose fictional sources',()=>{const r=review({...m(),sample:'supported'},'含甘油',[],'',[]);assert.equal(r.verdict,'supported');assert.equal(r.sample,true);assert.match(r.scope,/不对应真实品牌/)});
