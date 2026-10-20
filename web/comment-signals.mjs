// Explainable text clues, not an account/bot detector or a probability of truth.
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/\[[^\]]{1,15}\]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const bigrams = text => new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2)));
const similar = (a,b) => {
  if(a===b)return true;
  if(Math.min(a.length,b.length)<16||Math.min(a.length,b.length)/Math.max(a.length,b.length)<.82)return false;
  const left=bigrams(a),right=bigrams(b);
  let shared=0;for(const part of left)if(right.has(part))shared++;
  return 2*shared/(left.size+right.size)>=.9;
};
const hasDetails = text => {
  // Details are a separate descriptive bucket, never a certificate of authenticity.
  const signals=[/(?:干皮|油皮|混油|混干|敏感肌|肤质|唇色)/,/(?:用了|使用|试用|涂了|上脸|上唇).{0,8}(?:\d+|一|两|三|半).{0,2}(?:天|周|个月|小时)/,/(?:卡粉|搓泥|拔干|起皮|泛红|刺痛|黏腻|粘腻|脱妆|氧化|假白|斑驳|闷痘|持妆|薄涂|厚涂|滋润|显色)/,/(?:我用|我涂|我试|我的|对我|我觉得|我感觉)/];
  return text.length>=18&&signals.filter(pattern=>pattern.test(text)).length>=2&&!/[?？]/.test(text);
};
export function analyzeComments(reviews=[],options={}) {
  const readCount=reviews.length, seen=new Set(), rows=[];
  let authorReplies=0,duplicates=0;
  for(const review of reviews.slice(0,60)){
    if(!review||typeof review.text!=='string'||!review.text.trim())continue;
    const text=review.text.trim().slice(0,800),identity=review.authorKey||review.author||'';
    const key=review.id?`id:${review.id}`:identity?`body:${identity}:${text}`:null;
    if(key&&seen.has(key)){duplicates++;continue;}if(key)seen.add(key);
    if(review.isAuthor===true){authorReplies++;continue;}
    rows.push({id:String(review.id||`comment-${rows.length+1}`),text,author:review.author||'',identity,normalized:normalize(text),isReply:review.isReply===true});
  }
  const used=new Set(),groups=[];
  for(let i=0;i<rows.length;i++){
    if(used.has(i)||rows[i].normalized.length<12)continue;
    const matches=[i];
    for(let j=i+1;j<rows.length;j++)if(!used.has(j)&&rows[j].normalized.length>=12&&similar(rows[i].normalized,rows[j].normalized))matches.push(j);
    // Require three separately identified commenters; missing names do not prove distinct people.
    if(new Set(matches.map(j=>rows[j].identity).filter(Boolean)).size<3)continue;
    for(const j of matches)used.add(j);
    const exact=matches.every(j=>rows[j].normalized===rows[i].normalized);
    groups.push({kind:exact?'identical':'similar',count:matches.length,reason:exact?'多条评论用了同一句话':'多条评论只换了少数字，像同一套话术',comments:matches.slice(0,4).map(j=>({id:rows[j].id,text:rows[j].text,author:rows[j].author}))});
  }
  const suspicious=used.size, detailRows=rows.filter((r,i)=>!used.has(i)&&hasDetails(r.text));
  const detailed=detailRows.length,total=rows.length,unknown=total-suspicious-detailed;
  const percent=total>=10?Math.round(suspicious/total*100):null;
  return {
    version:1,method:'text-patterns-v1',status:total===0?'unavailable':total<10?'small_sample':'ready',
    readCount,total,replies:rows.filter(r=>r.isReply).length,authorReplies,duplicates,suspicious,detailed,unknown,percent,
    partial:true,limited:options.limited===true,
    summary:total===0?'还没读到可比较的用户评论':total<10?`只读到 ${total} 条，先看原话，不算占比`:suspicious?`${suspicious} 条出现成组重复话术，别只看好评数量`:'暂未发现成组重复话术，仍要结合产品说明看',
    groups:groups.slice(0,8),details:detailRows.slice(0,3).map(r=>({id:r.id,text:r.text,author:r.author})),
  };
}

// The model receives only re-computed counts and real quotes, never client supplied ratios.
export function commentContext(reviews) {
  const result=analyzeComments(reviews);
  return {...result,groups:result.groups.slice(0,4)};
}
