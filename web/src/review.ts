import type {Material,Line,Evidence,Report} from './types';
export function review(m:Material,text:string,lines:Line[],scope:string,images:string[]):Report {
  let evidence:Evidence[]=[];
  let verdict:Report['verdict']='unclear';
  if(m.sample) {
    verdict=m.sample;
    const common={source:'示例商品资料 · AUTHEN演示库',excerpt:'演示保湿乳：水、甘油等；用途：保湿。由团队编写，不对应在售商品。'};
    evidence=verdict==='flagged' ? [
      {text:'7天变白',finding:'资料没有支持这项承诺',why:'示例商品资料只说明保湿，没有写7天变白。',...common,box:[.07,.19,.78,.11],imageIndex:0},
      {text:'100%无刺激',finding:'这句话说得太满',why:'皮肤反应因人而异，这份内容没有给出支持“100%”的依据。',...common,box:[.07,.30,.83,.11],imageIndex:0}
    ] : verdict==='supported' ? [{text:'含甘油，帮助保湿',finding:'这项说法对得上',why:'示例商品资料列有甘油，用途是保湿；笔记的说法与资料一致。',...common}]
    : [{text:'这个真的好用吗？',finding:'还没认出是哪款商品',why:'补充商品名称或一张清楚的包装图，再一起看看。',source:'示例图片',excerpt:'此例展示资料不足时的处理方式。'}];
    scope='示例素材和团队编写的商品资料，不对应真实品牌或在售商品。';
  } else {
    const rules:[RegExp,string,string][]=[
      [/([0-9一二三四五六七八九十两]+\s*[天日周].{0,8}(?:美白|变白|祛斑|去皱|祛痘))/gi,'这个时间承诺，需要依据','仅凭这段内容，不能确定人人都能在这个时间内达到所说的效果。再核对功效说明和使用条件。'],
      [/(百分之百|100%|绝对|永久|零刺激|无副作用|包治|根治|最有效)/gi,'这句话说得很满','这句话没有说明适用的人群和条件，建议向品牌确认具体依据。'],
      [/(代替医美|替代医美|治疗皮炎|治疗湿疹|修复DNA)/gi,'这项说法，值得再确认','涉及治疗或较强的效果承诺，先核对商品用途与公开资料。']
    ];
    for(const [pattern,finding,why] of rules) for(const match of [...text.matchAll(pattern)].slice(0,3)) {
      if(evidence.some(e=>e.text===match[0]))continue;
      const line=lines.find(l=>l.text.includes(match[0]));
      evidence.push({...line,text:match[0],finding,why,source:'你提交的内容',excerpt:'尚未附上支持这句话的商品资料。',sourceURL:m.url});
    }
    if(m.kind==='text'||m.kind==='comments') {
      const counts=new Map<string,number>();
      text.split('\n').map(t=>t.trim()).filter(t=>t.length>=8).forEach(t=>counts.set(t,(counts.get(t)||0)+1));
      const repeated=[...counts].sort((a,b)=>b[1]-a[1]).find(([,n])=>n>=3);
      if(repeated)evidence.push({text:repeated[0],finding:`这句话重复出现${repeated[1]}次`,why:'相同文字可能来自复制或统一话术。这里只检查你提供的内容，不能据此确定账号身份。',source:'本次提交的文字',excerpt:'重复文字只作为进一步核对的线索。'});
    }
    if(evidence.length)verdict='flagged';
    else evidence.push({text:text.slice(0,60)||'这份素材',finding:text?'目前还缺参考资料':'还需要更清楚的内容',why:text?'没有发现明显的绝对说法，但不代表内容已经证实。补充商品名称和官方说明再核对。':'没有读到足够清楚的文字。补充商品名称、相关说法或清晰原图。',source:'本次材料',excerpt:scope});
  }
  return {id:typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),date:new Date().toISOString(),kind:m.kind,title:m.sample?'美妆笔记 · 示例':'本次提交的内容',verdict,summary:verdict==='flagged'?'别急，这几处先看看。':verdict==='supported'?'这项说法，有资料对应。':'再补一点，查得更清楚。',original:text,evidence,next:verdict==='supported'?'资料只说明这项说法，具体体验因人而异。':'补充清晰原图或商品说明，再看一遍。',scope:scope+(m.sample?'':'本次为本机初查。'),sample:!!m.sample,images,video:m.video,audio:m.audio,sourceURL:m.url};
}
