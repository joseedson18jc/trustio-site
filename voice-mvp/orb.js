const orb=document.querySelector('#orb');const canvas=document.querySelector('#orb-canvas');
if(orb&&canvas){
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:'high-performance'});
 if(!gl){fallback();}else{
 const vs=`#version 300 es
 in vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
 const fs=`#version 300 es
 precision highp float;out vec4 o;uniform vec2 R,M;uniform float T,E,L,P;
 float sat(float x){return clamp(x,0.,1.);}mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
 float h(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fb(vec3 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=n(p)*a;p=p*2.04+vec3(7.1,13.7,5.3);a*=.5;}return v;}
 vec2 sph(vec3 ro,vec3 rd,float q){float b=dot(ro,rd),c=dot(ro,ro)-q*q,d=b*b-c;if(d<0.)return vec2(-1);d=sqrt(d);return vec2(-b-d,-b+d);}
 vec3 warp(vec3 p,float t){p.xz=r(t*.42+M.x*.22)*p.xz;p.xy=r(-t*.23+M.y*.17)*p.xy;p.yz=r(t*.13)*p.yz;float w=fb(p*2.1+t*.12)-.5;p+=.22*vec3(sin(p.y*3.2+t),sin(p.z*3.6-t*.8),sin(p.x*3.1+t*.6))*w;return p;}
 vec3 pal(float x,float y){vec3 a=vec3(.10,.40,1.25),b=vec3(.18,1.05,1.35),c=vec3(.72,.42,1.45),w=vec3(1.15,1.32,1.45);vec3 z=mix(a,b,smoothstep(.15,.58,x));z=mix(z,c,smoothstep(.48,.88,x)*(.45+.25*P));z=mix(z,w,smoothstep(.72,1.,y));return z;}
 float star(vec3 p,float s,float q){vec3 c=floor(p*s),f=fract(p*s)-.5;return smoothstep(q,1.,h(c))*exp(-dot(f,f)*520.);}
 void main(){vec2 uv=(gl_FragCoord.xy*2.-R)/min(R.x,R.y);float d=length(uv);float glow=exp(-pow(max(d-.47,0.)*3.0,2.))* (1.-smoothstep(.66,1.2,d));
 vec3 ro=vec3(M.x*.045,M.y*.035,3.08+sin(T*.32)*.012);vec3 rd=normalize(vec3(uv*1.03,-2.68));vec2 q=sph(ro,rd,.99);
 if(q.x<0.){vec3 hc=mix(vec3(.12,.42,1.2),vec3(.58,.20,1.1),.5+.5*sin(T*.17));float a=glow*(.07+E*.07);o=vec4(hc*a,a);return;}
 float tn=max(q.x,0.),tf=q.y,len=tf-tn,ds=len/42.,tt=tn+ds*.35,time=T*(.22+E*.16);vec3 ac=vec3(0);float al=0.;
 for(int i=0;i<42;i++){vec3 p=ro+rd*tt,v=warp(p,time);float ri=sat(1.-length(p));float f1=fb(v*1.75+vec3(0,time*.13,0)),f2=fb(v*3.2-vec3(time*.08,0,3.7)),f3=fb(v*5.4+2.3);
 float fold1=exp(-abs(v.y+.24*sin(v.x*3.5+time*1.5)+.13*sin(v.z*4.7-time))*7.0);float fold2=exp(-abs(v.x*.62-v.z*.26+.18*sin(v.y*5.1-time*.8))*8.2);float core=exp(-length(v*vec3(.95,1.08,.9))*2.25);
 float cloud=smoothstep(.38,.76,f1*.72+f2*.42);float dens=(cloud*.55+fold1*.72+fold2*.46+core*.36)*(.65+E*.55+L*.26)*smoothstep(.01,.18,ri);
 float caust=pow(sat(sin((f2+fold1)*12.+time*2.)*.5+.5),5.)*(fold1+fold2)*.55;float lum=sat(f1*.62+f2*.35+fold1*.30);vec3 col=pal(lum,core+caust);col*=.62+fold1*1.05+fold2*.62+caust*1.7+f3*.18;
 float sa=star(v+vec3(.1),11.,.982),sb=star(v*1.17-vec3(.7),17.,.990);float la=clamp(dens*ds*(1.18+E*.42),0.,.19);ac+=(1.-al)*col*la*2.3;ac+=(1.-al)*vec3(.75,1.05,1.35)*(sa+sb*.72)*(.24+E*.18);al+=(1.-al)*la;tt+=ds;}
 vec3 sp=ro+rd*tn,no=normalize(sp),vd=normalize(-rd),ld=normalize(vec3(-.62,.72,.84)),hd=normalize(ld+vd);float ndv=sat(dot(no,vd)),fr=pow(1.-ndv,2.45),spec=pow(sat(dot(no,hd)),76.),soft=pow(sat(dot(no,hd)),13.);
 vec3 shell=vec3(.04,.12,.28)*(.15+.62*fr);shell+=vec3(.18,.88,1.35)*fr*.78+vec3(.72,.28,1.25)*fr*.34*(.55+.45*no.x);shell+=vec3(1.18,1.32,1.45)*spec*.72+vec3(.22,.55,1.0)*soft*.25;
 float pearl=exp(-pow(length(uv-vec2(-.16,.13))/.43,2.))*(.055+.05*E);vec3 fc=ac+shell+vec3(.34,.82,1.28)*pearl;fc=fc/(1.+fc*.34);fc=pow(max(fc,0.),vec3(.82));float aa=max(.72+fr*.27,sat(al*1.5));o=vec4(fc,aa);}`;
 function sh(t,s){const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS)){console.error(gl.getShaderInfoLog(x));return null;}return x}const v=sh(gl.VERTEX_SHADER,vs),f=sh(gl.FRAGMENT_SHADER,fs),p=gl.createProgram();if(!v||!f){fallback();}else{gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){fallback();}else{
 gl.useProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);const U={R:gl.getUniformLocation(p,'R'),M:gl.getUniformLocation(p,'M'),T:gl.getUniformLocation(p,'T'),E:gl.getUniformLocation(p,'E'),L:gl.getUniformLocation(p,'L'),P:gl.getUniformLocation(p,'P')};
 const tune={idle:[.66,.72,.28],connecting:[.82,1.35,.48],listening:[.76,.92,.38],thinking:[1.,1.62,.82],speaking:[.92,1.18,.62]};let state='idle',mx=0,my=0,w=1,hg=1,tm=0,last=performance.now();
 function resize(){const z=orb.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,innerWidth<700?1.35:1.7);w=Math.max(1,Math.round(z.width*dpr));hg=Math.max(1,Math.round(z.height*dpr));if(canvas.width!==w||canvas.height!==hg){canvas.width=w;canvas.height=hg;gl.viewport(0,0,w,hg);}}
 function frame(now){resize();const dt=Math.min((now-last)/1000,.05);last=now;const t=tune[state]||tune.idle;tm+=dt*t[1]*(matchMedia('(prefers-reduced-motion: reduce)').matches?.08:1);const lv=parseFloat(getComputedStyle(orb).getPropertyValue('--voice-level'))||0;gl.uniform2f(U.R,w,hg);gl.uniform2f(U.M,mx,my);gl.uniform1f(U.T,tm);gl.uniform1f(U.E,t[0]);gl.uniform1f(U.L,lv);gl.uniform1f(U.P,t[2]);gl.drawArrays(gl.TRIANGLES,0,6);requestAnimationFrame(frame)}
 orb.addEventListener('pointermove',e=>{const z=orb.getBoundingClientRect();mx=((e.clientX-z.left)/z.width-.5)*2;my=-(((e.clientY-z.top)/z.height-.5)*2)});orb.addEventListener('pointerleave',()=>{mx=0;my=0});window.setOrbState=s=>{state=tune[s]?s:'idle';orb.dataset.state=state};requestAnimationFrame(frame);
 }}}
 }
 function fallback(){const c=canvas.getContext('2d');if(!c)return;const z=orb.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=z.width*d;canvas.height=z.height*d;c.scale(d,d);const g=c.createRadialGradient(z.width*.34,z.height*.25,4,z.width*.5,z.height*.5,z.width*.48);g.addColorStop(0,'#ffffff');g.addColorStop(.10,'#89f4ff');g.addColorStop(.34,'#5ba8ff');g.addColorStop(.62,'#7d68ff');g.addColorStop(1,'rgba(32,42,110,.08)');c.fillStyle=g;c.beginPath();c.arc(z.width/2,z.height/2,z.width*.46,0,Math.PI*2);c.fill();}
}
