"use strict";

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const formationNames = ["Барс","Стриж","Коршун","Ворон","Ястреб","Сапсан","Зенит","Туман","Иней","Беркут","Клён","Риф","Север","Кречет","Рысь","Гром","Вихрь","Тень","Буран","Шквал","Искра","Пик","Метеор","Гроза"];
const flightPath = (yaw, pitch) => [Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)];
const separation = (a, b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

function newFlight(plane, mission, training=false, size=6) {
 const count=training?0:size===25?24:5, base=missions[mission], m=count===24?{...base,goal:base.goal*5}:base, ship=fleet[plane];
 mapIndex=mission;
 const s={training,count,afterburner:0,boostLatched:false,maneuver:null,angleOffset:0,cobraReady:0,stage:0,turnTravel:0,id:0,team:0,plane,mission,m,ship,pos:V.add(m.origin,localToWorld(basis(m.heading),[-4,mission===2?18.3:9.3,-97])),
  yaw:m.heading,pitch:0,bank:0,aimYaw:m.heading,aimPitch:.04,speed:24,hp:ship.armor,
  t:0,remaining:m.time,kills:0,score:0,tally:[0,0],bots:[],serial:0,effects:[],rockets:[],pending:[],
  fireDelay:0,missiles:4,reload:0,launchDelay:0,lockId:null,lockProgress:0,
  hitFlash:0,damageFlash:0,notice:"",noticeUntil:0,trail:[],trailTime:0,rollControl:0,pitchControl:0,
  deadFor:0,protect:0,ended:null};
 deployFleet(s);return s;
}
function notifyFlight(s,msg,time=1.65){s.notice=msg;s.noticeUntil=s.t+time}
function resetLock(s){s.lockId=null;s.lockProgress=0}
function spawnBot(s,slot,initial=false){
 const friendly=slot<2||(slot>=5&&slot<15),phase=s.serial++*.8,heading=s.yaw;
 const start=slot>=5 ? [0,0,0] : initial&&friendly ? [[-33,8,35],[36,13,48]][slot]
  : friendly ? [[-100,25,-55],[110,45,-40]][slot]
  : [[-12,16,590],[-185,51,735],[185,77,810]][slot-2];
 const p=V.add(s.pos,localToWorld(basis(heading),start));
 if(slot>=5){
  const j=friendly?slot-5:slot-15;
  const az=(j*.63+(initial?0:s.serial*.17))*(friendly?1:-1);
  p[0]=Math.sin(az)*(friendly?670:720);p[2]=(friendly?-275:265)+Math.cos(az)*305;p[1]=135+(j%4)*60;
 }
 p[0]=clamp(p[0],-900,900);p[2]=clamp(p[2],-900,900);
 p[1]=Math.max(p[1],groundAt(p[0],p[2])+48,initial&&friendly?30:94);
 s.bots.push({id:s.serial,slot,team:friendly?0:1,name:formationNames[slot],type:(slot+1)%fleet.length,pos:p,
  yaw:slot>=5?(friendly?.15:Math.PI)+(slot%3-1)*.32:heading+(friendly?0:(slot-2)*.22),pitch:initial&&friendly?.13:0,bank:0,
  ship:fleet[(slot+1)%fleet.length],cruise:friendly?139:113,afterburner:0,angleOffset:0,cobraReady:16+slot*.72,hp:46,phase,speed:friendly?139:113,fireDelay:2.7+(slot%6)*.41,grace:initial?1:1.3,
  target:null,think:1+slot*.3,rollControl:0,pitchControl:0,trail:[],trailTime:0});
}
function burst(s,p){
 for(let i=0;i<14;i++){const a=Math.random()*6.28,v=7+Math.random()*27;s.effects.push({kind:"spark",p:p.slice(),v:[Math.cos(a)*v,Math.random()*28-4,Math.sin(a)*v],life:.68,max:.68})}
 s.effects.push({kind:"blast",p:p.slice(),life:.85,max:.85});
}
function finishMatch(s,winningTeam){
 if(s.ended)return;
 s.ended=winningTeam===null?"draw":winningTeam===0?"win":"loss";
 if(winningTeam===0)s.score+=180+Math.ceil(s.remaining)*2;
}
function hitCraft(s,actor,target,amount){
 if(s.ended||!target||target.hp<=0||actor.team===target.team||target.grace>0||target.protect>0)return;
 target.hp=Math.max(0,target.hp-amount);
 if(actor===s){s.hitFlash=.22;s.score+=15}
 if(target===s)s.damageFlash=.36;
 if(target.hp>0)return;
 s.tally[actor.team]++;burst(s,target.pos);debris(s,target);
 if(actor===s){s.kills++;s.score+=170;notifyFlight(s,"Цель сбита  +170");tone(78,.25,"sawtooth",.07,27)}
 else if(target!==s)notifyFlight(s,actor.name+" сбил "+target.name,1.5);
 if(target===s){
  s.deadFor=3.2;s.maneuver=null;s.angleOffset=0;s.afterburner=0;s.boostLatched=false;s.rockets=[];resetLock(s);notifyFlight(s,"Самолёт потерян",2.7);
 }else{
  s.bots=s.bots.filter(b=>b!==target);
  if(s.lockId===target.id)resetLock(s);
  s.pending.push({slot:target.slot,at:s.t+4.5});
 }
 if(!s.training&&s.tally[actor.team]>=s.m.goal)finishMatch(s,actor.team);
}
function resetPlayer(s){
 const friend=s.bots.find(b=>b.team===0);
 const ahead=friend?friend.yaw:s.m.heading;
 const anchor=friend?friend.pos:s.m.origin;
 s.pos=V.add(anchor,localToWorld(basis(ahead),[-50,90,-220]));
 s.view=null;s.pos[1]=Math.max(s.pos[1],180,groundAt(s.pos[0],s.pos[2])+140);
 s.yaw=s.aimYaw=ahead;s.pitch=s.aimPitch=s.bank=0;s.speed=s.ship.speed;s.hp=s.ship.armor;
 s.protect=3;s.missiles=4;s.reload=0;s.trail=[];resetLock(s);notifyFlight(s,"Возвращение в бой");
}
function advanceBots(s,dt){
 for(const b of s.bots.slice()){
  if(s.ended||b.hp<=0)continue;
  b.grace=Math.max(0,b.grace-dt);b.fireDelay=Math.max(0,b.fireDelay-dt);b.think-=dt;
  if(b.think<=0||!b.target||b.target.hp<=0){
   const opponents=s.bots.filter(x=>x.team!==b.team&&x.hp>0);
   if(b.team===1&&s.hp>0)opponents.push(s);
   let best=Infinity;b.target=null;
   for(const other of opponents){
    const distance=separation(b.pos,other.pos);
    const claimed=s.bots.filter(a=>a!==b&&a.team===b.team&&a.target===other).length;
    const cost=distance+claimed*165+(other===s&&b.slot!==2?150:0);
    if(cost<best){best=cost;b.target=other}
   }
   b.think=1.5+(b.slot%6)*.16;
  }
  let destination;
  if(b.slot===2&&s.t<10)destination=V.add(b.pos,localToWorld(basis(s.m.heading),[5*Math.sin(s.t*.5),6,360]));
  else if(b.slot<2&&(s.t<7||!b.target))destination=V.add(s.pos,localToWorld(basis(s.yaw),[b.slot?38:-39,12+b.slot*7,45]));
  else if(b.target){
   const target=b.target;const range=separation(b.pos,target.pos);
   const side=(b.slot%2?1:-1);
   const orbit=range<220?230:range>820?45:120;
   destination=V.add(target.pos,localToWorld(basis(target.yaw),
    [Math.sin(s.t*.37+b.phase)*orbit+side*orbit*.46,22*Math.sin(s.t*.49+b.phase),range<220?220:-80]));
  }else destination=V.add(s.pos,localToWorld(basis(s.yaw),[120*Math.sin(b.phase),75,420]));
  const delta=V.sub(destination,b.pos),horizontal=Math.hypot(delta[0],delta[2]);
  const wantYaw=Math.atan2(delta[0],delta[2]),error=wrapAngle(wantYaw-b.yaw),turn=clamp(error,-.82,.82);
  const terrain=groundAt(b.pos[0]+Math.sin(b.yaw)*190,b.pos[2]+Math.cos(b.yaw)*190)+80;
  const tilt=clamp(Math.atan2(Math.max(destination[1],terrain,75)-b.pos[1],Math.max(42,horizontal)),-.47,.47);
  const oldBank=b.bank,oldPitch=b.pitch;
  b.yaw=wrapAngle(b.yaw+turn*dt);b.bank+=(clamp(turn*1.42,-1.09,1.09)-b.bank)*(1-Math.exp(-dt*2.5));
  b.pitch+=(tilt-b.pitch)*(1-Math.exp(-dt*2.3));
  b.rollControl=clamp((b.bank-oldBank)/dt,-1,1);b.pitchControl=clamp((b.pitch-oldPitch)/dt*2,-1,1);
  const power=Math.sin(s.t*.27+b.phase)>.67;
  b.afterburner+=((power?1:0)-b.afterburner)*(1-Math.exp(-dt*1.7));
  if(b.ship.cobra&&!b.maneuver&&s.t>b.cobraReady&&b.pos[1]-groundAt(b.pos[0],b.pos[2])>80){
   beginCobra(b,s.t);b.cobraReady=s.t+21+b.slot*.19;
  }
  if(b.maneuver)advanceCobra(b,dt);
  else{b.speed+=(b.cruise*(1+.4*b.afterburner)-b.speed)*(1-Math.exp(-dt*.86));b.pos=V.add(b.pos,V.mul(flightPath(b.yaw,b.pitch),b.speed*dt))}

  b.pos[1]=Math.max(b.pos[1],groundAt(b.pos[0],b.pos[2])+12,24);
  if(!b.maneuver&&b.target&&s.t>8&&b.fireDelay===0){
   const d=V.sub(b.target.pos,b.pos),r=Math.hypot(...d);
   if(r<960&&V.dot(flightPath(b.yaw,b.pitch),d)>r*.72){
    b.fireDelay=(2.4+(b.slot%6)*.14)/(b.team?s.m.enemy:1);
    const evade=b.target===s&&(Math.abs(s.bank)>.75||s.speed>s.ship.speed*1.28);
    const onTarget=!evade&&Math.sin(s.t*1.39+b.phase)>.0;
    const end=onTarget?b.target.pos.slice():V.add(b.target.pos,[22,14,-10]);
    s.effects.push({kind:b.team?"incoming":"friendly",p:b.pos.slice(),end,life:.24,max:.24});
    if(onTarget)hitCraft(s,b,b.target,b.target===s?12:13);
   }
  }
 }
}
function nosePitch(s){return s.pitch+(s.angleOffset||0)}
function gun(s){
 s.fireDelay=.135;const dir=flightPath(s.yaw,s.pitch),b=basis(s.yaw,s.pitch,s.bank);
 let target=null,best=.9955;
 for(const e of s.bots){if(e.team===0)continue;const delta=V.sub(e.pos,s.pos),r=Math.hypot(...delta);
  if(r>1350)continue;const cos=V.dot(dir,delta)/Math.max(r,1);if(cos>best){best=cos;target=e}}
 const end=target?target.pos.slice():V.add(s.pos,V.mul(dir,770));
 for(const side of [-1,1])s.effects.push({kind:"shot",p:V.add(s.pos,localToWorld(b,[side*2.7,-.1,4])),end,life:.14,max:.14});
 tone(142,.065,"sawtooth",.025,51);if(target&&!s.training)hitCraft(s,s,target,12);
}
function trackTarget(s,dt){
 const aim=flightPath(s.aimYaw,s.aimPitch),nose=flightPath(s.yaw,nosePitch(s));
 let candidate=null,best=-Infinity;
 for(const e of s.bots){
  if(e.team!==1||e.hp<=0)continue;
  const d=V.sub(e.pos,s.pos),range=Math.hypot(...d);
  if(range<1||range>1600||V.dot(nose,d)<range*.72)continue;
  const alignment=V.dot(aim,d)/range,previous=e.id===s.lockId;
  const radius=s.captureAngle||.095;
  if(alignment<Math.cos(radius*(previous?1.27:1)))continue;
  const preference=alignment+(previous?.01:0);
  if(preference>best){best=preference;candidate=e}
 }
 if(!candidate){resetLock(s);return}
 if(candidate.id!==s.lockId){s.lockId=candidate.id;s.lockProgress=0}
 const before=s.lockProgress;s.lockProgress=Math.min(1,s.lockProgress+dt/.95);
 if(before<1&&s.lockProgress===1)tone(720,.11,"sine",.05,1080);
}
function launchMissile(s){
 if(!s||s.ended||s.hp<=0||s.t<4||s.maneuver)return false;
 if(s.missiles<=0||s.launchDelay>0){notifyFlight(s,"Идёт перезарядка",.8);return false}
 const target=s.bots.find(e=>e.id===s.lockId&&e.team===1&&e.hp>0);
 if(!target||s.lockProgress<1){notifyFlight(s,"Удерживай круг на красной метке",1.2);return false}
 const start=V.add(s.pos,localToWorld(basis(s.yaw,s.pitch,s.bank),[s.missiles%2?3:-3,-.6,1]));
 s.rockets.push({targetId:target.id,start,p:start.slice(),last:target.pos.slice(),elapsed:0,
  duration:clamp(separation(start,target.pos)/570,.55,2.45),trail:[],trailTime:0});
 s.missiles--;s.launchDelay=1.1;if(!s.reload)s.reload=9;resetLock(s);
 sfx("rocket");notifyFlight(s,"Ракета в воздухе",.8);return true;
}
function advanceMissiles(s,dt){
 for(const r of s.rockets.slice()){
  r.elapsed+=dt;const t=Math.min(1,r.elapsed/r.duration);
  const target=s.bots.find(e=>e.id===r.targetId&&e.team===1);
  if(target)r.last=target.pos.slice();
  r.p=r.start.map((v,i)=>v+(r.last[i]-v)*t);r.p[1]+=Math.sin(Math.PI*t)*9;
  r.trailTime-=dt;if(r.trailTime<=0){r.trail.push(r.p.slice());if(r.trail.length>12)r.trail.shift();r.trailTime=.055}
  if(t>=1){s.rockets=s.rockets.filter(x=>x!==r);if(target){hitCraft(s,s,target,55);if(s.training&&target.hp===0)finishMatch(s,0)}else burst(s,r.p)}
 }
}
function recordTrail(craft,dt,type){
 craft.trailTime-=dt;if(craft.trailTime>0)return;craft.trailTime=.075;
 const b=basis(craft.yaw,nosePitch(craft),craft.bank),span=type===2?8.0:type===1?5.8:6.55;
 craft.trail.push([-1,1].map(side=>V.add(craft.pos,localToWorld(b,[side*span,.04,-2.65]))));
 if(craft.trail.length>12)craft.trail.shift();
}
function simulate(s,dt,input){
 if(s.ended)return;s.t+=dt;
 const before=new Map([s,...s.bots].map(c=>[c.id,c.pos.slice()]));updateVessels(s,dt);updateFragments(s,dt);
 s.fireDelay=Math.max(0,s.fireDelay-dt);s.launchDelay=Math.max(0,s.launchDelay-dt);s.protect=Math.max(0,s.protect-dt);
 s.hitFlash=Math.max(0,s.hitFlash-dt);s.damageFlash=Math.max(0,s.damageFlash-dt);
 if(s.reload>0){s.reload-=dt;if(s.reload<=0){s.missiles=Math.min(4,s.missiles+1);s.reload=s.missiles<4?9:0}}
 if(s.t<=4){
  const t=s.t;s.afterburner+=((input.boost?1:0)-s.afterburner)*(1-Math.exp(-dt*2.4));s.pos=V.add(s.m.origin,localToWorld(basis(s.m.heading),[-4,(s.mission===2?18.3:9.3)+Math.max(0,t-1.55)**1.65*19,-97+37*t+9*t*t]));
  s.speed=35+28*t;s.pitch=t<1.55?0:.14*Math.sin(Math.min(1,(t-1.55)/.7)*Math.PI*.5);
 }else{
  if(!s.training&&!s.serial)for(let slot=0;slot<s.count;slot++)spawnBot(s,slot,true);
  if(!s.training)s.remaining=Math.max(0,s.remaining-dt);
  if(!s.remaining){finishMatch(s,s.tally[0]===s.tally[1]?null:s.tally[0]>s.tally[1]?0:1);return}
  if(s.deadFor>0){s.deadFor-=dt;if(s.deadFor<=0)resetPlayer(s)}
  else{
   s.aimYaw=wrapAngle(s.aimYaw+(input.x||0)*1.25*dt);
   s.aimPitch=clamp(s.aimPitch+(input.y||0)*.77*dt,-.82,.82);
   const err=wrapAngle(s.aimYaw-s.yaw),oldBank=s.bank,oldPitch=s.pitch;
   const steer=clamp(err*2.7,-1,1);
   s.bank+=(steer*1.18-s.bank)*(1-Math.exp(-3.9*dt));
   s.yaw=wrapAngle(s.yaw+clamp(err*2.25,-1.12,1.12)*s.ship.turn*dt);
   s.pitch+=(s.aimPitch-s.pitch)*(1-Math.exp(-2.7*s.ship.turn*dt));
   s.rollControl=clamp((s.bank-oldBank)/dt,-1,1);s.pitchControl=clamp((s.pitch-oldPitch)/dt*2,-1,1);
   s.afterburner+=((input.boost?1:0)-s.afterburner)*(1-Math.exp(-dt*(input.boost?2.5:3.2)));
   if(s.maneuver)advanceCobra(s,dt);
   else {
    s.speed+=((1+.55*s.afterburner)*s.ship.speed-s.speed)*(1-Math.exp(-dt*1.08));
    s.pos=V.add(s.pos,V.mul(flightPath(s.yaw,s.pitch),s.speed*dt));
   }
   s.pos[1]=Math.min(2600,s.pos[1]);
   if(s.pos[1]<Math.max(2,groundAt(s.pos[0],s.pos[2])+3)){
    s.maneuver=null;s.angleOffset=0;groundImpact(s);
   }else{if(!s.maneuver){trackTarget(s,dt);if(input.fire&&s.fireDelay===0)gun(s)}recordTrail(s,dt,s.plane)}
  }
  if(!s.ended){if(s.training)trainingStep(s,dt);else advanceBots(s,dt);advanceMissiles(s,dt);
   if(!s.training)airContacts(s,before);returnToMap(s,dt);
   for(const b of s.bots)recordTrail(b,dt,b.type);
   for(const p of (s.training?[]:s.pending).filter(p=>p.at<=s.t))spawnBot(s,p.slot);
   s.pending=s.pending.filter(p=>p.at>s.t)}
 }
 for(const fx of s.effects){fx.life-=dt;if(fx.v)fx.p=V.add(fx.p,V.mul(fx.v,dt))}
 s.effects=s.effects.filter(f=>f.life>0);
}

function startCobra(s){
 if(!s?.ship.cobra||s.hp<=0||s.ended||s.maneuver)return false;
 if(s.t<4){notifyFlight(s,"Сначала дождись взлёта");return false}
 if(s.t<s.cobraReady){notifyFlight(s,"Манёвр готов через "+Math.ceil(s.cobraReady-s.t)+" с");return false}
 beginCobra(s,s.t);resetLock(s);notifyFlight(s,"Кобра",1.2);return true;
}
function beginCobra(c,now){
 c.maneuver={time:0,startSpeed:c.speed,heading:c.yaw,rise:Math.max(4,Math.sin(c.pitch)*c.speed*.35)};c.cobraReady=now+6.5;
}
function advanceCobra(s,dt){
 const m=s.maneuver;m.time+=dt;const t=m.time,smooth=x=>{const k=clamp(x,0,1);return k*k*(3-2*k)};
 // Arcade pitch animation is independent of the direction of travel.
 const lift=smooth(t/.8),recover=smooth((t-1.13)/1.32);
 s.angleOffset=1.52*lift*(1-recover);
 const target=t<1.3?m.startSpeed*(1-.89*lift):s.ship.speed*(1+.55*s.afterburner);
 s.speed+=(target-s.speed)*(1-Math.exp(-dt*(t<1.3?4.9:1.65)));
 const noseUp=lift*(1-recover);
 const heading=wrapAngle(m.heading+wrapAngle(s.yaw-m.heading)*recover);
 s.pos=V.add(s.pos,V.mul(flightPath(heading,s.pitch*(1-noseUp)),s.speed*dt));
 s.pos[1]+=(m.rise*(1-lift)+8*lift*(1-recover)-9*smooth((t-.76)/.5)*(1-recover))*dt;
 s.bank*=Math.exp(-dt*4*noseUp);
 if(t>=2.45){s.maneuver=null;s.angleOffset=0}
}
