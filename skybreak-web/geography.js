"use strict";
let mapIndex=0;
function groundAt(x,z,index=mapIndex){
 const hill=(a,b,w,l,h)=>h*Math.exp(-Math.pow((x-a)/w,2)-Math.pow((z-b)/l,2));
 const strip=Math.exp(-Math.pow(x/102,4)-Math.pow((z+720)/270,4));
 if(index===2)return -51+hill(-680,80,240,430,264)+hill(620,530,300,220,213)+hill(800,-660,155,250,146)+hill(-650,-770,155,185,123);
 const canyon=index===0,river=canyon?625+58*Math.sin(z*.004):480+115*Math.sin(z*.0035);
 let h=hill(-620,155,265,340,canyon?285:465)+hill(canyon?220:55,590,235,270,canyon?210:345)+hill(-680,-620,245,205,198);
 h+=canyon?28*Math.tanh((h-86)/15)+9*Math.sin(x*.023+z*.012)+32:9*Math.sin(z*.031-x*.014)*Math.min(1,h/125);
 const ledge=(cx,cz,rx,rz)=>Math.max(Math.abs((x-cx)/rx),Math.abs((z-cz)/rz)+.17*Math.abs((x-cx)/rx));
 if(canyon){h+=95*clamp((1.10-ledge(-430,-115,165,110))*3,0,1)+115*clamp((1.1-ledge(240,500,190,165))*3,0,1)}
 else{h+=105*Math.max(0,1-ledge(-560,130,210,270))+88*Math.max(0,1-ledge(95,550,155,220))}
 return (20+h-hill(river,0,canyon?107:154,3500,115))*(1-strip)+7*strip;
}
function meshBuilder(){
 const faces=[],face=(v,c,material=0)=>faces.push({v,c,material});
 function box(x,y,z,w,h,l,c){const pts=[[-w,-l],[w,-l],[w,l],[-w,l]].map(([a,b])=>[x+a,y,z+b]);const top=pts.map(a=>[a[0],y+h,a[2]]);face(top,c);pts.forEach((a,i)=>{const j=(i+1)%4;face([a,pts[j],top[j],top[i]],c)})}
 function tube(x,y,rings,c){let prev;for(const [z,r] of rings){const q=Array.from({length:14},(_,i)=>[x+r*Math.cos(i*Math.PI/7),y+r*Math.sin(i*Math.PI/7),z]);if(prev)q.forEach((p,i)=>{const j=(i+1)%14;face([p,q[j],prev[j],prev[i]],c)});else face(q,c);prev=q}face(prev,c)}
 return {faces,face,box,tube};
}
const rocketMesh=(()=>{const m=meshBuilder(),c=[.8,.82,.79];m.tube(0,0,[[-1.85,.12],[-1.65,.18],[1.1,.18],[1.52,.13],[1.91,.01]],c);for(const z of [-1.5,.7])m.tube(0,0,[[z,.186],[z+.14,.186]],[.89,.55,.12]);for(let j=0;j<4;j++){const fin=(r,z)=>[Math.cos(j*Math.PI/2)*r,Math.sin(j*Math.PI/2)*r,z];m.face([fin(.16,-.65),fin(.51,-1.35),fin(.52,-1.69),fin(.16,-1.63)],[.24,.27,.28]);m.face([fin(.16,.75),fin(.33,.35),fin(.16,.31)],c)}return m.faces})();
const vesselMesh=(()=>{const m=meshBuilder(),steel=[.40,.46,.47],light=[.57,.61,.60],c=[.28,.32,.33];
 const q=[[-5,-34],[5,-34],[7,-18],[5.8,22],[0,39],[-5.8,22],[-7,-18]].map(([x,z])=>[x,3,z]);m.face(q,c);q.forEach((p,i)=>{const a=q[(i+1)%q.length];m.face([p,a,[a[0]*.7,-2,a[2]*.96],[p[0]*.7,-2,p[2]*.96]],steel)});
 m.box(0,3,-3,4.2,5,13,steel);m.box(0,8,-1,3.2,3,5.8,light);m.box(0,10,-1,3.24,.75,5.9,[.12,.22,.25]);m.box(0,11,-2,.34,8,.46,c);m.box(0,17,-2,3,.55,.42,light);m.box(0,8,-11,1.7,4,2,c);
 for(const z of [-23,19]){m.box(0,3,z,2,2,2,light);m.tube(0,5,[[z,.32],[z+5,.22]],steel)}return m.faces})();
const runwayMesh=(()=>{const m=meshBuilder();m.box(0,0,0,19,.2,121,[.27,.29,.29]);for(let z=-108;z<115;z+=16)m.box(0,.23,z,.33,.04,4,[.88,.85,.72]);for(const x of [-18,18])m.box(x,.23,0,.18,.03,117,[.83,.81,.70]);m.box(47,0,-61,10,7,14,[.40,.40,.36]);m.box(47,7,-61,3,6,4,[.45,.45,.42]);m.box(47,13,-61,4,2,4,[.2,.29,.32]);return m.faces})();
const wreckMesh=[{v:[[-1,0,0],[.9,.09,-.5],[.6,.3,1.2],[-.5,.02,1]],c:[.23,.26,.26]}];
