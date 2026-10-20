import { earn, type AppState } from '../model.ts';
import { nourish } from '../farm.ts';

export type Claim = { id: string; text: string; kind: string; art: string; cut: boolean; why: string };
// Authored teaching examples, not labels for real posts or AI detector output.
export const claims: Claim[] = [
  {id:'white',text:'三天永久白两度',kind:'精华种草',art:'perfume',cut:true,why:'“三天”“永久”说得太满，不能当成护肤效果保证。'},
  {id:'pore',text:'毛孔能彻底消失',kind:'底妆种草',art:'compact',cut:true,why:'毛孔是正常皮肤结构。妆后看着细腻，不等于毛孔消失。'},
  {id:'dose',text:'瓶身2%\n笔记写成10%',kind:'成分对照',art:'perfume',cut:true,why:'同一瓶的浓度写错了，不能按笔记里的 10% 来买。'},
  {id:'edited',text:'P掉痘痘\n却说是素颜',kind:'前后对比',art:'compact',cut:true,why:'修掉痘痘的照片不能用来证明产品祛痘效果。'},
  {id:'ai-photo',text:'AI画的试色\n冒充上唇实拍',kind:'口红试色',art:'lipstick',cut:true,why:'AI 试色可以做灵感图，但不能冒充真实上唇效果。'},
  {id:'review',text:'没用过也写\n“亲测有效”',kind:'买家评论',art:'icon-social',cut:true,why:'没有用过却写亲测，是在编造使用经历。'},
  {id:'sun',text:'防晒涂一次\n能管一整周',kind:'防晒种草',art:'perfume',cut:true,why:'防晒会随出汗、摩擦等减弱，不能保证一次管一周。'},
  {id:'crop',text:'“可能改善”\n剪成“包治好”',kind:'视频口播',art:'icon-video',cut:true,why:'剪掉限制条件，意思就变了。护肤效果更不能说成包治。'},
  {id:'ad',text:'收了推广费\n却说绝无合作',kind:'种草笔记',art:'icon-notebook',cut:true,why:'广告合作本身没问题，隐瞒合作却装成纯自用才有问题。'},
  {id:'lighting',text:'换灯光变白\n说是精华效果',kind:'前后对比',art:'perfume',cut:true,why:'灯光就能改变肤色，换光拍的对比图不能单独证明效果。'},
  {id:'all',text:'所有敏感肌\n用了都不过敏',kind:'护肤种草',art:'compact',cut:true,why:'每个人的过敏原不同，“所有人都不过敏”不能保证。'},
  {id:'audio',text:'拼接医生录音\n冒充产品推荐',kind:'音频推荐',art:'icon-audio',cut:true,why:'拼接出来的推荐不代表医生原本的意思。'},
  {id:'filter',text:'试色注明了\n“开了滤镜”',kind:'口红试色',art:'lipstick',cut:false,why:'说明用了滤镜是合理做法；实际色号仍要结合自然光试色。'},
  {id:'ai-label',text:'AI妆容图\n标为灵感参考',kind:'妆容分享',art:'compact',cut:false,why:'AI 图标明用途，可以用作妆容灵感，不等于真实试妆。'},
  {id:'skin',text:'先说自己肤质\n再聊使用感',kind:'护肤分享',art:'perfume',cut:false,why:'交代肤质有助于理解体验，但别人的感受不一定适合你。'},
  {id:'ad-label',text:'这篇推广\n已注明合作',kind:'种草笔记',art:'icon-notebook',cut:false,why:'公开说明合作是合理做法；效果说法仍需要依据。'},
  {id:'patch',text:'新精华先做\n小范围试用',kind:'护肤分享',art:'perfume',cut:false,why:'小范围试用更谨慎，但也不能保证之后一定不过敏。'},
  {id:'light-label',text:'试色注明\n“自然光拍摄”',kind:'口红试色',art:'lipstick',cut:false,why:'注明拍摄光线有助于参考，屏幕与唇色仍会影响观感。'},
  {id:'experience',text:'只说个人感受\n不保证都有效',kind:'买家评论',art:'icon-social',cut:false,why:'把个人体验和效果保证分开，是合理的分享方式。'},
  {id:'texture',text:'保留皮肤纹理\n说明没有磨皮',kind:'底妆分享',art:'compact',cut:false,why:'说明磨皮情况有帮助，但这句话本身不是图片真实的证明。'},
  {id:'correct',text:'浓度写错了\n重新更正为2%',kind:'成分笔记',art:'icon-notebook',cut:false,why:'发现错误后明确更正，能帮助读者避开错误信息。'},
  {id:'lip',text:'同一支口红\n唇色不同有色差',kind:'口红试色',art:'lipstick',cut:false,why:'底唇颜色会影响上唇效果，试色出现差别不一定是造假。'},
];
export const WIDTH = 360, HEIGHT = 400, TARGET_W = 140, TARGET_H = 134;
export const settings = {
  easy: { seconds:60, lifetime:5.8, interval:5.1, title:'轻松切' },
  rush: { seconds:45, lifetime:4.5, interval:3.9, title:'手速局' },
};
export type Speed = keyof typeof settings;
export type Point = {x:number;y:number};
export type Target = { id:number; claim:Claim; lane:number; born:number; x:number; y:number; angle:number; drift:number; cutAt?:number; cutAngle?:number; points?:number };
export const CUT_SECONDS=.85;
export type Review = {claim:Claim; action:'cut'|'miss'; correct:boolean};
export type Run = {
  id:string; speed:Speed; elapsed:number; nextWave:number; deck:Claim[]; cursor:number;
  targets:Target[]; score:number; combo:number; bestCombo:number; hearts:number; hits:number;
  reviews:Review[]; ended:boolean;
};
export type Result = Pick<Run,'id'|'score'|'bestCombo'|'hits'|'reviews'> & {passed:boolean};
function shuffle<T>(items:T[],random:()=>number) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function createRun(id:string,speed:Speed,random=Math.random):Run {
  return {id,speed,elapsed:0,nextWave:0.35,deck:shuffle(claims,random),cursor:0,targets:[],score:0,combo:0,bestCombo:0,hearts:3,hits:0,reviews:[],ended:false};
}
export function targetPosition(target:Target,elapsed:number,lifetime:number,still=false):Point {
  const age=elapsed-target.born, t=Math.max(0,Math.min(1,age/lifetime));
  return {x:90+target.lane*180+(still?0:target.drift*Math.sin(t*Math.PI)),y:still?195:HEIGHT+80-4*(HEIGHT-45)*t*(1-t)};
}
export function advance(run:Run,seconds:number,still=false) {
  if(run.ended||!Number.isFinite(seconds)||seconds<=0)return;
  const config=settings[run.speed];
  run.elapsed=Math.min(config.seconds,run.elapsed+Math.min(seconds,0.1));
  if(run.elapsed>=run.nextWave && run.elapsed+config.lifetime+0.4<config.seconds){
    for(let lane=0;lane<2;lane++){
      const id=run.cursor++, claim=run.deck[id%run.deck.length];
      run.targets.push({id,claim,lane,born:run.elapsed+lane*0.25,x:90+lane*180,y:HEIGHT+80,angle:lane?6:-6,drift:Math.sin(id*2.3)*8});
    }
    // Stationary accessibility mode must never stack two claims in one lane.
    run.nextWave=run.elapsed+(still?config.lifetime+0.35:config.interval);
  }
  run.targets=run.targets.filter(target=>{
    if(target.cutAt!==undefined)return run.elapsed-target.cutAt<CUT_SECONDS;
    if(run.elapsed-target.born>config.lifetime){
      if(target.claim.cut){run.combo=0;run.reviews.push({claim:target.claim,action:'miss',correct:false});}
      return false;
    }
    Object.assign(target,targetPosition(target,run.elapsed,config.lifetime,still));
    target.angle=still?0:target.lane?6:-6;
    return true;
  });
  if(run.elapsed>=config.seconds)run.ended=true;
}
// Swept segment vs inset card bounds: quick swipes cannot skip a card between frames.
function boundsIntersection(a:Point,b:Point,target:Point,halfWidth:number,halfHeight:number) {
  if(!Number.isFinite(a.x+a.y+b.x+b.y+target.x+target.y))return null;
  let low=0, high=1;
  for(const [start,delta,center,half] of [[a.x,b.x-a.x,target.x,halfWidth],[a.y,b.y-a.y,target.y,halfHeight]]){
    if(Math.abs(delta)<0.0001){if(Math.abs(start-center)>half)return null;continue;}
    const first=(center-half-start)/delta, last=(center+half-start)/delta;
    low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last));
    if(low>high)return null;
  }
  return {low,high};
}
function intersectionAt(a:Point,b:Point,target:Point&{angle?:number}) {
  const angle=-(target.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const local=(p:Point)=>({x:(p.x-target.x)*c-(p.y-target.y)*s,y:(p.x-target.x)*s+(p.y-target.y)*c});
  return boundsIntersection(local(a),local(b),{x:0,y:0},TARGET_W/2-9,TARGET_H/2-9)?.low??null;
}
export function intersects(a:Point,b:Point,target:Point&{angle?:number}) {
  return intersectionAt(a,b,target)!==null;
}
export function cut(run:Run,a:Point,b:Point):Target[] {
  if(run.ended)return [];
  const visible=boundsIntersection(a,b,{x:WIDTH/2,y:HEIGHT/2},WIDTH/2,HEIGHT/2);
  if(!visible)return [];
  const start={x:a.x+(b.x-a.x)*visible.low,y:a.y+(b.y-a.y)*visible.low};
  const end={x:a.x+(b.x-a.x)*visible.high,y:a.y+(b.y-a.y)*visible.high};
  const direction=Math.hypot(b.x-a.x,b.y-a.y)>4?Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI:-24;
  const hits:Target[]=[];
  // The gesture meets cards in spatial order, not their creation order.
  const candidates=run.targets.filter(t=>t.cutAt===undefined&&t.born<=run.elapsed).map(target=>({target,at:intersectionAt(start,end,target)})).filter(v=>v.at!==null).sort((a,b)=>a.at!-b.at!);
  for(const {target} of candidates){
    target.cutAt=run.elapsed;
    target.cutAngle=direction;
    if(target.claim.cut){
      run.combo++;run.hits++;target.points=10+Math.min(10,(run.combo-1)*2);run.score+=target.points;
      run.bestCombo=Math.max(run.bestCombo,run.combo);
    } else {run.hearts--;run.combo=0;target.points=0;}
    run.reviews.push({claim:target.claim,action:'cut',correct:target.claim.cut});hits.push(target);
    if(run.hearts<=0){run.ended=true;break;}
  }
  return hits;
}
export function resultOf(run:Run):Result {
  return {id:run.id,score:run.score,bestCombo:run.bestCombo,hits:run.hits,reviews:[...run.reviews],passed:run.ended&&run.hearts>0&&run.score>=80&&run.hits>=6};
}
export function settle(state:AppState,result:Result,now=Date.now()):AppState {
  const next={...state,slicerBest:Math.max(state.slicerBest||0,result.score)};
  if(!result.passed)return next;
  return nourish({...next,social:earn(next.social,'slicer-v1','真假切切看通关')},'learn',`slicer-${result.id}`,now);
}
