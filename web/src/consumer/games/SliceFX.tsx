import {useLayoutEffect,useRef} from 'react';
import {art} from '../ui';
import {HEIGHT,WIDTH} from './sliceEngine';
import {flight,TRAIL_SECONDS,type Impact,type TrailPoint} from './sliceEffects';

function star(c:CanvasRenderingContext2D,x:number,y:number,r:number,angle:number) {
  c.save();c.translate(x,y);c.rotate(angle);c.beginPath();
  for(let i=0;i<8;i++){const a=i*Math.PI/4,d=i%2?r*.25:r;i?c.lineTo(Math.cos(a)*d,Math.sin(a)*d):c.moveTo(Math.cos(a)*d,Math.sin(a)*d);}
  c.closePath();c.fill();c.restore();
}
export default function SliceFX({time,trail,impacts,still,combo}:{time:number;trail:TrailPoint[];impacts:Impact[];still:boolean;combo:number}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useLayoutEffect(()=>{
    const el=canvas.current;if(!el)return;
    const bounds=el.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(bounds.width*dpr)),height=Math.max(1,Math.round(bounds.height*dpr));
    if(el.width!==width||el.height!==height){el.width=width;el.height=height;}
    const c=el.getContext('2d');if(!c)return;
    c.setTransform(width/WIDTH,0,0,height/HEIGHT,0,0);c.clearRect(0,0,WIDTH,HEIGHT);
    if(still)return;
    const hot=combo>=5;
    for(const hit of impacts){
      const age=time-hit.at,t=Math.min(1,age/1.25);if(age<0||t>=1)continue;
      const color=hit.good?'255,206,126':'255,135,151';
      if(age<.5){
        const alpha=(1-age/.5)*.55,gradient=c.createRadialGradient(hit.x,hit.y,0,hit.x,hit.y,90+age*110);
        gradient.addColorStop(0,`rgba(${color},${alpha})`);gradient.addColorStop(1,`rgba(${color},0)`);
        c.fillStyle=gradient;c.fillRect(hit.x-150,hit.y-150,300,300);
        c.strokeStyle=`rgba(${color},${1-age/.5})`;c.lineWidth=2.5*(1-age/.5);c.beginPath();c.ellipse(hit.x,hit.y,12+age*170,8+age*115,hit.angle*Math.PI/180,0,Math.PI*2);c.stroke();
      }
      const count=hit.good?(hit.combo>=5?24:18):8;
      for(let i=0;i<count;i++){
        const a=i*2.39996+hit.id*.79,speed=48+(i*37%95),drag=1-Math.exp(-age*2.6);
        const x=hit.x+Math.cos(a)*speed*drag,y=hit.y+Math.sin(a)*speed*drag+age*age*70;
        c.globalAlpha=Math.max(0,1-t)*(i%3===0?1:.8);c.fillStyle=hit.good?['#ffe6ac','#ff87a5','#fff9e9'][i%3]:'#f5a1a8';
        if(i%3===0)star(c,x,y,(6-t*4)*(hot?1.2:1),a+age*2);
        else {c.save();c.translate(x,y);c.rotate(a+age*3);c.fillRect(-2,-4,3.5,7*(1-t)+2);c.restore();}
      }
      c.globalAlpha=1;
      // A short luminous cut at impact, visible even on a tap.
      if(age<.22){
        const a=hit.angle*Math.PI/180,r=46+age*150;c.lineCap='round';c.strokeStyle=`rgba(255,249,225,${1-age/.22})`;c.lineWidth=4;
        c.beginPath();c.moveTo(hit.x-Math.cos(a)*r,hit.y-Math.sin(a)*r);c.lineTo(hit.x+Math.cos(a)*r,hit.y+Math.sin(a)*r);c.stroke();
      }
    }
    // Tapered ribbon with an amber outer glow and a bright, crisp core.
    c.lineCap='round';c.lineJoin='round';
    for(let pass=0;pass<3;pass++)for(let i=1;i<trail.length;i++){
      const a=trail[i-1],b=trail[i],life=Math.max(0,1-(time-b.at)/TRAIL_SECONDS);if(!life)continue;
      const taper=(.25+.75*i/trail.length)*life;
      c.strokeStyle=pass===0?`rgba(${hot?'255,195,95':'255,116,158'},${.24*life})`:pass===1?`rgba(255,209,153,${.85*life})`:`rgba(255,255,240,${life})`;
      c.lineWidth=[hot?24:20,9,3.2][pass]*taper;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    }
    const tip=trail[trail.length-1];
    if(tip&&time-tip.at<.12){c.fillStyle='#fff9e3';star(c,tip.x,tip.y,hot?11:8,Math.PI/4);}
  },[time,trail,impacts,still,combo]);
  return <div className="slice-fx" aria-hidden="true">
    <canvas ref={canvas}/>
    {impacts.map(hit=>{
      const age=time-hit.at;if(age<0)return null;
      const p=flight(hit,age),opacity=still?Math.max(0,1-age/.8):p.opacity;
      return <div key={hit.id}>
        {hit.good&&!still&&<div className="slice-flying-product" style={{left:`${p.x/WIDTH*100}%`,top:`${p.y/HEIGHT*100}%`,opacity,transform:`translate(-50%,-50%) rotate(${p.rotation}deg) scale(${p.scale})`}}><i/><img src={art(hit.art)} alt=""/></div>}
        <span className={'slice-score-pop '+(hit.good?'':'is-wrong')} style={{left:`${hit.x/WIDTH*100}%`,top:`${(hit.y+(still?0:16-age*48))/HEIGHT*100}%`,opacity:Math.max(0,1-age/1.05),transform:`translate(-50%,-50%) scale(${still?1:1+Math.sin(Math.min(1,age/.45)*Math.PI)*.22})`}}>{hit.good?`+${hit.points}`:'− ♥'}</span>
      </div>;
    })}
  </div>;
}
