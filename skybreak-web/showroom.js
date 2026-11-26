"use strict";
function makeBayMesh(faces,aircraft=false) {
 const points=[],indices=new Map(),triangles=[],data=[];
 const idOf=p=>{const key=p.join(",");if(!indices.has(key)){indices.set(key,points.length);points.push(p)}return indices.get(key)};
 for(const face of faces){
  const base=face.v,n=V.unit(V.cross(V.sub(base[1],base[0]),V.sub(base[2],base[0])));
  if(Math.hypot(...n)<.5)continue;
  const pos=aircraft?base.map(p=>[p[0],p[1]+1.75,p[2]]):base;
  const mat=aircraft?10+(face.material||0):face.surface||0;
  for(let j=1;j<pos.length-1;j++){
   const ix=[0,j,j+1],ids=ix.map(k=>idOf(pos[k]));
   triangles.push({ids,n,c:face.c,mat});
   for(const k of ix)data.push(...pos[k],...(face.normals?.[k]||n),...face.c,mat);
  }
 }
 return {points,triangles,data:new Float32Array(data)};
}
function bayApron(){
 const faces=[],add=(v,c,surface=0)=>faces.push({v,c,surface});
 add([[-150,-.1,30],[150,-.1,30],[150,-.1,150],[-150,-.1,150]],[.51,.54,.52],1);
 for(let i=-15;i<15;i++){const x=i*12,ht=k=>4+3*Math.sin(k*.83)+2*Math.cos(k*.32);
 add([[x,0,122],[x+12,0,122],[x+12,ht(i+1),122],[x,ht(i),122]],[.43,.53,.56]);}
 return faces;
}
function groundShadow(model){
 const tile=document.createElement("canvas");tile.width=tile.height=256;const ctx=tile.getContext("2d",{willReadFrequently:true});
 ctx.fillStyle="#fff";ctx.fillRect(0,0,256,256);ctx.fillStyle="#484848";
 for(const f of model){ctx.beginPath();for(let j=0;j<f.v.length;j++){const [x,y,z]=f.v[j],h=y+1.75;const a=(x+.62*h+12)*256/24,b=(z-.44*h+12)*256/24;ctx[j?"lineTo":"moveTo"](a,b)}ctx.closePath();ctx.fill()}
 const blur=document.createElement("canvas");blur.width=blur.height=256;const g=blur.getContext("2d",{willReadFrequently:true});
 g.fillStyle="white";g.fillRect(0,0,256,256);if("filter" in g)g.filter="blur(3px)";g.drawImage(tile,0,0);return {canvas:blur,pixels:g.getImageData(0,0,256,256).data};
}
const bayVS=`precision highp float;
attribute vec3 a,n,tint;attribute float surface;uniform vec3 eye;uniform mat3 axes;uniform vec4 lens;
varying vec3 p,normal,c;varying float mat;
void main(){p=a;normal=n;c=tint;mat=surface;vec3 d=a-eye;vec3 v=vec3(dot(d,axes[0]),dot(d,axes[1]),dot(d,axes[2]));
gl_Position=vec4(v.x/lens.x+v.z*lens.z,v.y/lens.y+v.z*lens.w,1.002*v.z-.34,v.z);}`;
const bayFS=`precision highp float;varying vec3 p,normal,c;varying float mat;uniform vec3 eye;uniform sampler2D shadowMap;uniform vec3 livery;
float hash(vec2 q){return fract(sin(dot(mod(q,512.),vec2(127.1,311.7)))*4375.545);}
void main(){vec3 v=normalize(eye-p),n=normalize(normal);if(dot(n,v)<0.)n=-n;
vec3 l=normalize(vec3(-.54,.78,.46)),col=c*(.57+.36*max(0.,dot(n,l))+.13*max(0.,n.y));
if(mat<.5){col*=.98;}
else if(mat<1.5||abs(mat-5.)<.5){
 float grain=hash(floor(p.xz*48.));col+=.022*(grain-.5);
 if(abs(n.y)>.85){float sun=clamp((p.z+16.)*.032,0.,1.)+.15*cos(p.x*.32);col*=vec3(.76,.8,.83)+vec3(.34,.28,.19)*sun;
 vec2 uv=(p.xz+12.)/24.;if(min(uv.x,uv.y)>0.&&max(uv.x,uv.y)<1.)col*=.50+.50*texture2D(shadowMap,uv).r;
 float across=p.x+p.z*.36;
 float panes=smoothstep(.04,.16,abs(fract((p.z-.22*p.x)/3.1)-.5));
 float sunshaft=(1.-smoothstep(7.5,8.2,abs(across+4.8)))*panes;
 col+=vec3(.18,.13,.067)*sunshaft*(.65+.35*texture2D(shadowMap,clamp(uv,0.,1.)).r);
 col*=1.-.20*exp(-dot(p.xz*vec2(.17,.116),p.xz*vec2(.17,.116)));
 float stripe=pow(max(0.,cos(p.x*.51+sin(p.z*.21)*.12)),14.);col+=vec3(.052,.049,.038)*stripe*pow(1.-abs(dot(n,v)),2.);}
}
else if(mat<2.5){col+=pow(max(0.,dot(n,normalize(l+v))),22.)*.14;}
else if(mat<3.5){float sun=clamp((p.z+31.)*.016,0.,1.);col=c*.82+vec3(.22,.20,.16)+sun*vec3(.08,.04,.01)+.035*sin(p.x*.66+p.z*.8);}
else if(mat<4.5){col=c*1.10;}
else if(mat<6.5){col*=.92+.075*cos((p.z+p.x)*17.0);}
else {
 vec3 r=reflect(-v,n);float fres=pow(1.-max(0.,dot(n,v)),3.);
 float strip=pow(max(0.,cos(r.x*12.+r.z*7.)),16.)*max(0.,r.y);
 if(mat<10.5){col=c*livery*(.68+.48*max(0.,dot(n,l))+.12*max(0.,n.y));col+=vec3(.098,.118,.14)*fres+vec3(.19,.20,.20)*strip+.19*pow(max(0.,dot(n,normalize(l+v))),34.);}
 else if(mat<11.5){col=mix(vec3(.043,.105,.14),vec3(.48,.64,.73),.22+.6*fres+.20*max(0.,r.y))+strip*.42;}
 else if(mat<12.5){col+=strip*.27+pow(max(0.,dot(n,normalize(v+l))),26.)*.21;}
 else if(mat<13.5){col=c*.73;}
 else {col=c*(.70+.37*max(0.,dot(n,l)));}
}
gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;
function bayGPU(gl){
 const program=gl.createProgram();
 for(const [type,src] of [[gl.VERTEX_SHADER,bayVS],[gl.FRAGMENT_SHADER,bayFS]]){
  const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);
 }
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const loc={};for(const key of ["eye","axes","lens","livery","shadowMap"])loc[key]=gl.getUniformLocation(program,key);
 for(const key of ["a","n","tint","surface"])loc[key]=gl.getAttribLocation(program,key);
 const buffers=new WeakMap(),tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
 for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
 for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);let previousShadow;
 return (canvas,meshes,view,shade,paint)=>{
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.68,.77,.82,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  if(previousShadow!==shade){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,shade.canvas);previousShadow=shade}
  gl.uniform1i(loc.shadowMap,0);gl.uniform3fv(loc.eye,view.eye);gl.uniform3fv(loc.livery,paint);gl.uniformMatrix3fv(loc.axes,false,view.axes.flat());gl.uniform4fv(loc.lens,view.lens);
  for(const mesh of meshes){let buf=buffers.get(mesh);
   if(!buf){buf=gl.createBuffer();buffers.set(mesh,buf);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,mesh.data,gl.STATIC_DRAW)}else gl.bindBuffer(gl.ARRAY_BUFFER,buf);
   for(const [id,size,offset] of [["a",3,0],["n",3,12],["tint",3,24],["surface",1,36]]){gl.enableVertexAttribArray(loc[id]);gl.vertexAttribPointer(loc[id],size,gl.FLOAT,false,40,offset)}
   gl.drawArrays(gl.TRIANGLES,0,mesh.data.length/10);
  }
 };
}
// A depth buffer keeps the same room, wheels and airframe visible on devices
// without WebGL, including faces that cross the camera's near plane.
function bayCPU(ctx){
 let frame,depth;
 return (canvas,meshes,view,shadow,paint)=>{
 const w=canvas.width,h=canvas.height;if(!frame||frame.width!==w||frame.height!==h){frame=ctx.createImageData(w,h);depth=new Float32Array(w*h)}
 const pixels=new Uint32Array(frame.data.buffer);pixels.fill(0xffd1c5ad);depth.fill(0);
 const [right,up,forward]=view.axes,[tx,ty,ox,oy]=view.lens;
 const screen=q=>[(.5+ox*.5+q[0]/(2*tx*q[2]))*w,(.5-oy*.5-q[1]/(2*ty*q[2]))*h,1/q[2],q[3]/q[2],q[4]/q[2]];
 function fill(a,b,c,rgb,floor){
  const ax=a[0],ay=a[1],bx=b[0],by=b[1],cx=c[0],cy=c[1];
  const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<.006)return;
  const left=Math.max(0,Math.floor(Math.min(ax,bx,cx))),top=Math.max(0,Math.floor(Math.min(ay,by,cy))),right=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx))),bottom=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
  const um=(by-cy)/det,vm=(cy-ay)/det,un=(cx-bx)/det,vn=(ax-cx)/det;
  const rr=rgb[0],gg=rgb[1],bb=rgb[2],color=0xff000000|bb<<16|gg<<8|rr;
  for(let y=top;y<=bottom;y++){let u=um*(left+.5-cx)+un*(y+.5-cy),v=vm*(left+.5-cx)+vn*(y+.5-cy);
   for(let x=left,i=y*w+left;x<=right;x++,i++,u+=um,v+=vm){
    const t=1-u-v;if(u<-.00005||v<-.00005||t<-.00005)continue;
    const z=u*a[2]+v*b[2]+t*c[2];if(z<=depth[i])continue;depth[i]=z;
    if(!floor){pixels[i]=color;continue}
    const X=(u*a[3]+v*b[3]+t*c[3])/z,Z=(u*a[4]+v*b[4]+t*c[4])/z;
    const sx=(X+12)*256/24,sy=(Z+12)*256/24;
    let light=.85+.14*Math.min(1,Math.max(0,(Z+16)/32));
    if(sx>=0&&sx<256&&sy>=0&&sy<256)light*=.54+.46*shadow.pixels[4*((sy|0)*256+(sx|0))]/255;
    const lane=Math.max(0,Math.min(1,(8.2-Math.abs(X+Z*.36+4.8))*1.43));
    const stripe=(Z-.22*X)/3.1,bar=Math.min(1,Math.max(0,(Math.abs(stripe-Math.floor(stripe)-.5)-.04)*8.3));
    const sun=lane*bar*light,grain=(((x*13+y*17)^(x*y))&7)*.38;
    pixels[i]=0xff000000|Math.min(255,bb*light+sun*16+grain)<<16|Math.min(255,gg*light+sun*31+grain)<<8|Math.min(255,rr*light+sun*43+grain);
   }
  }
 }
 for(const mesh of meshes){
  const pts=mesh.points.map(p=>{const d=V.sub(p,view.eye);return [V.dot(d,right),V.dot(d,up),V.dot(d,forward),p[0],p[2]]});
  const projected=pts.map(p=>p[2]>.17?screen(p):null);
  for(const f of mesh.triangles){const ids=f.ids,pa=projected[ids[0]],pb=projected[ids[1]],pc=projected[ids[2]];
   if(!pa&&!pb&&!pc)continue;if(pa&&pb&&pc&&((pa[0]<0&&pb[0]<0&&pc[0]<0)||(pa[0]>w&&pb[0]>w&&pc[0]>w)||(pa[1]<0&&pb[1]<0&&pc[1]<0)||(pa[1]>h&&pb[1]>h&&pc[1]>h)))continue;
   const pos=mesh.points[ids[0]],dir=V.unit(V.sub(view.eye,pos)),n=V.dot(dir,f.n)>0?f.n:V.mul(f.n,-1);
   const diffuse=Math.max(0,V.dot(n,[-.54,.78,.46])),lamp=f.mat===4,window=f.mat===3;
   const light=lamp?1.19:window?1.19:.57+.47*diffuse+.12*Math.max(0,n[1]);
   const metal=f.mat===2||f.mat===12||f.mat===10||f.mat===11;
   const shine=metal?.24*Math.pow(Math.max(0,V.dot(n,V.unit(V.add(dir,[-.54,.78,.46])))),18):0;
   const rgb=f.c.map((v,i)=>clamp(Math.round(255*(v*light*(f.mat===10?paint[i]:1)+shine+(f.mat===11?.08:0))),0,255));
   const floor=(f.mat===1||f.mat===5)&&Math.abs(n[1])>.85;
   if(pa&&pb&&pc){fill(pa,pb,pc,rgb,floor);continue}
   const clip=[];for(let j=0;j<3;j++){const a=pts[ids[j]],b=pts[ids[(j+1)%3]];if(a[2]>.17)clip.push(a);if((a[2]>.17)!==(b[2]>.17)){const t=(.17-a[2])/(b[2]-a[2]);clip.push(a.map((v,k)=>v+(b[k]-v)*t))}}
   const out=clip.map(screen);for(let j=1;j<out.length-1;j++)fill(out[0],out[j],out[j+1],rgb,floor);
  }
 }
 ctx.putImageData(frame,0,0);
 };
}
function openShowroom(){
 let canvas=$("showroom"),gl=null,paintScene;
 try{gl=canvas.getContext("webgl",{alpha:false,antialias:true,powerPreference:"low-power"});if(gl)paintScene=bayGPU(gl)}catch{if(gl){const fresh=canvas.cloneNode();canvas.replaceWith(fresh);canvas=fresh}gl=null}
 if(!paintScene)paintScene=bayCPU(canvas.getContext("2d",{alpha:false}));
 const shell=makeBayMesh(buildHangarShell().concat(bayApron())),planes=new Map(),shadows=new Map(),fingers=new Map();
 const initial={yaw:-.94,elevation:.225,radius:22},cam={...initial},want={...initial};
 let raf=0,then=0,lastPinch=0,expanded=false;
 function draw(now){
  raf=0;if($("hangar").hidden||document.hidden)return;
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
  const wide=width/height>1.55&&!expanded&&innerWidth>650,aspect=width/height;
  const k=1-Math.exp(-Math.min(.1,Math.max(.016,(now-then)*.001))*15);then=now;
  let moving=false;for(const key of ["yaw","elevation","radius"]){const diff=want[key]-cam[key];moving=moving||Math.abs(diff)>.001;cam[key]=Math.abs(diff)<.001?want[key]:cam[key]+diff*k}
  const q=options.graphics==="eco"?.8:1,res=Math.min(gl?1.5:1,devicePixelRatio||1,(gl?1480:moving?680:1040)*q/Math.max(width,height));
  const W=Math.max(1,Math.round(width*res)),H=Math.max(1,Math.round(height*res));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H}
  if(!planes.has(selectedPlane)){
   const faces=planeMeshes[selectedPlane].concat(makeDisplayGear(selectedPlane));planes.set(selectedPlane,makeBayMesh(faces,true));shadows.set(selectedPlane,groundShadow(faces));
  }
  const horizontal=cam.radius*Math.cos(cam.elevation),eye=[horizontal*Math.sin(cam.yaw),Math.min(8.6,1.65+cam.radius*Math.sin(cam.elevation)),horizontal*Math.cos(cam.yaw)];
  const f=V.unit(V.sub([0,1.5,0],eye)),r=V.unit(V.cross([0,1,0],f)),u=V.cross(f,r);
  const tx=wide?.76:Math.max(.48,Math.min(.79,.46*aspect));
  paintScene(canvas,[shell,planes.get(selectedPlane)],{eye,axes:[r,u,f],lens:[tx,tx/aspect,wide?.30:0,-.055]},shadows.get(selectedPlane),[[1,1,1],[1.20,1.03,.73],[.72,1.10,1.22]][options.skin]||[1,1,1]);
  if(moving)request();
 }
 function request(){if(!raf&&!$("hangar").hidden&&!document.hidden)raf=requestAnimationFrame(draw)}
 function zoom(factor){want.radius=clamp(want.radius*factor,13,25);request()}
 function reset(){Object.assign(want,initial);request()}
 function expand(value){
  expanded=value;document.body.classList.toggle("inspecting",value);$("inspect").setAttribute("aria-pressed",String(value));$("inspect").textContent=value?"В ангар":"Осмотреть";request()
 }
 const pinch=()=>{const a=[...fingers.values()];return a.length===2?Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]):0};
 canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);fingers.set(e.pointerId,[e.clientX,e.clientY]);lastPinch=pinch()};
 canvas.onpointermove=e=>{const old=fingers.get(e.pointerId);if(!old)return;fingers.set(e.pointerId,[e.clientX,e.clientY]);
  if(fingers.size===1){want.yaw-=(e.clientX-old[0])*.008;want.elevation=clamp(want.elevation+(e.clientY-old[1])*.005,.055,.65);request()}
  else{const d=pinch();if(d>5&&lastPinch>5)zoom(lastPinch/d);lastPinch=d}
 };
 canvas.onlostpointercapture=e=>{fingers.delete(e.pointerId);lastPinch=pinch()};
 canvas.addEventListener("wheel",e=>{if(expanded||canvas===document.activeElement){e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-120,120)*.0019))}},{passive:false});
 canvas.onkeydown=e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){want.yaw+=e.key==="ArrowLeft"?-.18:.18;request()}else if(e.key==="ArrowUp"||e.key==="ArrowDown")zoom(e.key==="ArrowUp"?.91:1.1);else return;e.preventDefault()};
 $("zoomIn").onclick=()=>zoom(.86);$("zoomOut").onclick=()=>zoom(1.16);$("viewHome").onclick=reset;$("inspect").onclick=()=>expand(!expanded);
 window.addEventListener("keydown",e=>{if(e.key==="Escape"&&expanded){expand(false);$("inspect").focus()}});
 if(window.ResizeObserver)new ResizeObserver(request).observe(canvas);
 window.addEventListener("resize",request);document.addEventListener("visibilitychange",request);
 window.addEventListener("baychange",request);request();
}
openShowroom();
