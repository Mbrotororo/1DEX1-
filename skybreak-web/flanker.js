"use strict";

// Exterior artwork for the Flanker. Coordinates and proportions share the game's
// model space. The unfinished side of each coloured panel is hidden by the skin.
function makeFlanker(){
 const faces=[],base=[.43,.60,.70],blue=[.25,.43,.55],pale=[.59,.73,.76],
  light=[.69,.75,.74],belly=[.60,.68,.70],dark=[.11,.16,.18],rubber=[.07,.10,.11],
  steel=[.37,.42,.42],charcoal=[.23,.29,.31],radome=[.55,.59,.56],
  glazing=[.14,.28,.32],silver=[.64,.69,.69],cream=[.89,.86,.72],brick=[.67,.23,.20];
 const ringCount=28,tau=2*Math.PI;
 function unit(p){const l=Math.hypot(...p)||1;return p.map(q=>q/l)}
 function mul(c,k){return c.map(x=>Math.max(0,Math.min(.99,x*k)))}
 function face(v,c,material=0,control=0,normals){faces.push({v,c,material,control,normals})}
 function sample(stations,z){
  if(z<=stations[0][0])return stations[0].slice(1);
  for(let i=1;i<stations.length;i++)if(z<=stations[i][0]){
   const a=stations[i-1],b=stations[i],t=(z-a[0])/(b[0]-a[0]);return a.slice(1).map((v,k)=>v+(b[k+1]-v)*t)
  }
  return stations[stations.length-1].slice(1)
 }
 // A profile stores longitudinal position, centre height and the two radii.
 function at(profile,x,z,a,offset=0){
  const [y,w,h]=sample(profile,z);return [x+(w+offset)*Math.cos(a),y+(h+offset)*Math.sin(a),z]
 }
 function normal(profile,z,a){
  const [loY,loW,loH]=sample(profile,z-.025),[hiY,hiW,hiH]=sample(profile,z+.025);
  const [,w,h]=sample(profile,z),nx=Math.cos(a)/Math.max(.01,w),ny=Math.sin(a)/Math.max(.01,h);
  return unit([nx,ny,-(nx*(hiW-loW)*Math.cos(a)+ny*((hiY-loY)+(hiH-loH)*Math.sin(a)))/.05])
 }
 function loft(profile,x,n,c,material=0,paint=null){
  for(let i=1;i<profile.length;i++){
   const z0=profile[i-1][0],z1=profile[i][0];
   for(let j=0;j<n;j++){
    const a=j*tau/n,b=(j+1)*tau/n,za=[[z0,a],[z0,b],[z1,b],[z1,a]];
    face(za.map(([z,t])=>at(profile,x,z,t)),paint?paint((z0+z1)/2,(a+b)/2):c,material,0,za.map(([z,t])=>normal(profile,z,t)));
   }
  }
  for(const i of [0,profile.length-1]){
   const z=profile[i][0],cap=Array.from({length:n},(_,j)=>at(profile,x,z,(i?j:n-j)*tau/n));face(cap,c,material)
  }
 }
 function seam(profile,x,z,width,a,b,c,material=4){
  const n=Math.max(3,Math.ceil((b-a)*4));for(let j=0;j<n;j++){
   const lo=a+(b-a)*j/n,hi=a+(b-a)*(j+1)/n;
   face([[z,lo],[z,hi],[z+width,hi],[z+width,lo]].map(([s,t])=>at(profile,x,s,t,.01)),c,material)
  }
 }
 function patch(v,c,material=0,control=0){face(v,c,material,control)}
 const hull=[
  [-8.48,.11,.035,.045],[-8.04,.09,.18,.16],[-6.64,.05,.36,.30],[-5.05,.06,.66,.48],[-3.2,.09,1.08,.56],
  [-1.6,.14,1.27,.63],[.1,.17,1.23,.66],[1.9,.13,1.05,.69],[3.38,.13,.88,.72],
  [4.64,.11,.76,.65],[5.65,.08,.63,.54],[6.45,.035,.52,.44],[7.10,.0,.44,.35],
  [8.3,-.055,.29,.25],[9.34,-.12,.115,.11],[9.85,-.15,.025,.025]
 ];
 loft(hull,0,ringCount,base,0,(z,a)=>z>6.44?radome:Math.sin(a)<-.15?belly:base);
 // Camo stripes wrap from the shoulder onto the upper fuselage.
 for(const [start,end,angle,width,paint] of [[-4.8,.3,.15,1.50,blue],[-2.4,3.8,1.65,.84,pale],[2.0,5.94,.70,1.20,blue]]){
  const patches=Math.ceil((end-start)*2.5);
  for(let j=0;j<patches;j++)for(let k=0;k<6;k++){
   const pt=(u,v)=>{const z=start+(end-start)*u,t=angle+Math.sin(u*4+.8)*.48+(v-.5)*width*Math.sin(Math.PI*u)**.62;return at(hull,0,z,t,.016)};
   patch([pt(j/patches,k/6),pt((j+1)/patches,k/6),pt((j+1)/patches,(k+1)/6),pt(j/patches,(k+1)/6)],paint)
  }
 }
 for(const [z,w] of [[6.45,.045],[5.66,.017],[3.35,.022],[-3.18,.023],[-6.58,.025]])seam(hull,0,z,w,0,tau,charcoal);
 const boom=[[-8.77,.11,.03,.03],[-8.46,.11,.09,.09],[-8.30,.11,.09,.09]];loft(boom,0,10,steel,2);
 const needle=[[9.63,-.143,.039,.039],[9.86,-.15,.029,.029],[10.24,-.16,.012,.012]];loft(needle,0,9,steel,2);
 const shoulder=[[-5.15,.09,.30,.26],[-4.35,.18,.58,.39],[-2.95,.19,.78,.45],[-1.0,.19,.82,.50],[.7,.17,.79,.49],[2.1,.12,.64,.35],[2.91,.05,.33,.22],[3.32,.01,.04,.045]];
 const nacelle=[[-6.47,-.25,.63,.61],[-5.71,-.24,.71,.67],[-4.2,-.20,.75,.68],[-2.9,-.24,.79,.64],[-1.59,-.28,.77,.61],[-.52,-.33,.71,.56],[.82,-.35,.66,.52],[1.5,-.33,.53,.48]];
 const nozzle=[[-7.105,-.28,.49,.47],[-6.87,-.28,.54,.52],[-6.38,-.255,.63,.61],[-6.03,-.248,.67,.64]];
 const glass=[ [1.85,.56,.17,.18],[2.33,.60,.43,.38],[2.99,.66,.61,.59],[3.60,.68,.60,.67],[4.25,.66,.53,.63],[4.86,.61,.38,.49],[5.31,.55,.20,.24],[5.48,.53,.03,.06] ];
 loft(glass,0,24,glazing,1);
 // Glazed arch, aft frame, helmet and a low-contrast contour visible through the tint.
 seam(glass,0,3.00,.085,0,Math.PI,steel,2);seam(glass,0,4.65,.055,0,Math.PI,charcoal,2);
 const head=[[3.55,.91,.035,.06],[3.63,.92,.16,.18],[3.82,.93,.177,.19],[3.95,.92,.11,.14],[4.0,.92,.02,.04]];
 loft(head,0,12,[.52,.51,.45],4);
 for(const side of [-1,1]){
  const mirror=p=>[side*p[0],p[1],p[2]];
  const panel=(points,c,m=0,ctrl=0)=>patch(points.map(mirror),c,m,ctrl);
  const onGlass=(z,a)=>at(glass,0,z,side===1?a:Math.PI-a,.012);
  patch([[3.42,.53],[3.50,.70],[3.67,.82],[3.84,.82],[3.98,.66],[3.97,.51],[3.84,.47],[3.72,.38]].map(([z,a])=>onGlass(z,a)),[.21,.32,.34],4);
  patch([[3.69,.68],[3.83,.70],[3.97,.64],[3.94,.58],[3.72,.61]].map(([z,a])=>onGlass(z,a)),[.13,.24,.28],4);
  const glint=(a,z0,z1)=>{const n=13;for(let j=0;j<n;j++){const z=z0+(z1-z0)*j/n,w=z0+(z1-z0)*(j+1)/n;patch([onGlass(z,a),onGlass(w,a),onGlass(w,a+.015),onGlass(z,a+.015)],[.58,.71,.71],4)}};
  glint(.92,3.17,4.51);glint(.96,4.74,5.04);
  loft(shoulder,side*1.08,16,base,0,(_,a)=>Math.sin(a)<-.30?belly:base);
  loft(nacelle,side*1.25,22,base,0,(z,a)=>Math.sin(a)<.24?belly:z<-4.5?steel:blue);
  loft(nozzle,side*1.25,24,steel,2);
  // A ring of overlapping petals frames a recessed unlit exhaust cone.
  for(let j=0;j<20;j++){
   const a=j*tau/20,b=(j+.89)*tau/20;
   patch([[-7.12,a],[-7.12,b],[-6.54,b-.035],[-6.23,a+.075]].map(([z,t])=>at(nozzle,side*1.25,z,t,.018)),mul(steel,.69+(j%3)*.11),2)
  }
  const holeRings=[[-7.14,-.28,.42,.405],[-6.92,-.28,.33,.32]];
  loft(holeRings,side*1.25,20,rubber,4);
  const socket=Array.from({length:24},(_,j)=>at(holeRings,side*1.25,-7.14,j*tau/24));
  patch(socket,[.063,.058,.053],4);
  for(let j=0;j<12;j++){const a=j*tau/12,b=(j+.67)*tau/12,ring=(t,r)=>[side*1.25+r*Math.cos(t),-.28+r*.96*Math.sin(t),-7.149];patch([ring(a,.32),ring(b,.32),ring(b+.09,.24),ring(a+.09,.24)],[.32,.20,.15],4)}
  seam(nacelle,side*1.25,-5.6,.09,0,tau,charcoal,2);seam(nacelle,side*1.25,-4.43,.032,0,tau,steel,2);
  // Paired rectangular intake openings under the leading-edge shoulders.
  const inlet=[[.59,-.075,2.51],[1.82,-.09,2.52],[1.90,-.85,2.14],[.62,-.87,2.13]],rear=inlet.map(([x,y,z])=>[x,y,z-1.49]);
  for(let j=0;j<4;j++){const k=(j+1)%4;panel([inlet[j],inlet[k],rear[k],rear[j]],j===0?base:belly)}
  panel(inlet,rubber,4);
  const centre=[1.24,-.45,2.33],inner=inlet.map(p=>p.map((v,i)=>centre[i]+(v-centre[i])*.88));for(let j=0;j<4;j++){const k=(j+1)%4;panel([inlet[j],inlet[k],inner[k],inner[j]].map(([x,y,z])=>[x,y,z+.014]),steel,2)}
  for(let j=0;j<4;j++){const y=-.25-j*.125,z=2.52+(y+.075)*.49;panel([[.71,y,z+.017],[1.78,y,z+.017],[1.78,y-.018,z+.012],[.71,y-.018,z+.012]],[.21,.28,.29],4)}
  // Parametric wing panels maintain a continuous curved surface from strake
  // to wingtip. Cordwise and spanwise seams follow the same surface.
  const sections=[
   [.55,5.0,-4.58,.21,.26],[1.02,4.79,-4.71,.21,.24],[1.52,3.62,-4.64,.23,.235],
   [2.14,1.85,-4.30,.22,.19],[3.21,.72,-3.83,.20,.155],[4.58,-.78,-3.64,.13,.12],
   [5.98,-2.19,-3.74,.065,.08],[6.86,-3.04,-3.86,.025,.05]
  ];
  function wing(x,t,lift=0,bottom=false){const [lead,trail,y,h]=sample(sections,x);return [x,y+(bottom?-1:1)*h*Math.sin(Math.PI*t)**.85+(bottom?-.07:.025)+lift,lead+(trail-lead)*t]}
  for(let i=1;i<sections.length;i++)for(let j=0;j<6;j++){
   const x=sections[i-1][0],w=sections[i][0],a=j/6,b=(j+1)/6;
   panel([wing(x,a),wing(w,a),wing(w,b),wing(x,b)],base);
   panel([wing(x,b,0,true),wing(w,b,0,true),wing(w,a,0,true),wing(x,a,0,true)],belly);
   if(j===0||j===5){const t=j===0?0:1;panel([wing(x,t),wing(w,t),wing(w,t,0,true),wing(x,t,0,true)],steel)}
  }
  function wingPatch(x0,x1,limits,paint){
   const count=Math.ceil((x1-x0)*7);for(let j=0;j<count;j++)for(let k=0;k<3;k++){
    const fn=(u,v)=>{const x=x0+(x1-x0)*u,[lo,hi]=limits(u,x);return wing(x,lo+(hi-lo)*v,.018)};
    panel([fn(j/count,k/3),fn((j+1)/count,k/3),fn((j+1)/count,(k+1)/3),fn(j/count,(k+1)/3)],paint)
   }
  }
  wingPatch(1.28,6.81,u=>[.21+.089*Math.sin(u*10),.51+.105*Math.sin(u*7+.7)],side===1?pale:blue);
  wingPatch(1.9,4.24,u=>[.56+.067*Math.sin(u*8),.58+.29*Math.sin(Math.PI*u)**.75],side===1?blue:pale);
  wingPatch(4.96,6.7,u=>[.51+.05*Math.sin(u*4),.53+.18*Math.sin(Math.PI*u)],side===1?blue:pale);
  for(const [x0,x1,t] of [[2.25,6.69,.15],[2.62,6.62,.76],[2.7,4.5,.943]]){
   const n=14;for(let j=0;j<n;j++){const x=x0+(x1-x0)*j/n,w=x0+(x1-x0)*(j+1)/n;panel([wing(x,t,.03),wing(w,t,.03),wing(w,t+.006,.03),wing(x,t+.006,.03)],charcoal,4)}
  }
  for(const x of [2.65,4.6,5.62])panel([wing(x,.15,.030),wing(x+.014,.15,.030),wing(x+.014,.745,.030),wing(x,.745,.030)],charcoal,4);
  const podProfile=[[-4.25,-.005,.042,.047],[-4.03,.009,.11,.12],[-2.69,.045,.10,.10],[-2.25,.06,.023,.035]];
  loft(podProfile,side*6.87,10,light,2);
  const lightPos=[ [6.90,.067,-2.87],[6.96,.048,-3.05],[6.90,.073,-3.25],[6.87,.133,-3.03] ];panel(lightPos,side===1?[.33,.79,.56]:[.86,.27,.24],4);
  for(const [x0,x1] of [[2.12,4.45],[4.56,6.65]])panel([wing(x0,.78,.021),wing(x1,.78,.021),wing(x1,.97,.018),wing(x0,.97,.018)],mul(base,.94),0,1);
  // Tailplanes and paired fins are deliberately separated around the nacelles.
  const slab=(points,thickness,c,ctrl=0)=>{const low=points.map(([x,y,z])=>[x,y-thickness,z]);panel(points,c,0,ctrl);panel(low,belly,0,ctrl);for(let j=0;j<points.length;j++){const k=(j+1)%points.length;panel([points[j],points[k],low[k],low[j]],steel,0,ctrl)}};
  slab([[1.41,.06,-3.80],[2.31,.065,-4.09],[4.29,.015,-6.13],[4.18,.017,-6.70],[2.57,.047,-7.04],[1.48,.09,-6.34]],.11,base,2);
  panel([[1.90,.108,-5.63],[3.64,.057,-6.51],[3.21,.061,-6.71],[1.72,.12,-6.12]],blue,0,2);
  const fin=(y,z,extra=0)=>[1.27+.119*y+extra,y,z];
  const profile=[[.30,-2.63],[.71,-2.96],[2.72,-4.4],[3.23,-4.9],[3.13,-5.80],[2.84,-6.15],[.43,-6.20]];
  const top=profile.map(([y,z])=>fin(y,z,.07)),back=profile.map(([y,z])=>fin(y,z,-.065));
  panel(top,base);panel(back,base);for(let j=0;j<top.length;j++){const k=(j+1)%top.length;panel([top[j],top[k],back[k],back[j]],steel)}
  for(const offset of [-.073,.081]){
   panel([[1.19,-3.40],[2.69,-4.51],[2.43,-4.91],[1.78,-4.69],[1.34,-5.15],[.77,-4.93]].map(([y,z])=>fin(y,z,offset)),blue);
   panel([[3.06,-4.83],[3.21,-4.93],[3.12,-5.73],[2.94,-5.9],[2.9,-5.70]].map(([y,z])=>fin(y,z,offset)),light,4);
   panel([[.65,-5.51],[2.69,-5.54],[2.80,-6.01],[.61,-6.11]].map(([y,z])=>fin(y,z,offset)),mul(base,.93),0,3);
   const badge=(radius,colour,depth)=>{const c=[2.02,-5.22],center=fin(...c,depth);
    const vertices=Array.from({length:10},(_,j)=>{const angle=j*Math.PI/5,r=j%2?radius*.42:radius;return fin(c[0]+Math.cos(angle)*r,c[1]+Math.sin(angle)*r,depth)});
    for(let j=0;j<10;j++)panel([center,vertices[j],vertices[(j+1)%10]],colour,4)};
   badge(.365,cream,offset*1.09);badge(.286,brick,offset*1.14)
  }
  // Vented service panels and recessed fasteners are modelled as decals.
  for(let j=0;j<8;j++){const z=-.57-j*.155;
   const outer=(z,a)=>at(shoulder,1.08,z,a,.025);
   panel([outer(z,.83),outer(z+.042,.83),outer(z-.12,1.22),outer(z-.165,1.22)],charcoal,4)
  }
  const topPanel=(z,a,w,d,c)=>panel([at(hull,0,z,a,.024),at(hull,0,z+w,a,.024),at(hull,0,z+w,a+d,.024),at(hull,0,z,a+d,.024)],c,4);
  topPanel(4.49,.15,.38,.12,cream);topPanel(4.54,.17,.26,.075,brick);
  const digit=(z,d)=>{const segments=[[[0,1],[.25,1]],[[.25,1],[.25,.5]],[[.25,.5],[.25,0]],[[0,0],[.25,0]],[[0,.5],[0,0]],[[0,1],[0,.5]],[[0,.5],[.25,.5]]];
   for(const i of d){const [a,b]=segments[i],width=.046,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),ex=-dy/l*width/2,ey=dx/l*width/2;
    const map=(x,y)=>at(hull,0,z-x,-.31+y*.54,.037);
    panel([map(a[0]+ex,a[1]+ey),map(b[0]+ex,b[1]+ey),map(b[0]-ex,b[1]-ey),map(a[0]-ex,a[1]-ey)],cream,4)
   }
  };
  digit(4.38,[0,1,6,4,3]);digit(4.02,[0,1,2]);
 }
 return faces;
}

// A common display-only undercarriage keeps all six hangar models on the floor.
function makeDisplayGear(type=0){
 const faces=[],alloy=[.51,.55,.56],hydraulic=[.76,.78,.76],rubber=[.065,.073,.075],hub=[.36,.43,.42];
 const plus=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),times=(a,s)=>a.map(x=>x*s);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=a=>times(a,1/(Math.hypot(...a)||1));
 const face=(v,c,material=2)=>faces.push({v,c,material});
 function rod(a,b,r,c,n=9){
  const axis=norm(sub(b,a)),right=norm(cross(axis,Math.abs(axis[1])>.8?[1,0,0]:[0,1,0])),up=cross(axis,right);
  const ring=(p,j)=>plus(p,plus(times(right,r*Math.cos(j*2*Math.PI/n)),times(up,r*Math.sin(j*2*Math.PI/n))));
  for(let j=0;j<n;j++)face([ring(a,j),ring(a,j+1),ring(b,j+1),ring(b,j)],c);
 }
 function wheel(x,y,z,r,w){
  const section=[[-1,.42],[-1,.74],[-.72,.93],[-.36,1],[.36,1],[.72,.93],[1,.74],[1,.42]],n=18;
  const pt=(j,section)=>[x+section[0]*w,y+r*section[1]*Math.cos(j*2*Math.PI/n),z+r*section[1]*Math.sin(j*2*Math.PI/n)];
  for(let k=1;k<section.length;k++)for(let j=0;j<n;j++)face([pt(j,section[k-1]),pt(j+1,section[k-1]),pt(j+1,section[k]),pt(j,section[k])],rubber,4);
  for(const sign of [-1,1]){
   face(Array.from({length:n},(_,j)=>pt(j,[sign,.44])),hub);
   for(let j=0;j<6;j++){const a=j*Math.PI/3;const cy=y+r*.27*Math.cos(a),cz=z+r*.27*Math.sin(a);face(Array.from({length:6},(_,k)=>[x+sign*w*1.025,cy+.035*Math.cos(k*Math.PI/3),cz+.035*Math.sin(k*Math.PI/3)]),rubber)}
  }
 }
 const mainX=type===5?1.71:1.62,mainZ=type===5?-1.4:-1.68,noseZ=type===5?4.36:3.82;
 for(let side of [-1,1]){
  const x=mainX*side,root=[x*.8,-.34,mainZ+.22],joint=[x,-.96,mainZ-.04],axle=[x,-1.34,mainZ];
  rod(root,joint,.091,alloy,10);rod(joint,axle,.066,hydraulic);
  rod([x*.75,-.32,mainZ-1.13],joint,.054,alloy);rod([x*.76,-.34,mainZ+.93],[x,-1.16,mainZ],.045,alloy);
  wheel(x+side*.12,-1.34,mainZ,.41,.14);
 }
 rod([0,-.35,noseZ-.32],[0,-.98,noseZ],.075,alloy);rod([0,-.96,noseZ],[0,-1.47,noseZ+.11],.052,hydraulic);
 rod([0,-.22,noseZ-1.0],[0,-1.13,noseZ+.02],.045,alloy);wheel(.085,-1.45,noseZ+.13,.30,.095);
 return faces;
}
