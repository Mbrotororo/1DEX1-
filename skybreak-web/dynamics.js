"use strict";
function deployFleet(s){
 s.vessels=[0,1].map(team=>({team,name:team?"Эскорт Грифа":"Эскорт Вектора",pos:[0,0,0],yaw:0,wait:5+team,phase:team*2.2}));
 s.fragments=[];s.contactTime=new Map();s.groundCooldown=0;s.guidance=false;
}
function updateVessels(s,dt){
 for(const v of s.vessels){
  const z=(v.team?380:-400)+160*Math.sin(s.t*.038+v.phase);
  const x=mapIndex===0?625+58*Math.sin(z*.004):mapIndex===1?480+115*Math.sin(z*.0035):(v.team?240:-330)+45*Math.sin(s.t*.055+v.phase);
  const last=v.pos;v.pos=[x,.25*Math.sin(s.t*1.2+v.phase),z];
  if(separation(v.pos,last)<5)v.yaw=Math.atan2(x-last[0],z-last[2]);
  v.wait-=dt;if(s.t<9||s.training||v.wait>0)continue;
  const all=[s,...s.bots].filter(c=>c.hp>0&&c.team!==v.team);
  const target=all.sort((a,b)=>separation(a.pos,v.pos)-separation(b.pos,v.pos))[0];
  if(!target||separation(target.pos,v.pos)>630)continue;
  v.wait=3.5+v.team*.38;const hit=Math.sin(s.t+v.phase)>.24;
  s.effects.push({kind:v.team?"incoming":"friendly",p:V.add(v.pos,[0,6,12]),end:V.add(target.pos,hit?[0,0,0]:[22,17,-8]),life:.29,max:.29});
  if(hit)hitCraft(s,v,target,target===s?7:9);
  if(separation(s.pos,v.pos)<410)sfx("deck",.32);
 }
}
function debris(s,c,scale=1){
 const fwd=flightPath(c.yaw,c.pitch);for(let j=0;j<8;j++){const a=j*2.399+Math.random()*.35;
 s.fragments.push({p:c.pos.slice(),v:V.add(V.mul(fwd,c.speed*.33),[Math.cos(a)*18,10+Math.sin(a*3)*12,Math.sin(a)*18]),r:[a,.3,a*.7],spin:[2.3*Math.sin(a),3*Math.cos(a),1.4],life:2.8,size:(.6+j*.16)*scale})}
 if(s.fragments.length>64)s.fragments.splice(0,s.fragments.length-64);
}
function updateFragments(s,dt){
 for(const f of s.fragments){f.life-=dt;f.v[1]-=26*dt;f.p=V.add(f.p,V.mul(f.v,dt));f.r=V.add(f.r,V.mul(f.spin,dt));const h=groundAt(f.p[0],f.p[2]);if(f.p[1]<Math.max(0,h)){f.p[1]=Math.max(0,h)+.05;if(h<0)f.life=0;else{f.v=[f.v[0]*.65,Math.abs(f.v[1])*.32,f.v[2]*.65];f.spin=V.mul(f.spin,.72)}}}s.fragments=s.fragments.filter(f=>f.life>0);
}
function groundImpact(s){
 if(s.groundCooldown>s.t)return;
 const n=terrainNormal(s.pos),v=V.mul(flightPath(s.yaw,s.pitch),s.speed),vn=V.dot(v,n);
 s.pos[1]=Math.max(0,groundAt(s.pos[0],s.pos[2]))+3.8;s.groundCooldown=s.t+.36;
 const bounced=V.sub(v,V.mul(n,Math.min(0,vn)*1.42));s.speed=clamp(Math.hypot(...bounced)*.76,35,200);
 s.pitch=s.aimPitch=clamp(Math.atan2(bounced[1],Math.hypot(bounced[0],bounced[2]))+.05,-.7,.7);s.yaw=s.aimYaw=Math.atan2(bounced[0],bounced[2]);
 s.protect=0;sfx("impact");debris(s,s,.7);hitCraft(s,{team:1,name:"Рельеф"},s,Math.max(16,Math.abs(vn)*2.1));notifyFlight(s,"Удар о поверхность");
}
function airContacts(s,before){
 const craft=[s,...s.bots].filter(c=>c.hp>0);
 for(let i=0;i<craft.length;i++)for(let j=i+1;j<craft.length;j++){
 const a=craft[i],b=craft[j],key=Math.min(a.id,b.id)+"/"+Math.max(a.id,b.id);if((s.contactTime.get(key)||0)>s.t||a.hp<=0||b.hp<=0)continue;
 if(Math.abs(a.pos[0]-b.pos[0])>19||Math.abs(a.pos[1]-b.pos[1])>19||Math.abs(a.pos[2]-b.pos[2])>19)continue;
 const old=V.sub(before.get(a.id)||a.pos,before.get(b.id)||b.pos),now=V.sub(a.pos,b.pos),delta=V.sub(now,old),t=clamp(-V.dot(old,delta)/Math.max(.0001,V.dot(delta,delta)),0,1),near=V.add(old,V.mul(delta,t));
 if(Math.hypot(...near)>6.7)continue;
 s.contactTime.set(key,s.t+1.1);
 const n=V.unit(Math.hypot(...near)>.1?near:Math.hypot(...old)>.1?old:[1,.12,0]),va=V.mul(flightPath(a.yaw,a.pitch),a.speed),vb=V.mul(flightPath(b.yaw,b.pitch),b.speed);
 const impulse=Math.max(8,-V.dot(V.sub(va,vb),n))*.61,damage=clamp(impulse*1.12,12,180);
 for(const [c,v,other,k] of [[a,va,b,1],[b,vb,a,-1]]){
  const out=V.add(v,V.mul(n,k*impulse));c.pos=V.add(c.pos,V.mul(n,k*3.5));c.yaw=Math.atan2(out[0],out[2]);c.pitch=Math.atan2(out[1],Math.hypot(out[0],out[2]));c.speed=Math.max(44,Math.hypot(...out)*.82);c.bank=clamp(c.bank+k*.48,-1.4,1.4);
  if(c===s){s.aimYaw=c.yaw;s.aimPitch=c.pitch;notifyFlight(s,"Столкновение");sfx("impact")}
  if(c.hp>0){debris(s,c,.45);hitCraft(s,other.team!==c.team?other:{team:1-c.team,name:"Столкновение"},c,damage)}
 }
 }
}
function returnToMap(s,dt){
 for(const c of [s,...s.bots]){if(c.hp<=0)continue;const x=c.pos[0],z=c.pos[2],edge=Math.max(Math.abs(x),Math.abs(z));
 if(edge<820)continue;const dir=flightPath(c.yaw,c.pitch),out=(Math.abs(x)>Math.abs(z)?Math.sign(x)*dir[0]:Math.sign(z)*dir[2]);
 if(out>0){const home=Math.atan2(-x,-z),err=wrapAngle(home-c.yaw);c.yaw=wrapAngle(c.yaw+clamp(err,-1.8,1.8)*dt*2.3);if(c===s){s.aimYaw=wrapAngle(s.aimYaw+wrapAngle(home-s.aimYaw)*Math.min(1,dt*3));if(edge>910)notifyFlight(s,"Граница карты · разворот",.35)}}
 c.pos[0]=clamp(c.pos[0],-999.9,999.9);c.pos[2]=clamp(c.pos[2],-999.9,999.9);
 }
}
function extraObjects(s){
 const o=s.vessels.map(v=>[vesselMesh,v.pos,basis(v.yaw,0,.022*Math.sin(s.t+v.phase)),1,0]);
 for(const r of s.rockets){const d=V.sub(r.last,r.p);o.push([rocketMesh,r.p,basis(Math.atan2(d[0],d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2]))),1.2,2])}
 if(!cockpit&&s.hp>0){const b=basis(s.yaw,nosePitch(s),s.bank);for(let j=0;j<Math.min(4,s.missiles);j++){const x=(j%2?1:-1)*(j<2?2.5:3.8);o.push([rocketMesh,V.add(s.pos,localToWorld(b,[x,-.62,.14])),b,.9,2])}}
 for(const f of s.fragments)o.push([wreckMesh,f.p,basis(...f.r),f.size,2]);return o;
}

function trainingStep(s,dt){
 if(s.hp<=0)return;
 if(!s.stage){
  s.turnTravel+=Math.min(.05,Math.abs(wrapAngle(s.yaw-(s.lastTrainingYaw??s.yaw))));
  s.lastTrainingYaw=s.yaw;
  if(s.turnTravel<.18)return;
  s.stage=1;spawnBot(s,2,true);
  const b=s.bots[0];b.name="Мишень";b.grace=0;b.hp=32;b.type=3;
 }
 const b=s.bots[0];if(!b)return;
 // The instructor tows a practice target ahead through the entire exercise.
 const desired=V.add(s.pos,localToWorld(basis(s.yaw,s.pitch),[6*Math.sin(s.t*.6),4,255]));
 if(!b.inPlace){b.inPlace=true;b.pos=desired}else b.pos=b.pos.map((v,i)=>v+(desired[i]-v)*(1-Math.exp(-dt*3)));
 b.yaw=s.yaw;b.pitch=s.pitch;b.bank=s.bank*.7;
 if(s.lockProgress>=1)s.stage=2;
}
