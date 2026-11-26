"use strict";

const materialFiles=["metal","island","deck","waves","sand","snow"];
function bendSurface(p,control,roll,pitch){
 if(!control)return p;
 const side=Math.sign(p[0]),q=p.slice();
 if(control===3)q[0]+=(p[2]+5.42)*roll*.31;
 else q[1]+=(p[2]+(control===1?2.13:4.1))*(control===1?side*roll*.24:pitch*.22);
 return q;
}
function mapping(v,normal,kind){
 if(kind===1)return [v[0]/830,v[2]/830];
 if(kind===0)return [(Math.abs(normal[0])>.7?v[1]:v[0])/18,v[2]/18];
 if(Math.abs(normal[1])>.46)return [v[0]/3.7,v[2]/3.7];
 if(Math.abs(normal[2])>.69)return [v[0]/3.7,v[1]/3.7];
 return [v[2]/3.7,v[1]/3.7];
}
function loadMaterials(world){
 world.materials=materialFiles.map((name,i)=>{
  const image=new Image(),m={image,ready:false,patterns:new WeakMap()};
  image.onload=()=>{
   if(world.gl){const gl=world.gl;gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,world.materialTextures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.activeTexture(gl.TEXTURE0)}
   const tile=document.createElement("canvas");tile.width=tile.height=1024;const c=tile.getContext("2d",{willReadFrequently:i===3});
   for(let y=0;y<2;y++)for(let x=0;x<2;x++){c.save();c.translate(x?1024:0,y?1024:0);c.scale(x?-1:1,y?-1:1);c.drawImage(image,0,0,512,512);c.restore()}
   m.tile=tile;m.ready=true;
   if(i===3){const small=document.createElement("canvas");small.width=small.height=256;const sc=small.getContext("2d",{willReadFrequently:true});sc.drawImage(tile,0,0,256,256);m.pixels=sc.getImageData(0,0,256,256).data}
  };image.src=name+".webp";return m;
 });
}
function terrainNormal(p,idx=mapIndex){
 const dx=groundAt(p[0]-35,p[2],idx)-groundAt(p[0]+35,p[2],idx);
 const dz=groundAt(p[0],p[2]-35,idx)-groundAt(p[0],p[2]+35,idx);
 return V.unit([dx,70,dz]);
}
function paintFace(ctx,face,mat){
 const pts=face.pts;if(!mat||!mat.ready||pts.length<3)return;
 const a=pts[0],b=pts[1],c=pts[2];const area=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
 if(Math.abs(area)<(face.kind===1?36:7))return;
 const uv=face.uv;if(!uv||uv.length<3)return;
 const u=uv[0][0]*512,v=uv[0][1]*512;
 const u1=uv[1][0]*512-u,u2=uv[2][0]*512-u,v1=uv[1][1]*512-v,v2=uv[2][1]*512-v;
 const det=u1*v2-u2*v1;if(Math.abs(det)<.005)return;
 const ax=((b.x-a.x)*v2-(c.x-a.x)*v1)/det,bx=((b.y-a.y)*v2-(c.y-a.y)*v1)/det;
 const ay=((c.x-a.x)*u1-(b.x-a.x)*u2)/det,by=((c.y-a.y)*u1-(b.y-a.y)*u2)/det;
 let pattern=mat.patterns.get(ctx);if(!pattern){pattern=ctx.createPattern(mat.tile,"repeat");mat.patterns.set(ctx,pattern)}
 pattern.setTransform({a:ax,b:bx,c:ay,d:by,e:a.x-ax*u-ay*v,f:a.y-bx*u-by*v});
 ctx.globalAlpha=face.opacity;ctx.fillStyle=pattern;ctx.fill();ctx.globalAlpha=1;
}
function paintOcean(world,g,m,t){
 const mat=world.materials[3];if(!mat.pixels)return;
 const w=world.w,h=world.h,W=Math.round((options.graphics==="eco"?220:360)*Math.min(1,w/h)),H=Math.round(W*h/w);
 if(!world.water||world.water.width!==W||world.water.height!==H){
  world.water=document.createElement("canvas");world.water.width=W;world.water.height=H;world.waterCtx=world.water.getContext("2d");world.waterFrame=world.waterCtx.createImageData(W,H);world.waterStamp=-1;
 }
 if(t-world.waterStamp>.046||t<world.waterStamp){
  world.waterStamp=t;const img=world.waterFrame,d=img.data,pix=mat.pixels,[r,u,f]=world.axes,eye=world.eye;
  for(let y=0;y<H;y++){
   const v=(1-2*(y+.5)/H)*world.ty;
   for(let x=0;x<W;x++){
    const i=(y*W+x)*4,screen=(2*(x+.5)/W-1)*world.tx,dy=f[1]+screen*r[1]+v*u[1];
    if(dy>-.013){d[i+3]=0;continue}
    const at=-eye[1]/dy;
    const wx=eye[0]+(f[0]+screen*r[0]+v*u[0])*at,wz=eye[2]+(f[2]+screen*r[2]+v*u[2])*at;
    const j=(((Math.floor(wz*.21+t*1.5)&255)<<8)+(Math.floor(wx*.21+t*.54)&255))*4;
    const j2=(((Math.floor((wz*.4+wx*.09)-t*1.7)&255)<<8)+(Math.floor(wx*.44)&255))*4;
    const fog=Math.min(.85,at/19000),tint=m.haze;
    for(let k=0;k<3;k++){d[i+k]=(pix[j+k]*.7+pix[j2+k]*.3+5)*(1-fog)+255*tint[k]*fog}
    d[i+3]=Math.min(184,Math.max(0,(-dy-.013)*1200));
   }
  }
  world.waterCtx.putImageData(img,0,0);
 }
 g.drawImage(world.water,0,0,w,h);
}
