"use strict";
const navKeys=new Set();
let firing=false,boosting=false,steerPointer=null,flight=null,world=null,raf=0,lastTime=0,active=false,paused=false,cockpit=false,simAcc=0,visibleContacts=[];
const hud=$("overlay"),hg=hud.getContext("2d");
const clockLabel=s=>Math.floor(Math.max(0,s)/60)+":"+String(Math.floor(Math.max(0,s)%60)).padStart(2,"0");
function clearInput(){navKeys.clear();steerPointer=null;firing=boosting=false;$("fire").classList.remove("held");$("boostBtn").classList.remove("held")}
function currentInput(){return {x:Number(navKeys.has("ArrowRight")||navKeys.has("KeyD"))-Number(navKeys.has("ArrowLeft")||navKeys.has("KeyA")),
 y:Number(navKeys.has("ArrowUp")||navKeys.has("KeyW"))-Number(navKeys.has("ArrowDown")||navKeys.has("KeyS")),fire:firing||navKeys.has("Space"),boost:!!flight?.boostLatched||boosting||navKeys.has("ShiftLeft")||navKeys.has("ShiftRight")}}
function hint(text){if($("flightHint").textContent!==text)$("flightHint").textContent=text}
function startFlight(training=false){if(!training&&career.xp<thresholds[selectedPlane]){progressPanel();return}closePanel();cancelAnimationFrame(raf);clearInput();flight=newFlight(selectedPlane,selectedMission,training,options.battleSize);$("cobraBtn").hidden=!flight.ship.cobra;active=true;paused=false;cockpit=false;simAcc=0;document.body.classList.add("flying");$("hangar").hidden=true;$("game").hidden=false;startAudio();engine(true);if(!world)world=new FlightWorld($("world"));lastTime=performance.now();raf=requestAnimationFrame(loop)}
function unpause(){if(!active)return;closePanel();paused=false;clearInput();lastTime=performance.now();simAcc=0;engine(true);cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}
function stopFlight(status){if(!active)return;active=false;paused=false;clearInput();engine(false);cancelAnimationFrame(raf);
 const s=flight,priorXp=career.xp,xp=grantCareer(s,status);const unlocked=fleet.filter((_,i)=>priorXp<thresholds[i]&&thresholds[i]<=career.xp).map(p=>p.code+" "+p.name);if(!s.training)saveSortie({plane:s.plane,mission:s.mission,revision:3,status,tally:s.tally.slice(),kills:s.kills,score:s.score,t:Date.now()});
 const exit=()=>{closePanel();$("game").hidden=true;$("hangar").hidden=false;document.body.classList.remove("flying");buildCards();$("launch").focus({preventScroll:true})};
 if(status==="exit"){exit();return}
 if(s.training){showPanel("УЧЕБНЫЙ ВЫЛЕТ","Зачёт!",row("Нашивка","Ведомый")+row("Пройдено","Разворот, захват и пуск"),[["В ангар",exit,true]],exit);return}
 showPanel(s.m.title.join(" ").toUpperCase(),status==="win"?"Победа «Вектора»":status==="draw"?"Ничья":"Победа «Грифа»",row("Вектор / Гриф",s.tally.join(" : "))+row("Опыт за бой","+"+xp+" XP")+(unlocked.length?row("Новый самолёт",unlocked.join(", ")):"")+row("Самолёт",s.ship.code+" "+s.ship.name)+row("Сбито лично",s.kills)+row("Время полёта",clockLabel(s.t))+row("Счёт",s.score.toLocaleString("ru-RU")),[["Ещё вылет",()=>startFlight(false),true],["В ангар",exit,false]],exit)}
function pauseFlight(reopen=false){if(!active||paused&&reopen!==true)return;paused=true;clearInput();engine(false);cancelAnimationFrame(raf);showPanel("ПОЛЁТ ПРИОСТАНОВЛЕН","Пауза",row("Операция",flight.m.title.join(" "))+row("Самолёт",flight.ship.code+" "+flight.ship.name)+row("Вектор / Гриф",flight.tally.join(" : ")),[["Продолжить",unpause,true],["Настройки",()=>settings(()=>pauseFlight(true)),false],["В ангар",()=>stopFlight("exit"),false]],unpause)}
function swapCamera(){if(active&&!paused){cockpit=!cockpit;flight.view=null}}
$("launch").onclick=()=>startFlight(false);$("train").onclick=()=>startFlight(true);$("cam").onclick=swapCamera;$("pause").onclick=pauseFlight;
addEventListener("keydown",e=>{if(!active)return;if(paused)return;if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space","KeyW","KeyA","KeyS","KeyD","ShiftLeft","ShiftRight","KeyC","KeyR","KeyF","Escape","KeyP"].includes(e.code)){e.preventDefault();if((e.code==="Escape"||e.code==="KeyP")&&!e.repeat){pauseFlight();return}if(e.code==="KeyC"&&!e.repeat)swapCamera();if(e.code==="KeyF"&&!e.repeat)startCobra(flight);if(e.code==="KeyR"&&!e.repeat)launchMissile(flight);navKeys.add(e.code)}});
addEventListener("keyup",e=>navKeys.delete(e.code));addEventListener("blur",()=>{if(active&&!paused)pauseFlight()});document.addEventListener("visibilitychange",()=>{if(document.hidden&&active&&!paused)pauseFlight()});
const steer=$("steer");
steer.onpointerdown=e=>{
 if(!active||paused||steerPointer||e.button!==0)return;
 steerPointer={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0};steer.setPointerCapture(e.pointerId);
};
steer.onpointermove=e=>{
 if(!steerPointer||e.pointerId!==steerPointer.id||!flight||paused)return;
 const dx=e.clientX-steerPointer.x,dy=e.clientY-steerPointer.y;
 steerPointer.x=e.clientX;steerPointer.y=e.clientY;steerPointer.travel+=Math.hypot(dx,dy);
 const scale=2*(world?.ty||.65)/Math.max(1,steer.clientHeight);
 flight.aimYaw=wrapAngle(flight.yaw+clamp(wrapAngle(flight.aimYaw-flight.yaw+dx*scale*1.28*options.sensitivity),-1.24,1.24));
 flight.aimPitch=clamp(flight.aimPitch-dy*scale*1.18*options.sensitivity*(options.invert?-1:1),-.82,.82);
};
steer.onpointerup=e=>{
 if(!steerPointer||e.pointerId!==steerPointer.id)return;
 if(steerPointer.travel<7&&flight&&flight.hp>0){
  const rect=steer.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  const mark=visibleContacts.filter(c=>c.jet.team===1).map(c=>({c,d:Math.hypot(c.x-x,c.y-y)})).sort((a,b)=>a.d-b.d)[0];
  if(mark&&mark.d<33){const v=V.sub(mark.c.jet.pos,flight.pos);flight.aimYaw=Math.atan2(v[0],v[2]);flight.aimPitch=clamp(Math.atan2(v[1],Math.hypot(v[0],v[2])),-.82,.82)}
 }
 steerPointer=null;
};
steer.onlostpointercapture=e=>{if(steerPointer?.id===e.pointerId)steerPointer=null};
$("rocketBtn").onclick=()=>{if(active&&!paused)launchMissile(flight)};
$("fire").onpointerdown=e=>{if(!active||paused)return;e.currentTarget.setPointerCapture(e.pointerId);firing=true;e.currentTarget.classList.add("held")};
$("fire").onlostpointercapture=()=>{firing=false;$("fire").classList.remove("held")};
let boostTouch=null;
const throttle=$("boostBtn");
throttle.onpointerdown=e=>{if(!active||paused||boostTouch)return;boostTouch={id:e.pointerId,time:performance.now(),was:flight.boostLatched};throttle.setPointerCapture(e.pointerId);boosting=true};
throttle.onpointerup=e=>{if(!boostTouch||e.pointerId!==boostTouch.id)return;if(active&&!paused&&flight.hp>0)flight.boostLatched=performance.now()-boostTouch.time<340?!boostTouch.was:boostTouch.was;boostTouch=null;boosting=false};
throttle.onlostpointercapture=()=>{boostTouch=null;boosting=false};
throttle.onclick=e=>{if(e.detail===0&&active&&!paused&&flight.hp>0)flight.boostLatched=!flight.boostLatched};
$("cobraBtn").onclick=()=>{if(active&&!paused)startCobra(flight)};
function loop(now){if(!active||paused)return;const elapsed=Math.min(.24,(now-lastTime)/1000);lastTime=now;simAcc+=elapsed;const input=currentInput();while(simAcc>=1/60&&!flight.ended){simulate(flight,1/60,input);simAcc-=1/60}drawGame(flight,input);engine(flight.hp>0,flight.afterburner);if(flight.ended){stopFlight(flight.ended);return}raf=requestAnimationFrame(loop)}
function drawGame(s,input){const w=$("game").clientWidth,h=$("game").clientHeight;if(!w||!h)return;
 const b=basis(s.yaw,nosePitch(s),s.bank);
 let eye,axes;if(cockpit){eye=V.add(s.pos,localToWorld(b,[0,1.55,4.5]));axes=basis(s.yaw,nosePitch(s),s.bank*.84)}else{const back=(w<h?29:24)+s.afterburner*3+s.angleOffset*4;const view=s.view||{yaw:s.yaw,pitch:s.pitch,bank:s.bank,t:s.t};const k=1-Math.exp(-Math.max(0,s.t-view.t)*9);view.yaw=wrapAngle(view.yaw+wrapAngle(s.yaw-view.yaw)*k);view.pitch+=(s.pitch-view.pitch)*k;view.bank+=(s.bank-view.bank)*k;view.t=s.t;s.view=view;const orbit=view.yaw+.56*s.angleOffset;eye=V.add(s.pos,localToWorld(basis(orbit,view.pitch,0),[0,9.3,-back]));axes=basis(orbit,view.pitch-.187,view.bank*.24)}
 world.camera(eye,axes,w,h);const objects=s.bots.map(e=>[separation(e.pos,s.pos)>(world.gl?420:155)?distantAircraft[e.type]:planeMeshes[e.type],e.pos,basis(e.yaw,nosePitch(e),e.bank),1.16,2,e.rollControl,e.pitchControl]);if(!cockpit&&s.hp>0)objects.push([planeMeshes[s.plane],s.pos,b,1,2+options.skin,s.rollControl,s.pitchControl]);objects.push(...extraObjects(s));world.render(objects,s.m,s.t);
 const dpr=Math.min(options.graphics==="eco"?1:1.6,devicePixelRatio||1);if(hud.width!==Math.round(w*dpr)||hud.height!==Math.round(h*dpr)){hud.width=Math.round(w*dpr);hud.height=Math.round(h*dpr)}
 const g=hg;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
 const line=(x1,y1,x2,y2,color,width=1)=>{g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()};
 const circle=(x,y,r,color,width=1)=>{g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.strokeStyle=color;g.lineWidth=width;g.stroke()};
 const label=(str,x,y,size,color,align="left",bold=false)=>{g.fillStyle=color;g.textAlign=align;g.font=(bold?"bold ":"")+size+'px Consolas, "Liberation Mono", monospace';g.shadowColor="#12262f";g.shadowBlur=3;g.fillText(str,x,y);g.shadowBlur=0};
 const ghost="#d8f1e1b0",bright="#dbf5df",amber="#ffae70",narrow=w<610,short=h<480,proj=p=>world.project(p);
 if(!cockpit&&s.hp>0){
  const nozzles=s.ship.cobra?[1.25,-.28,-7.10]:[.88,-.14,-6.51];
  for(const side of [-1,1]){
   const base=[nozzles[0]*side,nozzles[1],nozzles[2]],projectLocal=v=>proj(V.add(s.pos,localToWorld(b,v)));
   const p=projectLocal(base);if(p.z<1)continue;
   const k=s.afterburner,size=clamp(h/(world.ty*p.z)*.4,2,35);
   const q=projectLocal([base[0],base[1],base[2]-.7-(3.8+.30*Math.sin(s.t*55))*k]);
   const glow=g.createRadialGradient(p.x,p.y,0,p.x,p.y,size*(1.2+k));glow.addColorStop(0,"#ffde9ceb");glow.addColorStop(.45,"#ff854588");glow.addColorStop(1,"#ff510000");g.fillStyle=glow;g.fillRect(p.x-size*2.3,p.y-size*2.3,size*4.6,size*4.6);
   if(k>.03&&q.z>1){const dx=q.x-p.x,dy=q.y-p.y,len=Math.max(.15,Math.hypot(dx,dy)),nx=-dy/len*size*.57,ny=dx/len*size*.57,gradient=g.createLinearGradient(p.x,p.y,q.x,q.y);gradient.addColorStop(0,"#fff1baff");gradient.addColorStop(.30,"#ffb373ef");gradient.addColorStop(.66,"#aa91fbb0");gradient.addColorStop(1,"#7da8ff11");g.fillStyle=gradient;g.beginPath();g.moveTo(p.x+nx,p.y+ny);g.lineTo(q.x,q.y);g.lineTo(p.x-nx,p.y-ny);g.closePath();g.fill()}
  }
 }
 for(const fx of s.effects){const p=proj(fx.p);if(fx.end){const k=1-fx.life/fx.max;const q=proj(V.add(fx.p,V.mul(V.sub(fx.end,fx.p),Math.min(1,k+.24))));const r=proj(V.add(fx.p,V.mul(V.sub(fx.end,fx.p),Math.max(0,k-.18))));if(q.z>0&&r.z>0)line(r.x,r.y,q.x,q.y,fx.kind==="incoming"?"#ff8558":fx.kind==="friendly"?"#96ddff":"#ffdd8b",2);continue}
 if(p.z<.5)continue;const k=1-fx.life/fx.max;if(fx.kind==="blast"){const size=clamp((8+k*27)*h/(p.z*world.ty),4,125);const burst=g.createRadialGradient(p.x,p.y,0,p.x,p.y,size);burst.addColorStop(0,'rgba(255,225,150,'+(1-k)+')');burst.addColorStop(.45,'rgba(255,125,42,'+(.8-k*.7)+')');burst.addColorStop(1,'#2c282300');g.fillStyle=burst;g.fillRect(p.x-size,p.y-size,size*2,size*2)}else{g.fillStyle="#ffc377";g.fillRect(p.x,p.y,2.4,2.4)}}
 if(cockpit){g.save();g.strokeStyle="#253138";g.lineWidth=Math.max(5,w*.008);g.beginPath();g.moveTo(w*.015,h);g.bezierCurveTo(-w*.04,h*.06,w*.17,-h*.11,w*.26,-h*.02);g.stroke();g.beginPath();g.moveTo(w*.985,h);g.bezierCurveTo(w*1.04,h*.06,w*.83,-h*.11,w*.74,-h*.02);g.stroke();g.fillStyle="#18242c";g.beginPath();g.moveTo(0,h);g.lineTo(w*.28,h*.94);g.lineTo(w*.42,h*.85);g.lineTo(w*.58,h*.85);g.lineTo(w*.72,h*.94);g.lineTo(w,h);g.fill();g.restore()}
 if(cockpit){
 const unit=clamp(w/900,.48,1.45),dw=74*unit,dh=32*unit,baseY=h-dh-6;
 for(const side of [-1,1]){const dx=w*.5+side*w*.072-dw*.5;g.fillStyle="#0a1116";g.fillRect(dx-3,baseY-3,dw+6,dh+6);g.strokeStyle="#58636b";g.lineWidth=1.5;g.strokeRect(dx-3,baseY-3,dw+6,dh+6);g.fillStyle="#193032";g.fillRect(dx,baseY,dw,dh);
 for(let i=1;i<5;i++){line(dx+dw*i/5,baseY,dx+dw*i/5,baseY+dh,"#35504c");line(dx,baseY+dh*i/5,dx+dw,baseY+dh*i/5,"#35504c");}
 if(side<0){label("THR",dx+3,baseY+dh*.43,Math.max(7,9*unit),"#abdbb5");label(Math.round(100+55*s.afterburner)+"%",dx+dw-3,baseY+dh*.8,Math.max(7,11*unit),"#a2dcae","right",true)}
 else{label("ALT",dx+3,baseY+dh*.43,Math.max(7,9*unit),"#abdbb5");label(Math.round(s.pos[1])+" M",dx+dw-3,baseY+dh*.8,Math.max(7,11*unit),"#a2dcae","right",true)}
 }const gx=w*.5,gy=h-dh*.57-5,gr=dh*.43;g.fillStyle="#253748";g.beginPath();g.arc(gx,gy,gr,0,Math.PI*2);g.fill();circle(gx,gy,gr,"#859493",2);g.save();g.translate(gx,gy);g.rotate(-s.bank);line(-gr*.8,0,gr*.8,0,"#e7d4a4",1.5);line(0,0,0,-gr*.55,"#e7d4a4",1.5);g.restore();
 }
 function trackLine(points,color,width){
  g.beginPath();let previous=false;
  for(const point of points){const p=proj(point);if(p.z<1){previous=false;continue}
   g[previous?"lineTo":"moveTo"](p.x,p.y);previous=true}
  g.strokeStyle=color;g.lineWidth=width;g.stroke();
 }
 for(const jet of [s,...s.bots]){
  if(jet!==s&&separation(jet.pos,s.pos)>430||jet.hp<=0||jet.trail.length<2||jet===s&&cockpit)continue;
  const force=(jet.afterburner||0)*.21,opacity=.08+Math.min(.35,Math.abs(jet.bank)*.29)+force;
  for(let side=0;side<2;side++)trackLine(jet.trail.map(pair=>pair[side]),"rgba(236,245,246,"+opacity+")",jet===s?2:1.4);
 }
 for(const r of s.rockets){trackLine(r.trail,"#dce5e6ae",3);const head=proj(r.p);if(head.z>1){
   const prior=proj(r.trail.length>1?r.trail[r.trail.length-2]:r.start);
   if(prior.z>1){const dx=head.x-prior.x,dy=head.y-prior.y,len=Math.max(1,Math.hypot(dx,dy));
    line(head.x-9*dx/len,head.y-9*dy/len,head.x,head.y,"#ff9a46",4);
    line(head.x,head.y,head.x+5*dx/len,head.y+5*dy/len,"#fff9e8",2)}
 }}
 const pad=narrow?12:21,top=short?12:18;
 const cross=proj(V.add(s.pos,V.mul(b[2],800))),aim=proj(V.add(s.pos,V.mul(flightPath(s.aimYaw,s.aimPitch),800)));
 const ring=clamp(Math.min(w,h)*.053,19,40);
 s.captureAngle=Math.atan(ring*2*world.ty/h);
 const ax=clamp(aim.x,ring+9,w-ring-9),ay=clamp(aim.y,ring+40,h-ring-12),ready=s.lockProgress>=1;
 const rim=ready?"#b6ffb8":s.lockProgress>0?"#ffcf89":"#f2f6f0";
 if(s.hp>0){circle(ax,ay,ring,"#10202aa0",3.5);circle(ax,ay,ring,rim,1.45);
  for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]])line(ax+x*(ring+1),ay+y*(ring+1),ax+x*(ring+5),ay+y*(ring+5),rim,1.5);
  if(Math.hypot(ax-cross.x,ay-cross.y)>ring*1.5){g.setLineDash([2,5]);line(ax,ay,cross.x,cross.y,"#e6efdf70");g.setLineDash([])}
  circle(cross.x,cross.y,3,"#f2fff0",1.3);line(cross.x-9,cross.y,cross.x-5,cross.y,bright);line(cross.x+5,cross.y,cross.x+9,cross.y,bright);
  if(s.lockProgress>0){g.beginPath();g.arc(ax,ay,ring+5,-Math.PI/2,Math.PI*2*s.lockProgress-Math.PI/2);g.strokeStyle=rim;g.lineWidth=2.4;g.stroke();
   label(ready?"ЦЕЛЬ ЗАХВАЧЕНА":"ЗАХВАТ "+Math.round(s.lockProgress*100)+"%",ax,ay+ring+21,short?10:12,rim,"center",true)}
  if(s.hitFlash>0)for(const x of [-1,1])for(const y of [-1,1])line(cross.x+x*6,cross.y+y*6,cross.x+x*13,cross.y+y*13,amber,2);
 }
 let near=null,best=Infinity,shown=0;visibleContacts=[];const labels=[];
 for(const e of s.bots.slice().sort((a,b)=>Number(b.id===s.lockId)-Number(a.id===s.lockId)||b.team-a.team)){
  const p=proj(e.pos),d=V.sub(e.pos,s.pos),r=Math.hypot(...d),friend=e.team===0;
  if(!friend&&r<best){near=d;best=r}
  if(p.z<1||p.x<12||p.x>w-12||p.y<29||p.y>h-13)continue;
  if(!friend)shown++;visibleContacts.push({jet:e,x:p.x,y:p.y});
  const a=clamp(h*6/Math.max(15,p.z),6,14),color=friend?"#86d9ff":"#ff987e";
  g.strokeStyle=color;g.lineWidth=1.8;g.beginPath();
  if(friend){g.moveTo(p.x-a,p.y-a-3);g.lineTo(p.x,p.y-3);g.lineTo(p.x+a,p.y-a-3)}
  else{g.moveTo(p.x,p.y-a);g.lineTo(p.x+a,p.y);g.lineTo(p.x,p.y+a);g.lineTo(p.x-a,p.y);g.closePath()}
  g.stroke();
  if(e.id===s.lockId){g.strokeStyle=rim;g.strokeRect(p.x-a-3,p.y-a-3,a*2+6,a*2+6)}
  let nameY=p.y-a-9;while(labels.some(l=>Math.abs(l[0]-p.x)<62&&Math.abs(l[1]-nameY)<24))nameY-=24;if(nameY<12)continue;labels.push([p.x,nameY]);
  label(e.name.toUpperCase(),p.x,nameY,short?9:10,color,"center",true);
  if(!friend||r>80)label(r<1000?Math.round(r)+" м":(r/1000).toFixed(1)+" км",p.x,nameY+12,10,"#eff6ef","center");
 }
 if(!shown&&near){const [dx,dy,dz]=world.axes.map(axis=>V.dot(axis,near));let x=dx/Math.max(1,Math.hypot(dx,dy)),y=-dy/Math.max(1,Math.hypot(dx,dy));if(dz<0&&Math.abs(x)<.35){x=dx<0?-1:1;y=0}const sc=Math.min((w*.5-48)/Math.max(.01,Math.abs(x)),h*.32/Math.max(.01,Math.abs(y)));const xx=w*.5+x*sc,yy=h*.5+y*sc;g.save();g.translate(xx,yy);g.rotate(Math.atan2(y,x));g.fillStyle="#ff9a7d";g.beginPath();g.moveTo(9,0);g.lineTo(-5,-5);g.lineTo(-5,5);g.fill();g.restore();label("ГРИФ",xx,yy+17,10,amber,"center",true)}
 const statusY=short?top+15:narrow?top+71:top+22;
 label(s.ship.code+" / "+s.ship.name.toUpperCase(),pad,statusY,short?11:13,"#f5f4e9","left",true);
 const lines=[["СКР",Math.round(s.speed*3.6)+" км/ч"],["ВЫС",Math.round(Math.max(0,s.pos[1]))+" м"],["КОРП",Math.ceil(s.hp/s.ship.armor*100)+"%"],["ТЯГА",Math.round(100+s.afterburner*55)+"%"]];
 lines.forEach(([key,val],i)=>{label(key,pad,statusY+19+i*16,10,"#e5eddf");label(val,pad+32,statusY+19+i*16,11,bright,"left",true)});
 if(!short||w>670){const R=short?27:narrow?27:38,rx=w-pad-R,ry=top+(narrow?103:85);
  g.fillStyle="#142934a0";g.beginPath();g.arc(rx,ry,R,0,Math.PI*2);g.fill();circle(rx,ry,R,"#c5d8cb99");
  circle(rx,ry,R*.56,"#c3d7ce47");line(rx-R,ry,rx+R,ry,"#bfd5d03a");line(rx,ry-R,rx,ry+R,"#bfd5d03a");
  const flat=basis(s.yaw);for(const e of s.bots){const d=V.sub(e.pos,s.pos),x=V.dot(d,flat[0]),y=-V.dot(d,flat[2]),div=Math.max(850,Math.hypot(x,y));
   g.fillStyle=e.team?"#ff9477":"#78d8ff";g.fillRect(rx+x/div*(R-4)-2,ry+y/div*(R-4)-2,4,4)}
  g.fillStyle=bright;g.beginPath();g.moveTo(rx,ry-4);g.lineTo(rx-3,ry+3);g.lineTo(rx+3,ry+3);g.fill()
 }
 const update=(id,value)=>{const el=$(id);if(el.textContent!==String(value))el.textContent=value};
 update("blueScore",s.tally[0]);update("redScore",s.tally[1]);update("scoreGoal",s.training?"УЧЕБНЫЙ":"ДО "+s.m.goal);update("matchTime",clockLabel(s.training?s.t:s.remaining));
 update("rocketCount",s.missiles===0?"Заряд · "+Math.ceil(s.reload):"Ракета · "+s.missiles);
 throttle.setAttribute("aria-pressed",String(input.boost&&s.hp>0));
 const cobra=$("cobraBtn");if(s.ship.cobra){const cooldown=Math.max(0,Math.ceil(s.cobraReady-s.t));cobra.classList.toggle("cooldown",!!cooldown&&!s.maneuver);const title=s.maneuver?"Кобра":cooldown?cooldown+" с":"Кобра";if(cobra.lastElementChild.textContent!==title)cobra.lastElementChild.textContent=title}
 const canLaunch=ready&&s.launchDelay<=0&&s.missiles>0&&s.hp>0;
 const rocketButton=$("rocketBtn");rocketButton.classList.toggle("locked",canLaunch);rocketButton.setAttribute("aria-disabled",String(!canLaunch));
 if(s.t<4||s.noticeUntil>s.t||s.deadFor>0){
  const msg=s.deadFor>0?"ВОЗВРАЩЕНИЕ ЧЕРЕЗ "+Math.ceil(s.deadFor):s.t<4?(s.mission===2?"ПАЛУБНЫЙ СТАРТ":"ВЗЛЁТ"):s.notice.toUpperCase();
  label(msg,w*.5,h*(short?.27:.28),short?12:16,s.deadFor>0?"#ffb294":bright,"center",true)
 }
 if(s.damageFlash>0){g.strokeStyle="rgba(255,72,45,"+s.damageFlash+")";g.lineWidth=12;g.strokeRect(0,0,w,h)}
 hint(s.training?(s.t<4?"Учебный вылет · дождись взлёта":s.stage===0?"1/3 · Проведи пальцем в сторону или нажми стрелку для разворота":s.stage===1?"2/3 · Удерживай красную метку мишени внутри круга":"3/3 · Нажми «Ракета» или R после захвата"):s.t<9?"Веди по экрану — самолёт следует за кругом":s.t<14?"Держи красную метку в круге для захвата":s.hp>0&&s.pos[1]-Math.max(0,groundAt(s.pos[0],s.pos[2]))<40?"НАБЕРИ ВЫСОТУ":"");
}
