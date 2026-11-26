"use strict";
function landscape(size=70,index=mapIndex){
 const out=[],cols=Math.ceil(2200/size),rows=cols,pts=[];
 for(let k=0;k<=rows;k++){pts[k]=[];for(let j=0;j<=cols;j++){
 const x=-1100+j*size+(Math.sin(j*47.1+k*14.71)*.21*size),z=-1100+k*size+(Math.cos(j*17.13+k*74.3)*.21*size);
 pts[k][j]=[x,groundAt(x,z,index),z];
 }}
 function tile(a,b,c){const height=(a[1]+b[1]+c[1])/3;if(Math.max(a[1],b[1],c[1])<0)return;
 const v=.95+.055*Math.sin(a[0]*.017+c[2]*.007);const col=index===0?(height>155?[.65,.40,.23]:[.69,.51,.32]):index===1?(height>160?[.68,.72,.73]:[.83,.85,.85]):height<23?[.53,.54,.42]:height<420?[.23,.34,.28]:height<750?[.34,.39,.35]:[.48,.49,.44];const coast=[],verts=[a,b,c];
 for(let j=0;j<3;j++){const p=verts[j],q=verts[(j+1)%3];if(p[1]>=0)coast.push(p);
 if((p[1]>=0)!==(q[1]>=0)){const k=p[1]/(p[1]-q[1]);coast.push([p[0]+k*(q[0]-p[0]),.01,p[2]+k*(q[2]-p[2])])}}
 if(coast.length>=3){for(const pt of coast)if(!pt.normal)pt.normal=terrainNormal(pt,index);
 out.push({v:coast,c:col.map(n=>n*v),normals:coast.map(pt=>pt.normal)})}}
 for(let k=0;k<rows;k++)for(let j=0;j<cols;j++){const a=pts[k][j],b=pts[k][j+1],c=pts[k+1][j],d=pts[k+1][j+1];tile(a,c,b);tile(b,c,d)}return out;
}
function carrier(){
 const f=[],grey=[.31,.35,.36],deck=[.28,.31,.31],light=[.82,.79,.63],dark=[.17,.22,.23];
 function side(a,b,c,d,col){f.push({v:[a,b,c,d],c:col})}
 function box(x,y,z,w,h,l,col){const a=[x-w,y,z-l],b=[x+w,y,z-l],c=[x+w,y,z+l],d=[x-w,y,z+l],top=[a,b,c,d].map(p=>[p[0],y+h,p[2]]);f.push({v:top,c:col});[a,b,c,d].forEach((p,i,arr)=>side(p,arr[(i+1)%4],top[(i+1)%4],top[i],col))}
 const outline=[[-26,-137],[23,-137],[36,-99],[35,-34],[31,-9],[28,116],[17,147],[-15,148],[-26,122],[-32,42],[-44,-28],[-46,-87]];
 const t=outline.map(([x,z])=>[x,16,z]);const edges=z=>{const xs=[];for(let i=0;i<outline.length;i++){const [x,a]=outline[i],[xx,b]=outline[(i+1)%outline.length];if(Math.min(a,b)<=z&&z<Math.max(a,b))xs.push(x+(xx-x)*(z-a)/(b-a))}xs.sort((a,b)=>a-b);return xs};
 const cuts=[...new Set([...outline.map(v=>v[1]),...Array.from({length:25},(_,i)=>-130+i*11)])].sort((a,b)=>a-b);
 for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],lo=edges(a+.001),hi=edges(b-.001);if(lo.length>=2&&hi.length>=2)f.push({v:[[lo[0],16,a],[lo.at(-1),16,a],[hi.at(-1),16,b],[hi[0],16,b]],c:deck});}t.forEach((p,i)=>{const q=t[(i+1)%t.length];side(p,q,[q[0]*.69,0,q[2]*.96],[p[0]*.69,0,p[2]*.96],grey)});
 box(21,16,-37,7,7,27,grey);box(22,23,-38,5.5,8,15,dark);box(22,31,-35,3,5,9,grey);box(22,36,-35,.45,11,.5,dark);
 for(let i=0;i<6;i++){box(22.1,29,-48+i*4,5.6,.9,1.42,[.14,.26,.3]);box(-25,16.10,-96+i*30,.36,.07,9,[.68,.64,.54]);}
 for(let i=0;i<7;i++){const z=-102+i*31;for(const x of [-13,4])for(const d of [-1,1])box(x+d*.35,16.09,z,.19,.015,.17,[.67,.66,.57])}
 for(let z=-119;z<139;z+=15)box(-4,16.04,z,.27,.04,4,light);
 for(const x of [-17,10])box(x,16.04,3,.16,.03,124,light);
 for(let i=0;i<4;i++)box(-4,16.05,-112+4*i,14,.05,.45,light);
 return f;
}
const identity=basis();
const skyVertex='attribute vec2 a;varying vec2 uv;void main(){uv=a;gl_Position=vec4(a,1.,1.);}';
const skyPixel=`precision highp float;varying vec2 uv;uniform mat3 axes;uniform vec4 lens;uniform vec3 haze;uniform vec3 eye;uniform sampler2D pano,waves;uniform float ready;
float hash(vec2 p){return fract(sin(dot(mod(p,180.),vec2(27.1,61.7)))*439.3);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fb(vec2 v){return noise(v)*.55+noise(v*2.04+5.)*.28+noise(v*4.15+8.)*.17;}
void main(){vec3 r=normalize(axes*vec3(uv.x*lens.x,uv.y*lens.y,1.));vec3 sun=normalize(vec3(-.52,.34,.62));float sd=max(dot(r,sun),0.);
vec3 air=mix(haze,vec3(.18,.37,.53)*haze*1.35,pow(max(0.,r.y),.53));
if(r.y>.008){vec2 cp=r.xz/max(r.y+.045,.06)*1.35+eye.xz*.00007;float fog=smoothstep(.42,.74,fb(cp))*smoothstep(.006,.12,r.y);air=mix(air,vec3(.93,.93,.88)*(.84+.16*sd),fog*.78);}
air+=vec3(.22,.19,.11)*pow(sd,17.)+vec3(.6,.52,.34)*smoothstep(.9990,.9998,sd);
if(r.y<0.){float den=max(.012,-r.y);vec2 sea=(eye.xz*.001+r.xz*(eye.y*.001)/den);float n=fb(sea*vec2(4.8,12.)+lens.z*.012);
float stripes=sin(sea.y*95.+n*10.+lens.z*.65)*.5+.5;vec3 water=mix(vec3(.075,.19,.23),vec3(.27,.43,.46),.4*n+.27*stripes*min(1.,den*6.));water+=vec3(.54,.43,.25)*pow(max(dot(reflect(r,vec3(0,1,0)),sun),0.),24.)*(.3+.7*stripes);vec3 wave1=texture2D(waves,sea*.97+vec2(lens.z*.0008,lens.z*.0021)).rgb;
vec3 wave2=texture2D(waves,sea*2.15+vec2(-lens.z*.0013,lens.z*.002)).rgb;
water=mix(water,(wave1*.70+wave2*.30)*haze*1.21+.018,.81);
float mist=exp(-den*12.);air=mix(water,haze,mist*.88);}
float u=1.-abs(mod(.5+atan(r.x,r.z)/2.2,2.)-1.);float v=.678-asin(clamp(r.y,-1.,1.))*.96;vec3 photo=texture2D(pano,vec2(u,clamp(v,.003,.995))).rgb;
float imageMix=(1.-smoothstep(.94,1.29,v))*smoothstep(-.20,.02,v);vec3 tint=haze/vec3(.74,.82,.82);air=mix(air,photo*tint,imageMix*ready*(r.y<0.?(.12+.55*exp(r.y*20.)):.95));
gl_FragColor=vec4(air,1.);}`;
const meshVertex=`precision highp float;attribute vec3 a,n,c;attribute vec4 surface;uniform mat3 axes,obj;uniform vec3 eye,pos;uniform vec4 lens,pose;uniform float scale;varying vec3 color,normal,wp;varying vec2 uv;varying float depth,material;
void main(){vec3 vert=a;float anim=surface.z;
 if(anim>.5&&anim<1.5)vert.y+=(a.z+2.13)*sign(a.x)*pose.x*.24;
 if(anim>1.5&&anim<2.5)vert.y+=(a.z+4.1)*pose.y*.22;
 if(anim>2.5)vert.x+=(a.z+5.42)*pose.x*.31;
 wp=pos+(obj*vert)*scale;vec3 d=wp-eye;
 vec3 cam=vec3(dot(d,axes[0]),dot(d,axes[1]),dot(d,axes[2]));
 normal=obj*n;color=c;uv=surface.xy;depth=cam.z;material=surface.w;
 gl_Position=vec4(cam.x/lens.x,cam.y/lens.y,cam.z*1.000055-.52,cam.z);}`;
const meshPixel=`precision highp float;varying vec3 color,normal,wp;varying vec2 uv;varying float depth,material;
 uniform vec3 haze,eye;uniform float kind;uniform sampler2D metal,island,deck,pano;
 void main(){vec3 n=normalize(normal),v=normalize(eye-wp),light=normalize(vec3(-.51,.83,.34));
 if(dot(n,v)<0.)n=-n;float diffuse=max(dot(n,light),0.);
 vec3 col=color*(.65+.48*diffuse);
 if(kind>.5&&kind<1.5){vec3 broad=texture2D(island,uv*.52).rgb;
 vec3 fine=texture2D(island,uv*2.4+vec2(.36,.41)).rgb;
 col=(broad*.75+fine*.25)*(.63+.54*diffuse);
 col=mix(vec3(.68,.65,.54),col,smoothstep(0.,16.,wp.y));}
 else if(kind<.5){vec3 deckPaint=texture2D(deck,uv).rgb;
 col*=mix(vec3(.68),vec3(1.52),deckPaint);}
 else{
 vec3 r=reflect(-v,n);float skyV=.678-asin(clamp(r.y,-1.,1.))*.96;
 vec3 env=texture2D(pano,vec2(1.-abs(mod(.5+atan(r.x,r.z)/2.2,2.)-1.),clamp(skyV,.01,.99))).rgb;
 float fres=pow(1.-max(dot(n,v),0.),2.8);
 float shine=pow(max(dot(n,normalize(light+v)),0.),33.);
 if(material<.5){vec3 panel=texture2D(metal,uv).rgb;col=color*(.42+panel*1.24)*(.74+.40*diffuse)+env*(.085+.19*fres)+shine*.30;}
 else if(material<1.5){col=mix(vec3(.045,.12,.16),env,.39+.47*fres)+shine*.49;}
 else if(material<2.5){col=color*(.55+.51*diffuse)+env*(.12+.17*fres)+shine*.4;}
 else if(material<3.5){col=vec3(1.,.38,.085);}
 if(material<.5&&kind>2.5)col*=kind<3.5?vec3(1.29,1.06,.68):vec3(.67,1.16,1.39);
 }
 float fog=1.-exp(-max(0.,depth)*.000103);gl_FragColor=vec4(mix(col,haze,fog),1.);}`;
class FlightWorld{
 constructor(canvas){this.canvas=canvas;this.ship=carrier();let gl;
 try{gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});if(gl){this.gl=gl;this.lands=missions.map((_,i)=>landscape(57,i));this.land=this.lands[0];this.setupGL()}}catch(err){console.warn('Rendering fallback',err);this.gl=null}
 if(!this.gl){this.lands=missions.map((_,i)=>landscape(88,i));this.land=this.lands[0];if(gl){const next=canvas.cloneNode();canvas.replaceWith(next);this.canvas=next}this.ctx=this.canvas.getContext('2d');}
 this.pano=new Image();this.pano.onload=()=>{if(this.gl){const g=this.gl;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.tex);g.texImage2D(g.TEXTURE_2D,0,g.RGB,g.RGB,g.UNSIGNED_BYTE,this.pano)}this.ready=true};this.pano.src='horizon.webp';loadMaterials(this);
 }
 setupGL(){const g=this.gl;
 const program=(vs,fs)=>{const p=g.createProgram();for(const [type,src] of [[g.VERTEX_SHADER,vs],[g.FRAGMENT_SHADER,fs]]){const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));g.attachShader(p,s)}g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return p};
 this.tex=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.tex);g.texImage2D(g.TEXTURE_2D,0,g.RGB,1,1,0,g.RGB,g.UNSIGNED_BYTE,new Uint8Array([132,164,179]));for(const p of [g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,p,g.CLAMP_TO_EDGE);for(const p of [g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_2D,p,g.LINEAR);
 this.materialTextures=materialFiles.map((name,i)=>{const tex=g.createTexture();g.activeTexture(g.TEXTURE1+i);g.bindTexture(g.TEXTURE_2D,tex);g.texImage2D(g.TEXTURE_2D,0,g.RGB,1,1,0,g.RGB,g.UNSIGNED_BYTE,new Uint8Array([127,127,127]));for(const p of [g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,p,g.MIRRORED_REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.generateMipmap(g.TEXTURE_2D);return tex});g.activeTexture(g.TEXTURE0);
 this.sky=program(skyVertex,skyPixel);this.geo=program(meshVertex,meshPixel);
 const buf=data=>{const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(data),g.STATIC_DRAW);return b};
 this.quad=buf([-1,-1,3,-1,-1,3]);this.buffers=new Map();for(const faces of [...this.lands,this.ship,runwayMesh,vesselMesh,rocketMesh,wreckMesh,...distantAircraft,...planeMeshes]){const data=[],kind=this.lands.includes(faces)?1:faces===this.ship||faces===vesselMesh||faces===runwayMesh?0:2;for(const f of faces){const n=V.unit(V.cross(V.sub(f.v[1],f.v[0]),V.sub(f.v[2],f.v[0])));for(let j=1;j<f.v.length-1;j++)for(const index of [0,j,j+1]){const v=f.v[index];data.push(...v,...(f.normals?f.normals[index]:n),...f.c,...mapping(v,n,kind),f.control||0,f.material||0)}}this.buffers.set(faces,[buf(data),data.length/13])}
 this.loc=new Map();for(const p of [this.sky,this.geo]){const l={};for(const k of ['axes','obj','eye','haze','lens','scale','pos','kind','ready','pano','metal','island','deck','waves','pose'])l[k]=g.getUniformLocation(p,k);for(const k of ['a','n','c','surface'])l[k]=g.getAttribLocation(p,k);this.loc.set(p,l)}
 }
 camera(eye,axes,w,h){this.eye=eye;this.axes=axes;this.w=w;this.h=h;this.ty=Math.max(.51,.87*h/w);this.tx=this.ty*w/h;}
 project(p){const d=V.sub(p,this.eye),z=V.dot(d,this.axes[2]);return {x:(.5+V.dot(d,this.axes[0])/(2*Math.max(.01,z)*this.tx))*this.w,y:(.5-V.dot(d,this.axes[1])/(2*Math.max(.01,z)*this.ty))*this.h,z}}
 render(objects,m,t){this.land=this.lands[mapIndex];const max=options.graphics==="eco"?760:options.graphics==="high"?1550:1100;const ratio=Math.min(devicePixelRatio||1,1.55,max/Math.max(this.w,this.h));
 const width=Math.round(this.w*ratio),height=Math.round(this.h*ratio);if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height}
 const g=this.gl,items=[[this.land,[0,0,0],identity,1,1],[mapIndex===2?this.ship:runwayMesh,mapIndex===2?m.origin:V.add(m.origin,[0,7,0]),basis(m.heading),1,0],...objects];
 if(!g){this.software(items,m,ratio,t);return}
 g.viewport(0,0,width,height);g.clear(g.DEPTH_BUFFER_BIT);g.disable(g.DEPTH_TEST);
 const use=p=>{g.useProgram(p);const l=this.loc.get(p);g.uniformMatrix3fv(l.axes,false,this.axes.flat());g.uniform3fv(l.eye,this.eye);g.uniform3fv(l.haze,m.haze);g.uniform4f(l.lens,this.tx,this.ty,t,0);return l};
 let l=use(this.sky);g.uniform1f(l.ready,this.ready?1:0);g.uniform1i(l.pano,0);g.uniform1i(l.waves,4);g.bindBuffer(g.ARRAY_BUFFER,this.quad);g.enableVertexAttribArray(l.a);g.vertexAttribPointer(l.a,2,g.FLOAT,false,0,0);g.drawArrays(g.TRIANGLES,0,3);g.disableVertexAttribArray(l.a);
 g.enable(g.DEPTH_TEST);l=use(this.geo);g.uniform1i(l.pano,0);g.uniform1i(l.metal,1);g.uniform1i(l.island,[5,6,2][mapIndex]);g.uniform1i(l.deck,3);
 for(const [faces,pos,axes,scale,kind=2,roll=0,pitch=0] of items){const [buf,count]=this.buffers.get(faces);g.bindBuffer(g.ARRAY_BUFFER,buf);for(const [name,offset] of [['a',0],['n',12],['c',24],['surface',36]]){g.enableVertexAttribArray(l[name]);g.vertexAttribPointer(l[name],name==='surface'?4:3,g.FLOAT,false,52,offset)}g.uniform3fv(l.pos,pos);g.uniformMatrix3fv(l.obj,false,axes.flat());g.uniform1f(l.scale,scale);g.uniform1f(l.kind,kind);g.uniform4f(l.pose,roll,pitch,0,0);g.drawArrays(g.TRIANGLES,0,count)}
 for(const k of ['a','n','c','surface'])g.disableVertexAttribArray(l[k]);
 }
 software(items,m,ratio,t){const g=this.ctx;g.setTransform(ratio,0,0,ratio,0,0);const w=this.w,h=this.h,hz=this.project(V.add(this.eye,[this.axes[2][0]*15000,0,this.axes[2][2]*15000])).y;
 const gr=g.createLinearGradient(0,0,0,h);const split=clamp(hz/h,.01,.99);gr.addColorStop(0,'#4c748e');gr.addColorStop(split-.005,'#c0ced0');gr.addColorStop(split,'#7e9b9f');gr.addColorStop(1,'#254650');g.fillStyle=gr;g.fillRect(0,0,w,h);
 if(this.ready){
 const yaw=Math.atan2(this.axes[2][0],this.axes[2][2]),roll=Math.atan2(-this.axes[0][1],this.axes[1][1]);
 const pw=w*1.53/this.tx,ph=Math.max(pw/3,h*1.25),base=w*.5-pw*(.5+yaw/2.2);
 g.save();g.translate(w*.5,hz);g.rotate(-roll);g.translate(-w*.5,-hz);
 for(let i=-3;i<=3;i++){const x=base+i*pw;if(x>w+ph*.4||x+pw<-ph*.4)continue;g.save();g.translate(x+(Math.abs(i)%2?pw:0),hz-ph*.678);g.scale(Math.abs(i)%2?-1:1,1);g.drawImage(this.pano,0,0,pw,ph);g.drawImage(this.pano,0,this.pano.height*.88,this.pano.width,this.pano.height*.12,0,ph,pw,ph*.9);g.restore()}
 g.restore();if(mapIndex===0||mapIndex===1){g.fillStyle=mapIndex===0?'#d58c4427':'#9fbed719';g.fillRect(0,0,w,h)}
 }
 paintOcean(this,g,m,t);
 const draw=[];this.vertexLookup??=new WeakMap();
 for(const [faces,pos,b,s,kind=2,roll=0,pitch=0] of items){const fixed=faces===this.land;
 if(kind>=2){const cp=this.project(pos);if(cp.z<-18||cp.z>25&&(cp.x<-.15*w||cp.x>w*1.15||cp.y<-.18*h||cp.y>h*1.18))continue}
 let compiled=this.vertexLookup.get(faces);
 if(!compiled){
  const keys=new Map(),vertices=[],index=new Map();
  for(const face of faces){const ids=face.v.map(v=>{const key=v.join(",")+"/"+(face.control||0);let id=keys.get(key);if(id===undefined){id=vertices.length;keys.set(key,id);vertices.push([v,face.control])}return id});index.set(face,ids)}
  compiled={vertices,index};this.vertexLookup.set(faces,compiled);
 }
 const projected=new Array(compiled.vertices.length);
 const point=id=>{if(projected[id])return projected[id];const [v,control]=compiled.vertices[id],wp=fixed?v:V.add(pos,V.mul(localToWorld(b,bendSurface(v,control,roll,pitch)),s));
  const d=V.sub(wp,this.eye),z=V.dot(d,this.axes[2]),sx=V.dot(d,this.axes[0]),sy=V.dot(d,this.axes[1]),den=2*Math.max(.01,z);
  return projected[id]={x:(.5+sx/(den*this.tx))*w,y:(.5-sy/(den*this.ty))*h,z,sx,sy};
 };
 const localEye=fixed?null:b.map(axis=>V.dot(V.sub(this.eye,pos),axis)/s);
 for(const f of faces){
 if(!fixed&&f.normals&&V.dot(f.normals[0],V.sub(localEye,f.v[0]))<-.8)continue;
 if(fixed){const a=f.v[0],rx=a[0]-this.eye[0],ry=a[1]-this.eye[1],rz=a[2]-this.eye[2],k=this.axes[2],depth=rx*k[0]+ry*k[1]+rz*k[2];if(depth<-530)continue;const side=this.axes[0];if(Math.abs(rx*side[0]+ry*side[1]+rz*side[2])>Math.max(0,depth)*this.tx+550)continue}
 let pts=compiled.index.get(f).map(point);
 if(pts.every(p=>p.z<.65))continue;
 const clipped=pts.some(p=>p.z<.65);if(clipped){const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length];if(a.z>=.65)out.push(a);if((a.z>=.65)!==(q.z>=.65)){const u=(.65-a.z)/(q.z-a.z);out.push({z:.65,x:(.5+(a.sx+(q.sx-a.sx)*u)/(1.3*this.tx))*w,y:(.5-(a.sy+(q.sy-a.sy)*u)/(1.3*this.ty))*h})}}pts=out}
 if(pts.length<3||pts.every(v=>v.x<0)||pts.every(v=>v.x>w)||pts.every(v=>v.y<0)||pts.every(v=>v.y>h))continue;
 if(!f.normal)f.normal=V.unit(V.cross(V.sub(f.v[1],f.v[0]),V.sub(f.v[2],f.v[0])));
 const n=fixed?f.normal:localToWorld(b,f.normal),light=.65+.43*Math.abs(V.dot(n,[-.42,.84,.32]));
 let z=pts.reduce((a,v)=>a+v.z,0)/pts.length,fog=1-Math.exp(-z*.00013);
 const deckLayer=faces===this.ship?(f.c[0]===.28?1.2:1):1;
 const material=f.material||0,idx=kind===1?[4,5,1][mapIndex]:kind===0?2:0;
 const uv=clipped||material!==0?null:(f.uv??=(f.v.map(v=>mapping(v,f.normal,kind))));
 const opacity=kind===1?clamp(.93-fog,.16,.90):kind===0?.58:.36;
 const shine=kind>=2?Math.max(0,V.dot(n,[-.44,.79,-.42]))**8:0;
 const surfaceColor=material===1?[.13+shine*.5,.28+shine*.5,.34+shine*.51]:f.c.map((x,k)=>(x+(kind>=2?shine*.21:0))*(material===0&&kind>2?((kind===3?[1.29,1.06,.68]:[.67,1.16,1.39])[k]):1));
 draw.push({pts,z:z*deckLayer,uv,kind,idx,opacity,c:'rgb('+surfaceColor.map((x,i)=>Math.round(255*clamp(x*light*(1-fog)+m.haze[i]*fog,0,1))).join(',')+')'})}}
 draw.sort((a,b)=>b.z-a.z);for(const f of draw){
  g.beginPath();
  if(f.kind===1){const cx=f.pts.reduce((v,p)=>v+p.x,0)/f.pts.length,cy=f.pts.reduce((v,p)=>v+p.y,0)/f.pts.length;f.pts.forEach((p,i)=>{const dx=p.x-cx,dy=p.y-cy,len=Math.hypot(dx,dy)||1;g[i?'lineTo':'moveTo'](p.x+.85*dx/len,p.y+.85*dy/len)})}
  else f.pts.forEach((p,i)=>g[i?'lineTo':'moveTo'](p.x,p.y));
  g.closePath();g.fillStyle=f.c;g.fill();if(f.kind!==1){g.strokeStyle=f.c;g.lineWidth=.44;g.stroke()}if(f.uv)paintFace(g,f,this.materials[f.idx])
 }
 }
}
