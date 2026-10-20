import {HEIGHT, WIDTH, type Claim, type Point, type Target} from './sliceEngine.ts';

export const EFFECT_SECONDS=1.25, TRAIL_SECONDS=.3;
export type TrailPoint=Point&{at:number};
export type Impact=Point&{id:number;at:number;angle:number;good:boolean;art:string;points:number;combo:number;side:number};
export type Sweep={count:number;points:number;lastAt:number;spoiled:boolean};
export const newSweep=():Sweep=>({count:0,points:0,lastAt:-Infinity,spoiled:false});
export function cosmeticOf(claim:Claim) {
  if(['perfume','compact','lipstick','mascara'].includes(claim.art))return claim.art;
  return ['lipstick','compact','perfume','mascara'][Array.from(claim.id).reduce((n,c)=>n+c.charCodeAt(0),0)%4];
}
export function recordSweep(sweep:Sweep,hits:Target[],at:number) {
  if(!hits.length)return sweep;
  const next=at-sweep.lastAt>.55?newSweep():{...sweep};
  for(const hit of hits){
    if(!hit.claim.cut)next.spoiled=true;
    else {next.count++;next.points+=hit.points||0;}
  }
  next.lastAt=at;
  return next;
}
export function cheer(combo:number,sweep:Sweep,good:boolean) {
  if(!good||sweep.spoiled)return {title:'这句没问题，留给它',detail:'别急，先看清再出手',tone:'wrong'};
  if(sweep.count>1)return {title:sweep.count===2?'一刀双切！':`一刀 ${sweep.count} 连切！`,detail:`两眼有光，出手漂亮 · +${sweep.points}`,tone:'double'};
  return {title:combo>=8?'眼光开挂了！':combo>=5?'手感拉满！':combo>=3?'越切越准！':combo===2?'漂亮，连上了！':'切得漂亮！',detail:combo>1?`${combo} 连击 · 继续保持`:'夸张话术，拿下',tone:combo>=5?'fever':'right'};
}
export function impactOf(target:Target,at:number,combo:number):Impact {
  return {id:target.id,at,x:target.x,y:target.y,angle:target.cutAngle||0,good:target.claim.cut,art:cosmeticOf(target.claim),points:target.points||0,combo,side:target.lane===0?-1:1};
}
export function flight(impact:Impact,age:number) {
  const t=Math.max(0,Math.min(1,age/EFFECT_SECONDS));
  const destination=WIDTH/2+impact.side*102;
  return {x:impact.x-impact.side*Math.sin(t*Math.PI)*38+(destination-impact.x)*t*t,
    y:impact.y-18-Math.sin(t*Math.PI)*92-(impact.y-45)*t,
    scale:t<.18?.65+t/.18*.95:1.6-(t-.18)/.82*1.3,
    rotation:impact.side*(t*220-12),opacity:Math.min(1,(1-t)*5)};
}
// Split in card-local coordinates, along the player's actual swipe direction.
export function halfPolygon(angle:number,side:number) {
  const rad=angle*Math.PI/180,n={x:-Math.sin(rad),y:Math.cos(rad)},sign=side?1:-1;
  const points=[{x:-70,y:-67},{x:70,y:-67},{x:70,y:67},{x:-70,y:67}],out:Point[]=[];
  const distance=(p:Point)=>sign*(p.x*n.x+p.y*n.y)-1.2;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  return `polygon(${out.map(p=>`${((p.x+70)/140*100).toFixed(2)}% ${((p.y+67)/134*100).toFixed(2)}%`).join(',')})`;
}
export function halfMotion(angle:number,side:number,age:number) {
  const rad=angle*Math.PI/180,sign=side?1:-1;
  return `translate(${-Math.sin(rad)*sign*age*135}px,${Math.cos(rad)*sign*age*135+age*age*180}px) rotate(${sign*age*65}deg)`;
}
export function screenPoint(client:Point,rect:{left:number;top:number;width:number;height:number}):Point|null {
  if(rect.width<=0||rect.height<=0||!Number.isFinite(client.x+client.y))return null;
  return {x:(client.x-rect.left)/rect.width*WIDTH,y:(client.y-rect.top)/rect.height*HEIGHT};
}
