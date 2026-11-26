"use strict";
const V={
 add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,s)=>a.map(v=>v*s),
 dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
 unit:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n)}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function basis(yaw=0,pitch=0,bank=0){
 const s=Math.sin(yaw),c=Math.cos(yaw),p=Math.sin(pitch),q=Math.cos(pitch),b=Math.sin(bank),a=Math.cos(bank);
 return [[c*a+s*p*b,-q*b,-s*a+c*p*b],[c*b-s*p*a,q*a,-s*b-c*p*a],[s*q,p,c*q]];
}
function localToWorld(b,p){return [0,1,2].map(i=>b[0][i]*p[0]+b[1][i]*p[1]+b[2][i]*p[2])}
const fleet=[
 {code:"F-19",name:"Сокол",role:"Истребитель",turn:1.07,speed:157,armor:100,color:[.37,.43,.45]},
 {code:"V-27",name:"Фантом",role:"Перехватчик",turn:.89,speed:185,armor:90,color:[.31,.38,.46]},
 {code:"A-12",name:"Шторм",role:"Штурмовик",turn:.95,speed:139,armor:135,color:[.41,.42,.35]},
 {code:"D-36",name:"Мираж",role:"Дельта-истребитель",turn:1.25,speed:172,armor:96,color:[.49,.48,.43]},
 {code:"X-52",name:"Призрак",role:"Стелс-истребитель",turn:1.1,speed:203,armor:113,color:[.25,.29,.33]},
 {code:"Су-27",name:"Фланкер",role:"Манёвренный истребитель",turn:1.21,speed:174,armor:106,color:[.43,.60,.70],cobra:true}
];
const missions=[
 {title:["Красный","каньон"],area:"Пустыня",origin:[0,0,-720],heading:0,goal:3,time:150,enemy:.93,haze:[.91,.78,.63]},
 {title:["Полярный","фьорд"],area:"Зима",origin:[0,0,-720],heading:0,goal:5,time:180,enemy:1.05,haze:[.79,.87,.94]},
 {title:["Дальний","риф"],area:"Океан",origin:[0,0,-720],heading:0,goal:7,time:210,enemy:1.15,haze:[.75,.84,.88]}
];
function makeAircraft(type){
 const faces=[],base=fleet[type].color, dark=[.12,.16,.18],glass=[.15,.31,.35],metal=[.46,.5,.50],orange=[.92,.40,.15];
 const shade=(c,k)=>c.map(v=>Math.min(1,v*k));
 let material=0,control=0;
 const face=(v,c,normals)=>faces.push({v,c,material,control,normals});const mirrors=(pts,s)=>pts.map(([x,y,z])=>[x*s,y,z]);
 function tube(xs,ys,rings,n,col){let prev=null;rings.forEach(([z,w,h,dy=0],i)=>{
 const ring=Array.from({length:n},(_,j)=>{const a=j*Math.PI*2/n;return [xs+Math.cos(a)*w,ys+dy+Math.sin(a)*h,z]});
 if(prev)for(let j=0;j<n;j++){let k=(j+1)%n;const pts=[prev[j],prev[k],ring[k],ring[j]],slope=(rings[i-1][1]-w)/Math.max(.03,z-rings[i-1][0]);
 const ns=[j,k,k,j].map(index=>V.unit([Math.cos(index*2*Math.PI/n),Math.sin(index*2*Math.PI/n),clamp(slope,-2,2)]));
 face(pts,shade(col,(i%3===0?.975:1)),ns)}else face(ring,col);
 prev=ring;});face(prev,shade(col,.55));}
 function wing(pts,s,col,thick=.22){
 const top=mirrors(pts,s),bottom=top.map(([x,y,z])=>[x,y-thick,z]);face(top,col);face(bottom,shade(col,.73));top.forEach((v,i)=>{const j=(i+1)%top.length;face([v,top[j],bottom[j],bottom[i]],shade(col,.76))});
 }
 const wide=type===2?1.28:type===1?.89:type===3?1.20:type===4?1.09:1,long=type===1?1.16:type===4?1.12:1;
 tube(0,0,[[-6,.66,.57],[-5,1,.83],[-2,1.3,.97],[1,1.21,1],[3,1.05,.84],[5,.76,.72],[6.9,.45,.43],[8.9*long,.035,.04]],20,base);
 material=1;
 tube(0,.64,[[1.15,.38,.28],[2,.79,.61],[3.4,.78,.88],[4.9,.60,.59],[5.8,.17,.20]],20,glass);
 material=2;
 tube(0,.66,[[2.65,.78,.8],[2.76,.79,.82]],16,dark);
 material=0;
 for(const s of [-1,1]){
 let spread=(type===2?6.4:6.7)*wide;
 wing([[.7,.17,type===3?5.6:type===4?4.7:3.7],[spread,.05,type===1?-3.3:type===2?-.5:type===3?-4.3:type===4?-1.2:-1.8],[spread-.24,.05,type===2?-2.3:type===3?-4.9:-3.1],[3.15,.1,-4.4],[.78,.19,-4.25]],s,base);
 wing([[2.2,.235,1.43],[spread-.5,.1,type===2?-.67:-2.02],[spread-.73,.105,type===2?-.98:-2.3],[2.56,.23,1.1]],s,shade(base,1.32),.014);
 control=1;
 wing([[2.1,.22,-2.1],[spread-.3,.07,-2.6],[3.2,.145,-3.98],[2.1,.22,-3.83]],s,shade(base,.83),.025);
 control=2;
 if(type!==3)wing([[.55,.25,-4],[type===1?4:3.55,.3,-6.05],[3.35,.31,-7.03],[.72,.27,-6.75]],s,shade(base,1.06));
 control=0;
 const tx=type===1?.93:1.08;
 wing([[tx,.46,-2.95],[tx+.82,2.9,-4.95],[tx+.89,2.85,-6.12],[tx+.35,.42,-5.9]],s,shade(base,.88),.09);
 wing([[tx+.72,2.5,-4.92],[tx+.82,2.89,-4.97],[tx+.89,2.85,-6.12],[tx+.8,2.50,-6.09]],s,orange,.025);
 tube(s*.88,-.14,[[-6.15,.53,.50],[-5.15,.73,.63],[-2.9,.77,.7],[.6,.66,.58],[2.1,.42,.42]],10,shade(base,.9));
 material=2;
 tube(s*.88,-.14,[[-6.48,.49,.48],[-6.13,.55,.53],[-5.57,.6,.57]],12,dark);
 material=3;
 tube(s*.88,-.14,[[-6.51,.34,.32],[-6.48,.41,.39]],10,orange);
 material=2;
 for(let j=0;j<16;j++){
  const a=j*Math.PI/8,b=(j+.84)*Math.PI/8,ring=(t,r,z)=>[s*.88+r*Math.cos(t),-.14+r*Math.sin(t),z];
  face([ring(a,.51,-6.54),ring(b,.51,-6.54),ring(b,.61,-5.78),ring(a,.61,-5.78)],shade(metal,j%2?.8:1.08));
 }
 material=0;
 tube(s*1.15,-.16,[[-1.1,.52,.44],[1.2,.61,.51],[2.09,.49,.37]],8,metal);
 face(mirrors([[.86,-.44,2.12],[1.57,-.43,2.12],[1.69,.09,2.12],[.86,.12,2.12]],s),dark);
 // Painted markings sit flush with the left and right wing skins.
 material=4;
 const stripe=(x,z,w,l)=>face(mirrors([[x,.26,z],[x+w,.26,z-.07],[x+w,.26,z-l],[x,.26,z-l+.07]],s),[.79,.84,.82]);
 stripe(3.62,-1.10,.14,.73);stripe(3.90,-1.22,.12,.62);
 if(s===-1){
  const cx=3.08,cz=-1.28;const circle=(r,y,col)=>face(Array.from({length:16},(_,j)=>[s*(cx+r*Math.cos(j*Math.PI/8)),y,cz+r*Math.sin(j*Math.PI/8)]),col);
  circle(.44,.264,[.74,.79,.80]);circle(.315,.277,[.21,.31,.40]);
  face(mirrors([[cx,.288,cz+.23],[cx+.15,.288,cz-.13],[cx,.288,cz-.04],[cx-.15,.288,cz-.13]],s),[.88,.88,.8]);
 }
 // The separate rudder and its hinge move when the aircraft turns.
 material=0;control=3;
 wing([[tx+.23,.70,-5.63],[tx+.78,2.63,-5.78],[tx+.82,2.66,-6.10],[tx+.36,.60,-5.99]],s,shade(base,.76),.025);
 control=0;
 if(type===1||type===3)wing([[.8,.28,4.6],[2.7,.24,2.5],[1,.31,1.9]],s,shade(base,1.2));
 if(type===2)tube(3.5*s,-.39,[[-3.6,.17,.19],[-2,.345,.34],[.8,.32,.31],[1.6,.05,.055]],8,shade(base,.74));
 }
 for(const s of [-1,1]){material=2;tube(s*2.5,-.32,[[-2.4,.09,.15],[1.55,.08,.13]],10,dark);
 for(let j=0;j<7;j++)wing([[1.23,.62,.15-j*.19],[1.58,.51,-.05-j*.19],[1.55,.52,-.11-j*.19],[1.23,.62,.09-j*.19]],s,dark,.017);}
 if(type>=3)for(const f of faces)f.v=f.v.map(([x,y,z])=>type===3&&z<-2.9&&y>.48?[x*.19,y*1.22,z-.25]:type===4?[x*(1+.28*Math.max(0,1-Math.abs(z-2)/8))+(y>1.3&&z<-2?Math.sign(x)*y*.32:0),y*.88,z]:[x,y,z]);
 return faces;
}
const planeMeshes=fleet.map((_,i)=>i===5?makeFlanker():makeAircraft(i));

// Distant aircraft retain their model-specific planform while the software renderer
// spends its budget on the aircraft close enough to show cockpit and panel details.
const distantAircraft=planeMeshes.map((faces,i)=>{
 const body=meshBuilderForDistance(fleet[i].color,i===1||i===4?9.8:8.9);
 return body.concat(faces.filter(f=>!f.normals&&f.material===0&&f.v.length>=3&&Math.hypot(...V.cross(V.sub(f.v[1],f.v[0]),V.sub(f.v[2],f.v[0])))>1.3));
});
function meshBuilderForDistance(c,nose){
 const ring=[[-1.2,0,0],[0,.9,0],[1.2,0,0],[0,-.7,0]];
 return ring.flatMap((p,i)=>{const q=ring[(i+1)%4];return [{v:[p,q,[0,0,nose]],c},{v:[p,[0,0,-6],q],c}]});
}
