"use strict";

function buildHangarShell() {
  const faces = [];
  const matte = 0, concrete = 1, metal = 2, glass = 3, lamp = 4, paint = 5, siding = 6;
  const graphite = [.21,.24,.25], beam = [.28,.31,.31], flange = [.38,.39,.37];
  const buff = [.59,.56,.48], ochre = [.83,.53,.19], white = [.82,.82,.72];
  const oxblood = [.42,.20,.15], rubber = [.105,.118,.118], teal = [.22,.32,.32];
  const warmLamp = [1,.90,.71], pane = [.64,.76,.79];
  const face = (v,c,surface=matte) => faces.push({v,c,surface});
  const tone = (c,k) => c.map(x=>Math.min(1,x*k));
  function box(x,y,z,w,h,d,c,s=matte) {
    const a=[x,y,z],b=[x+w,y,z],e=[x,y,z+d],g=[x+w,y,z+d];
    const top=v=>[v[0],v[1]+h,v[2]],A=top(a),B=top(b),E=top(e),G=top(g);
    face([a,e,E,A],c,s); face([b,B,G,g],c,s); face([a,A,B,b],c,s);
    face([e,g,G,E],c,s); face([A,E,G,B],c,s); face([a,b,g,e],c,s);
  }
  function cross(a,b) {return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
  function normal(a){const n=Math.hypot(...a);return a.map(k=>k/n)}
  function rod(a,b,r,c,s=metal,n=4,rEnd=r) {
    const dir=normal(b.map((v,i)=>v-a[i]));
    const u=normal(cross(dir,Math.abs(dir[1])>.94?[1,0,0]:[0,1,0])),v=cross(dir,u);
    const ring=(pos,radius)=>Array.from({length:n},(_,i)=>{
      const ang=2*Math.PI*i/n+Math.PI/4;
      return pos.map((x,j)=>x+radius*(Math.cos(ang)*u[j]+Math.sin(ang)*v[j]));
    });
    const lo=ring(a,r),hi=ring(b,rEnd);
    for(let i=0;i<n;i++){const j=(i+1)%n;face([lo[i],lo[j],hi[j],hi[i]],c,s)}
    face(lo.slice().reverse(),c,s);face(hi,c,s);
  }
  function line(x,z,X,Z,width,c=ochre,y=.017) {
    const length=Math.hypot(X-x,Z-z),dx=-(Z-z)*width/(2*length),dz=(X-x)*width/(2*length);
    face([[x+dx,y,z+dz],[X+dx,y,Z+dz],[X-dx,y,Z-dz],[x-dx,y,z-dz]],c,paint);
  }
  function wallZ(x,y,z,w,h,c,s) {
    face([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],c,s);
  }
  function wallX(x,y,z,w,h,c,s) {
    face([[x,y,z],[x,y+h,z],[x,y+h,z+w],[x,y,z+w]],c,s);
  }

  // Six-metre concrete pads with recessed expansion joints.
  const slabTones=[.96,.995,1.018,.979,1.006];
  face([[-26,-.045,-31],[-26,-.045,31],[26,-.045,31],[26,-.045,-31]],[.24,.25,.24]);
  for(let ix=0;ix<8;ix++)for(let iz=0;iz<10;iz++) {
    const x=-26+ix*6.5+.012,z=-31+iz*6.2+.012;
    const c=tone([.52,.51,.475],slabTones[(ix*3+iz*7)%slabTones.length]);
    face([[x,0,z],[x,0,z+6.176],[x+6.476,0,z+6.176],[x+6.476,0,z]],c,concrete);
  }
  // Central guide leads to the open door. Four corner marks frame the parking stand.
  line(0,11.5,0,30.8,.15);line(-1.15,12,1.15,12,.12);
  for(const side of [-1,1])for(const end of [-1,1]){
    const x=side*9.6,z=end*11;
    line(x,z,x-side*2.45,z,.14,white);
    line(x,z,x,z-end*2.45,.14,white);
  }
  for(const x of [-18.6,18.6]){line(x,-25,x,26,.1,ochre);line(x+.28,-25,x+.28,26,.055,white)}
  for(const x of [-22,20])for(let z=-25;z<22;z+=4.5){
    line(x,z,x+1.8,z,.31,rubber,.012);
    for(let i=0;i<9;i++)line(x+i*.19+.07,z-.11,x+i*.19+.07,z+.11,.065,flange,.019);
  }

  // Lower masonry and insulated panel courses with two levels of glazing on the back wall.
  const cladding=[.49,.51,.50],block=[.50,.48,.43];
  for(const sign of [-1,1]){
    const x=sign*26,X=x-sign*.09;
    wallX(x,0,-31,62,1.55,block,concrete);
    wallX(x,1.55,-31,62,4.15,cladding,siding);
    wallX(x,7.95,-31,62,1.80,tone(cladding,.88),siding);
    box(X-.075,1.34,-30.95,.15,.16,61.9,[.39,.36,.28]);
    for(let j=0;j<10;j++) {
      const z=-31+j*6.2;
      wallX(x,5.70,z,6.2,2.25,tone(pane,(j%3)*.03+.92),glass);
      box(X-.04,5.66,z,.08,.1,6.2,graphite,metal);
      box(X-.04,6.82,z,.08,.055,6.2,graphite,metal);
      box(X-.04,7.90,z,.08,.13,6.2,graphite,metal);
      for(let q=1;q<=3;q++)box(X-.035,5.72,z+q*1.55-.035,.07,2.17,.07,graphite,metal);
      box(X-.032,1.58,z,.064,4.05,.07,flange,metal);
    }
    box(sign*25.75-.15,3.6,-30.9,.3,.13,61.8,graphite,metal);
  }
  wallZ(-26,0,-31,52,2.1,block,concrete);wallZ(-26,2.1,-31,52,3.45,cladding,siding);
  wallZ(-26,7.97,-31,52,1.22,tone(cladding,.9),siding);
  for(let i=0;i<8;i++) {
    const x=-26+i*6.5;
    wallZ(x,5.55,-31,6.5,2.42,tone(pane,[.94,.99,.89,1][i%4]),glass);
    for(let j=0;j<4;j++)box(x+j*1.625-.04,5.54,-30.96,.08,2.46,.12,graphite,metal);
    for(const y of [5.55,6.72,7.94])box(x,y,-30.94,6.5,.1,.1,graphite,metal);
    box(x-.08,.02,-30.91,.16,9.1,.17,beam,metal);
  }
  for(const z of [-31,31])face([[-26,9.14,z],[26,9.14,z],[0,12,z]],cladding,siding);

  // Sloped roof sheets, deep I-section columns, open-web steel trusses and hangers.
  function roofY(x){return 9.16+2.84*(1-Math.abs(x)/26)}
  function roofPanel(x,X,z,Z,c,s) {
    face([[x,roofY(x),z],[X,roofY(X),z],[X,roofY(X),Z],[x,roofY(x),Z]],c,s);
  }
  for(const sign of [-1,1]) {
    for(let j=0;j<6;j++) {
      const z=-31+j*(62/6),Z=z+62/6;
      roofPanel(sign*26,sign*13,z,Z,[.34,.35,.33],siding);
      roofPanel(sign*13,sign*10.8,z,Z,pane,glass);
      roofPanel(sign*10.8,0,z,Z,[.38,.39,.36],siding);
      for(let s=1;s<4;s++){
        const pos=z+s*(Z-z)/4;
        rod([sign*13,roofY(13)-.02,pos],[sign*10.8,roofY(10.8)-.02,pos],.052,flange);
      }
    }
    for(const x of [5.2,10.8,13,18.7,24.2])box(sign*x-.06,roofY(x)-.15,-30.97,.12,.14,61.94,flange,metal);
  }
  const frames=[-29.9,-20,-10,0,10,20,29.9];
  for(const z of frames){
    for(const sign of [-1,1]) {
      const x=sign*25.5;
      box(x-.43,0,z-.45,.86,.19,.90,flange,metal);
      for(const d of [-.25,.25])box(x+d-.04,.19,z-.26,.08,8.88,.52,beam,metal);
      box(x-.25,.2,z-.056,.5,8.87,.112,graphite,metal);
      const knee=[sign*21.5,8.67,z];rod([x,6.82,z],knee,.16,beam);
      face([[x-sign*.23,8.2,z+.14],[x-sign*1.98,8.47,z+.14],[x-sign*.23,7.33,z+.14]],flange,metal);
      let prev=null;
      for(let i=0;i<=5;i++){
        const X=sign*(25.5-i*5.1),high=[X,roofY(X)-.20,z],low=[X,7.95+.97*i/5,z];
        rod(low,high,.08,flange);
        if(prev){
          rod(prev[0],high,.145,beam);rod(prev[1],low,.115,beam);
          rod(i%2?prev[1]:prev[0],i%2?high:low,.082,flange);
        }
        prev=[high,low];
      }
    }
    if(Math.abs(z)<29)for(const x of [-13.5,13.5]) {
      for(const d of [-1,1])rod([x+d*.59,8.38,z],[x+d*.59,7.48,z],.024,graphite);
      box(x-1.05,7.36,z-.185,2.1,.14,.37,graphite,metal);
      box(x-.99,7.30,z-.145,1.98,.065,.29,warmLamp,lamp);
    }
  }
  // Door pockets and folded sliding leaves along the opening, clear taxi passage in the centre.
  for(const s of [-1,1]){
    const start=s<0?-26:19;
    wallZ(start,0,31,7,9.17,tone(cladding,.84),siding);
    for(let i=0;i<3;i++) {
      const x=s*(19.16+i*1.14);
      box(x-.55,.07,30.18+i*.22,1.10,8.47,.16,[.39,.43,.42],siding);
      box(x-.57,3.6,30.12+i*.22,1.14,.12,.21,flange,metal);
      box(x-.55,6.45,30.14+i*.22,1.08,.62,.15,pane,glass);
    }
    box(s*18.65-.12,.04,30.12,.24,8.54,.40,ochre,metal);
  }
  box(-25.94,8.56,30.2,51.88,.55,.56,graphite,metal);
  box(-25.94,8.56,30.14,51.88,.085,.72,flange,metal);

  // Rail-mounted overhead service crane parked against the rear wall.
  for(const s of [-1,1]){
    box(s*22.9-.13,6.56,-29,.26,.38,51.5,beam,metal);
    box(s*22.9-.21,6.90,-29,.42,.11,51.5,flange,metal);
    for(const z of frames.slice(0,-1)){
      rod([s*25.4,5.58,z],[s*22.9,6.55,z],.1,beam);
      box(s*24.14-1.24,6.48,z-.135,2.48,.16,.27,beam,metal);
    }
  }
  for(const z of [-23.6,-22.2]){
    box(-23.22,6.94,z-.10,46.44,.58,.20,ochre,metal);
    box(-23.24,6.91,z-.18,46.48,.09,.36,[.56,.38,.17],metal);
    box(-23.24,7.49,z-.18,46.48,.095,.36,tone(ochre,1.10),metal);
  }
  for(let x=-22;x<23;x+=4.5)box(x,7.39,-23.6,.16,.12,1.40,beam,metal);
  box(13.5,6.64,-23.74,1.64,.42,1.73,graphite,metal);
  for(const x of [13.93,14.59])rod([x,6.63,-22.91],[x,4.82,-22.91],.024,rubber);
  box(13.81,4.55,-23.14,.90,.34,.47,tone(ochre,.91),metal);
  rod([14.28,4.55,-22.92],[14.28,4.13,-22.92],.068,graphite);
  rod([14.28,4.13,-22.92],[14.60,4.24,-22.92],.068,graphite);

  // Workbench, rolling cabinets and tyre-sized castors. Drawer pulls face the centre of the bay.
  function cabinet(x,z,w,body) {
    for(const dx of [.18,w-.18])for(const dz of [.16,.70]) {
      rod([x+dx-.07,.17,z+dz],[x+dx+.07,.17,z+dz],.14,rubber,matte,8);
    }
    box(x,.30,z,w,1.13,.88,body,metal);
    box(x-.04,1.42,z-.035,w+.08,.10,.95,graphite,metal);
    for(let j=0;j<4;j++) {
      box(x+.07,.38+j*.24,z+.886,w-.14,.215,.026,tone(body,1.08),metal);
      box(x+.15,.54+j*.24,z+.918,w-.30,.03,.05,flange,metal);
    }
  }
  for(const x of [-20.3,-12.95]){
    for(const dx of [0,5.3])for(const dz of [0,.98])box(x+dx,.02,-27.78+dz,.13,1.20,.13,beam,metal);
    box(x-.11,1.20,-27.91,5.66,.14,1.34,buff);
    box(x+.09,.34,-27.68,5.31,.085,1.03,flange,metal);
    box(x-.11,1.35,-27.91,5.66,1.02,.10,teal,metal);
    box(x-.11,2.35,-27.91,5.66,.085,.23,flange,metal);
    box(x+.10,2.339,-27.71,5.20,.035,.10,warmLamp,lamp);
  }
  cabinet(-19.92,-26.0,1.72,oxblood);cabinet(-15.5,-27.65,1.47,teal);
  cabinet(11.8,-25.4,1.95,oxblood);
  // Compact side workstation and floor-standing hose reel.
  box(17.8,.04,-27.7,4.27,2.6,1.65,[.33,.39,.39],metal);
  for(const x of [18.0,19.29,20.58]){
    box(x,.25,-26.02,1.16,2.18,.048,teal,metal);
    box(x+.91,1.25,-25.96,.055,.25,.061,flange,metal);
    for(let q=0;q<4;q++)box(x+.18,2.02+q*.085,-25.965,.78,.025,.031,graphite);
  }
  for(const x of [21.12,22.03]) {
    rod([x,.05,-15.93],[x,.85,-15.37],.083,ochre);
    rod([x,.05,-14.80],[x,.85,-15.37],.083,ochre);
  }
  rod([21.08,.84,-15.36],[22.08,.84,-15.36],.56,rubber,matte,14);
  for(const x of [21.08,22.08])rod([x-.045,.84,-15.36],[x+.045,.84,-15.36],.64,oxblood,metal,14);
  for(let j=0;j<7;j++)rod([21.20+j*.115,.84,-15.36],[21.26+j*.115,.84,-15.36],.569,graphite,matte,14);

  // A wheeled servicing stair at the far side of the jet.
  const sx=19.8,sz=4.0;
  for(const dx of [-.70,.70]){
    rod([sx+dx,.31,sz],[sx+dx,2.14,sz+3.16],.095,beam);
    rod([sx+dx,.26,sz+4.18],[sx+dx,2.14,sz+4.18],.095,beam);
    rod([sx+dx,.31,sz],[sx+dx,.31,sz+4.18],.091,beam);
    for(const z of [sz+.05,sz+4.09]){
      rod([sx+dx-.1,.18,z],[sx+dx+.1,.18,z],.17,rubber,matte,9);
    }
    rod([sx+dx,1.21,sz],[sx+dx,3.06,sz+3.16],.057,ochre,metal,6);
    rod([sx+dx,3.06,sz+3.16],[sx+dx,3.06,sz+4.23],.057,ochre,metal,6);
    for(const t of [0,.5,1])rod([sx+dx,.31+1.83*t,sz+3.16*t],[sx+dx,1.21+1.85*t,sz+3.16*t],.047,ochre,metal,6);
    rod([sx+dx,2.14,sz+4.20],[sx+dx,3.06,sz+4.20],.047,ochre,metal,6);
  }
  for(let j=0;j<8;j++)box(sx-.73,.28+j*.24,sz+j*.408,1.46,.09,.39,flange,metal);
  box(sx-.78,2.10,sz+3.0,1.56,.115,1.25,beam,metal);
  return faces;
}
