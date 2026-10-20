import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { growth, type Farm, type Flower } from './farm';

const positions=[[-1.3,-.45],[.8,-.45],[-1.3,1.3],[.8,1.3]];
export function createGarden(host:HTMLElement, select:(i:number)=>void, compact:boolean, motion:boolean) {
  const scene=new T.Scene();scene.background=new T.Color('#f2ece1');
  const camera=new T.PerspectiveCamera(35,1,.1,80);camera.position.set(6.6,7.6,9.2);
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','可拖动旋转的立体花园');
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.8,0);controls.enablePan=false;controls.enableDamping=true;controls.minDistance=8;controls.maxDistance=17;controls.minPolarAngle=.35;controls.maxPolarAngle=1.2;controls.enabled=!compact;controls.zoomSpeed=.5;controls.rotateSpeed=.6;
  const mats=new Map<string,T.MeshStandardMaterial>();
  function mat(color:string,metal=0){const key=color+metal;if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,metalness:metal,roughness:metal?.36:.78}));return mats.get(key)!;}
  function mesh(g:T.BufferGeometry,color:string,parent:T.Object3D,x=0,y=0,z=0,metal=0){const m=new T.Mesh(g,mat(color,metal));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(w:number,h:number,d:number,c:string,p:T.Object3D,x=0,y=0,z=0,r=.08){return mesh(new RoundedBoxGeometry(w,h,d,2,r),c,p,x,y,z);}
  function ball(r:number,c:string,p:T.Object3D,x=0,y=0,z=0){return mesh(new T.SphereGeometry(r,12,8),c,p,x,y,z);}
  function cylinder(a:number,b:number,h:number,c:string,p:T.Object3D,x=0,y=0,z=0){return mesh(new T.CylinderGeometry(a,b,h,16),c,p,x,y,z);}
  function rod(a:T.Vector3,b:T.Vector3,r:number,c:string,p:T.Object3D){const m=cylinder(r,r,a.distanceTo(b),c,p);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
  scene.add(new T.HemisphereLight('#fffbf4','#8e9d81',2.4));const sun=new T.DirectionalLight('#fff3dc',3.5);sun.position.set(-5,10,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:25});sun.shadow.normalBias=.035;scene.add(sun);
  const garden=new T.Group();scene.add(garden);
  box(6.6,.36,5.6,'#c9b8a0',garden,0,-.24,0,.16);box(6.48,.18,5.48,'#f9f1e3',garden,0,.01,0,.14);
  box(6.15,.08,5.12,'#afbb8a',garden,0,.14,0,.3);
  // Cream stone path and a small rose pergola give the garden depth from every side.
  for(let j=0;j<6;j++)box(.52,.06,.58,'#f6e6d3',garden,-.22,.22,-2.05+j*.78,.09);
  for(let j=0;j<4;j++)box(.65,.06,.49,'#f6e6d3',garden,-2.55+j*1.4,.22,.42,.09);
  for(const x of [-2.92,2.92]){for(let z=-2.2;z<2.6;z+=.65){cylinder(.035,.035,.68,'#f9ead6',garden,x,.52,z);ball(.065,'#dfc5a4',garden,x,.89,z);}rod(new T.Vector3(x,.62,-2.2),new T.Vector3(x,.62,2.4),.035,'#fff1df',garden);}
  const arch=new T.Group();arch.position.set(0,0,-1.92);garden.add(arch);
  for(const x of [-1.38,1.38]){cylinder(.055,.055,2,'#a28661',arch,x,1.2,0);box(.25,.2,.3,'#f4ddc2',arch,x,.29,0);}
  mesh(new T.TorusGeometry(1.38,.055,8,32,Math.PI),'#a28661',arch,0,2.2,0);
  for(let i=0;i<13;i++){const a=i/12*Math.PI,x=Math.cos(a)*1.38,y=2.2+Math.sin(a)*1.38;ball(.16,i%2?'#72835b':'#91a16d',arch,x,y,.02).scale.set(1.3,.8,.8);if(i%3===0){const f=new T.Group();f.position.set(x,y,.17);arch.add(f);for(let p=0;p<5;p++)ball(.105,'#bd4757',f,Math.cos(p*1.256)*.12,Math.sin(p*1.256)*.12,0);ball(.075,'#eec29f',f,0,0,.07);}}
  // Small beauty studio bench, glass perfume bottle and a cherry-red watering can.
  const bench=new T.Group();bench.position.set(2.2,.22,-1.57);garden.add(bench);
  for(const x of [-.38,.38])for(const z of [-.18,.18])cylinder(.045,.045,.45,'#936e54',bench,x,.22,z);
  for(let z=0;z<3;z++)box(1.05,.09,.15,'#e9c49e',bench,0,.48,-.18+z*.18,.025);
  box(1.05,.32,.08,'#e9c49e',bench,0,.74,-.26,.03);
  box(.22,.3,.18,'#c97e80',bench,.2,.68,0,.04);box(.12,.09,.12,'#cfad6b',bench,.2,.88,0,.02);
  const can=new T.Group();can.position.set(-2.3,.3,1.9);can.rotation.y=-.5;garden.add(can);
  cylinder(.18,.23,.37,'#ae3746',can,0,.19,0);const h=mesh(new T.TorusGeometry(.21,.035,8,16),'#b94855',can,0,.22,-.12);h.rotation.x=Math.PI/2;
  rod(new T.Vector3(.1,.22,0),new T.Vector3(.49,.44,0),.055,'#b94855',can);ball(.085,'#d9ad83',can,.49,.44,0);
  for(const x of [-2.3,2.3]){cylinder(.25,.19,.38,'#f2dac3',garden,x,.4,-2.1);const shrub=ball(.35,'#6f8757',garden,x,.87,-2.1);shrub.scale.set(.8,1.4,.8);}
  const beds: T.Group[]=[], plants:T.Group[]=[], rings:T.Mesh[]=[], sways:{obj:T.Group;phase:number}[]=[];
  for(let i=0;i<4;i++){
    const [x,z]=positions[i],bed=new T.Group();bed.position.set(x,0,z);bed.userData.plot=i;garden.add(bed);beds.push(bed);
    box(1.66,.25,1.3,'#d9ac87',bed,0,.3,0,.08);box(1.47,.1,1.12,'#775842',bed,0,.43,0,.07);
    for(let row=0;row<3;row++)box(1.28,.05,.09,'#8e6c4b',bed,0,.49,-.35+row*.35,.04);
    const ring=box(1.78,.045,1.42,'#b52b3c',bed,0,.19,0,.12);ring.visible=false;rings.push(ring);
    const plant=new T.Group();plant.position.y=.48;bed.add(plant);plants.push(plant);
    // A physical marker stays readable without covering flowers.
    const cv=document.createElement('canvas');cv.width=64;cv.height=64;const cx=cv.getContext('2d')!;cx.fillStyle='#fff6e7';cx.fillRect(0,0,64,64);cx.fillStyle='#9c3542';cx.font='bold 38px Georgia';cx.textAlign='center';cx.fillText(String(i+1),32,47);const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
    const marker=new T.Mesh(new T.PlaneGeometry(.23,.24),new T.MeshBasicMaterial({map:tex}));marker.position.set(.58,.57,.66);bed.add(marker);
  }
  function flower(parent:T.Group,kind:Flower,stage:number,offset:number) {
    const g=new T.Group();g.position.set(offset===0?-.37:offset===1?.34:0,0,offset===2?.28:-.23);parent.add(g);sways.push({obj:g,phase:offset*2+parent.id});
    const height=kind==='lavender'?.72:.55;
    cylinder(.016,.023,height,'#66834f',g,0,height/2,0);
    for(let l=0;l<3;l++){const leaf=ball(.15,'#7b975d',g,l%2?.09:-.09,.15+l*.12,0);leaf.scale.set(.9,.3,.45);leaf.rotation.z=l%2?.55:-.55;}
    if(stage<2)return;
    if(stage===2){ball(.13,kind==='lavender'?'#a28ab6':kind==='rose'?'#d77b87':'#edddc4',g,0,height,0).scale.set(.8,1.2,.8);return;}
    if(kind==='lavender') {for(let n=0;n<6;n++){for(let a=0;a<3;a++){ball(.065,n%2?'#9882b9':'#b19acb',g,Math.cos(a*2.09+n)*.055,height+n*.065,Math.sin(a*2.09+n)*.055);}}}
    else {for(let layer=0;layer<2;layer++)for(let p=0;p<6;p++){const a=p*Math.PI/3+layer*.5,petal=ball(.15,kind==='rose'?(layer?'#d16878':'#bc4157'):(layer?'#fff5df':'#e5c9af'),g,Math.cos(a)*(.13-layer*.045),height+layer*.055,Math.sin(a)*(.13-layer*.045));petal.scale.set(1,.42,1);petal.rotation.z=Math.cos(a)*.5;petal.rotation.x=Math.sin(a)*.5;}ball(.075,'#edc076',g,0,height+.1,0);}
  }
  const butterfly=new T.Group();garden.add(butterfly);const wings=[-1,1].map(s=>{const w=ball(.13,'#e4a16c',butterfly,s*.1,0,0);w.scale.set(1,.14,1.5);return w;});
  const sparks=new T.Group();scene.add(sparks);for(let i=0;i<15;i++)ball(.045,'#d9ae72',sparks);sparks.visible=false;
  let fxAt=0,fxType='',latest:Farm|undefined,selected=-1,signature='',frame=0,lastFrame=0,visible=true,disposed=false,active=true;
  function clearPlant(g:T.Group){for(const child of [...g.children]){child.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});g.remove(child);}}
  function update(farm:Farm,sel:number,now=Date.now()){
    latest=farm;selected=sel;const sig=farm.plots.map(p=>p?`${p.flower}:${Math.min(3,Math.floor(growth(p,Math.max(now,farm.lastNow))*3))}`:'empty').join('|');
    if(sig!==signature){signature=sig;sways.length=0;plants.forEach((p,i)=>{clearPlant(p);const crop=farm.plots[i];if(crop){const stage=Math.min(3,Math.floor(growth(crop,Math.max(now,farm.lastNow))*3));for(let n=0;n<3;n++)flower(p,crop.flower,stage,n);}});}
    rings.forEach((r,i)=>r.visible=sel===i);render();
  }
  function render(){if(disposed)return;controls.update();renderer.render(scene,camera);}
  function loop(t:number){frame=requestAnimationFrame(loop);if(!visible||!active||t-lastFrame<32)return;lastFrame=t;
    if(motion){sways.forEach(({obj,phase})=>{obj.rotation.z=Math.sin(t/1500+phase)*.045;});butterfly.position.set(Math.cos(t/3200)*1.8,2.3+Math.sin(t/1700)*.35,Math.sin(t/3200)*1.6);butterfly.rotation.y=-t/3200;wings.forEach((w,i)=>w.rotation.z=Math.sin(t/85)*(i?1:-1)*.65);}
    if(latest)plants.forEach((p,i)=>{const crop=latest!.plots[i];if(crop){const s=.48+growth(crop,Math.max(Date.now(),latest!.lastNow))*.52;p.scale.setScalar(s);}});
    if(sparks.visible){const elapsed=(performance.now()-fxAt)/1100;if(elapsed>1)sparks.visible=false;else sparks.children.forEach((p,i)=>{const a=i*2.4;p.position.set(Math.cos(a)*elapsed*.7,fxType==='water'?(1-elapsed)*1.3:elapsed*1.2,Math.sin(a)*elapsed*.7);});}
    if(motion||sparks.visible)render();
  }
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
  const ro=new ResizeObserver(resize);ro.observe(host);const io=new IntersectionObserver(e=>{visible=e[0].isIntersecting;});io.observe(host);
  const onVisibility=()=>{active=!document.hidden;};document.addEventListener('visibilitychange',onVisibility);
  controls.addEventListener('change',renderOnce);function renderOnce(){if(!disposed)renderer.render(scene,camera);}
  let down={x:0,y:0};const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const onUp=(e:PointerEvent)=>{if(compact||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;const rect=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);for(const hit of ray.intersectObjects(beds,true)){let o:T.Object3D|null=hit.object;while(o&&o.userData.plot===undefined)o=o.parent;if(o){select(o.userData.plot);break;}}};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  const onLoss=(e:Event)=>{e.preventDefault();host.dispatchEvent(new Event('garden-context-lost'));};renderer.domElement.addEventListener('webglcontextlost',onLoss);
  resize();frame=requestAnimationFrame(loop);
  return {update, effect(type:string,plot:number){fxAt=performance.now();fxType=type;sparks.position.set(positions[plot][0],.6,positions[plot][1]);sparks.visible=motion;}, view(action:string){if(action==='reset'){camera.position.set(6.6,7.6,9.2);controls.target.set(0,.8,0);}else{camera.position.sub(controls.target).multiplyScalar(action==='in'?.85:1.15).clampLength(8,17).add(controls.target);}render();},dispose(){disposed=true;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();document.removeEventListener('visibilitychange',onVisibility);controls.dispose();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('webglcontextlost',onLoss);scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>{m.map?.dispose();m.dispose();});}});renderer.dispose();renderer.domElement.remove();}};
}
