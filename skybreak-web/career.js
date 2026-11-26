"use strict";
const thresholds=[0,0,0,300,850,0];
const options=Object.assign({graphics:"auto",battleSize:25,sensitivity:1,buttons:1,invert:false,left:false,engine:.8,effects:.9,skin:0},getLocal("options",{}));
const earned=s=>s.status==="exit"?0:65+Math.min(8,s.kills||0)*38+(s.status==="win"?65:0);
const career=Object.assign({xp:logbook.reduce((v,s)=>v+earned(s),0),wins:logbook.filter(s=>s.status==="win").length,kills:logbook.reduce((v,s)=>v+(s.kills||0),0),flights:logbook.filter(s=>s.status!=="exit").length,trained:false},getLocal("career",{}));
const paintNames=["Заводская","Песчаная","Арктическая"];
const paintLevels=[0,160,550];
const mapImages=["map0","map1","map2"];
function applyOptions(){
 document.body.classList.toggle("leftHand",!!options.left);
 document.documentElement.style.setProperty("--control-scale",options.buttons);
 window.dispatchEvent(new Event("baychange"));
}
function buildCards(){
 const box=$("cards");box.replaceChildren();
 [5,0,1,2,3,4].forEach(i=>{const jet=fleet[i];
  const card=document.createElement("button"),chosen=i===selectedPlane,locked=career.xp<thresholds[i];
  card.className="card"+(chosen?" selected":"");card.setAttribute("aria-pressed",chosen);card.setAttribute("aria-label",jet.code+" "+jet.name+(locked?", для открытия "+thresholds[i]+" опыта":""));
  const status=locked?thresholds[i]+" XP":chosen?"В ангаре":"Доступен";
  card.innerHTML='<div class="card-art"><img src="jet'+i+'.webp" alt=""><span class="plane-status">'+status+'</span></div><div class="card-info"><strong>'+jet.code+' <em>'+jet.name+'</em></strong><small>'+jet.role+'</small></div>';
  card.onclick=()=>{selectedPlane=i;putLocal("airframe",i);buildCards()};box.append(card);
 });
 const jet=fleet[selectedPlane];$("heroCode").textContent=jet.code;$("heroName").textContent=jet.name;
 $("heroRole").textContent=jet.role+"  ·  "+Math.round(jet.speed*1.55*3.6)+" км/ч  ·  Корпус "+jet.armor;
 window.dispatchEvent(new Event("baychange"));
 $("launch").innerHTML=career.xp<thresholds[selectedPlane]?"Открыть за опыт":'<span class="play"></span>В бой';
}
function changeMission(n){
 selectedMission=n;putLocal("mission",n);const box=$("mapCards");box.replaceChildren();
 missions.forEach((m,i)=>{const btn=document.createElement("button");const on=i===n;btn.className="map-choice"+(on?" chosen":"");btn.setAttribute("aria-pressed",on);
 btn.innerHTML='<img src="'+mapImages[i]+'.webp" alt=""><span><small>'+m.area+' · до '+(options.battleSize===25?5*m.goal:m.goal)+' очк.</small><strong>'+m.title.join(" ")+'</strong></span><b aria-hidden="true">'+(on?'✓':'')+'</b>';btn.onclick=()=>changeMission(i);box.append(btn)});
}
function progressPanel(){
 const cards=fleet.map((p,i)=>'<button class="tech" data-plane="'+i+'"><img src="jet'+i+'.webp" alt=""><span><strong>'+p.code+' '+p.name+'</strong><small>'+p.role+'</small></span><em>'+(career.xp>=thresholds[i]?'В строю':thresholds[i]+' XP')+'</em></button>').join("");
 const next=thresholds.find(x=>x>career.xp),badges=[[career.trained,"Ведомый","Пройди обучение"],[career.kills>0,"Первый перехват","Сбей самолёт"],[career.wins>0,"Крыло победы","Выиграй бой"],[career.flights>=10,"Ветеран","Заверши 10 боёв"]];
 showPanel("КАРЬЕРА ПИЛОТА","Ветка развития",'<div class="xp-line"><b>'+career.xp+' XP</b><span>'+(next?'Следующий самолёт · '+next+' XP':'Вся ветка открыта')+'</span></div><progress max="'+(next||1)+'" value="'+(next?career.xp:1)+'"></progress><p>Заверши бой, чтобы получить 65 XP. Победа даёт ещё 65 XP, каждый лично сбитый самолёт — 38 XP, до восьми за вылет.</p><div class="tech-list">'+cards+'</div><h3>Нашивки</h3><div class="badges">'+badges.map(([on,name,goal])=>'<div class="'+(on?'earned':'')+'">'+ico("medal")+'<span><b>'+name+'</b><small>'+goal+'</small></span></div>').join("")+'</div>',[["В ангар",closePanel,true]]);
 for(const el of content.querySelectorAll("[data-plane]"))el.onclick=()=>{selectedPlane=Number(el.dataset.plane);putLocal("airframe",selectedPlane);buildCards();closePanel()};
}
function grantCareer(s,status){
 if(s.training){if(status==="win")career.trained=true;putLocal("career",career);return 0}
 if(status==="exit")return 0;
 const xp=earned({status,kills:s.kills});career.xp+=xp;career.kills+=s.kills;career.flights++;if(status==="win")career.wins++;putLocal("career",career);return xp;
}
function settings(back=closePanel){
 const select=(id,title,values)=>'<label class="setting"><span>'+title+'</span><select id="set-'+id+'" data-opt="'+id+'">'+values.map(([value,label,disabled])=>'<option value="'+value+'" '+(String(options[id])===String(value)?'selected ':'')+(disabled?'disabled':'')+'>'+label+'</option>').join("")+'</select></label>';
 const range=(id,title,min,max,step)=>'<label class="setting slide"><span>'+title+' <output>'+Math.round(options[id]*100)+'%</output></span><input type="range" data-opt="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+options[id]+'"></label>';
 const toggle=(id,title)=>'<label class="setting"><span>'+title+'</span><input type="checkbox" data-opt="'+id+'" '+(options[id]?'checked':'')+'></label>';
 showPanel("ПАРАМЕТРЫ ПОЛЁТА","Настройки",select("graphics","Графика",[["eco","Экономная"],["auto","Сбалансированная"],["high","Высокая"]])+range("sensitivity","Чувствительность",.5,1.8,.05)+range("buttons","Размер кнопок",.8,1.3,.05)+toggle("invert","Инверсия по вертикали")+toggle("left","Огонь под левую руку")+range("engine","Громкость двигателя",0,1,.05)+range("effects","Громкость эффектов",0,1,.05)+select("skin","Окраска самолёта",paintNames.map((x,i)=>[i,x+(career.xp<paintLevels[i]?' · '+paintLevels[i]+' XP':''),career.xp<paintLevels[i]])),[["Готово",back,true]],back===closePanel?null:back);
 for(const input of content.querySelectorAll("[data-opt]"))input.oninput=()=>{const key=input.dataset.opt;options[key]=input.type==="checkbox"?input.checked:key==="graphics"?input.value:Number(input.value);const output=input.parentElement.querySelector("output");if(output)output.textContent=Math.round(options[key]*100)+"%";applyOptions();putLocal("options",options)};
}
function about(){
 showPanel("SKYBREAK · ВОЗДУШНОЕ КРЫЛО","Об игре",'<video controls playsinline preload="metadata" poster="poster-hangar.webp" src="sortie.mp4"></video><p>Подними звено в воздух над каньоном, фьордом или открытым морем. Выбирай бой 3×3 или большой вылет с 24 ботами. На Су-27 можно выполнить «кобру» и снова набрать скорость на форсаже.</p>'+row("Доступ","Бесплатно")+row("Режим","Одиночная игра с ботами")+row("Прогресс","В этом браузере"),[["В ангар",closePanel,true]]);
}
function sfx(kind,volume=1){
 if(!soundOn||!soundCtx||!options.effects)return;
 const ctx=soundCtx,d=kind==="rocket"?.39:kind==="deck"?.13:.36,t=ctx.currentTime,n=Math.ceil(ctx.sampleRate*d),buffer=ctx.createBuffer(1,n,ctx.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<n;i++)data[i]=Math.random()*2-1;
 const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();src.buffer=buffer;filter.type="lowpass";filter.frequency.setValueAtTime(kind==="rocket"?2300:1000,t);filter.frequency.exponentialRampToValueAtTime(110,t+d);amp.gain.setValueAtTime(.23*options.effects*volume,t);amp.gain.exponentialRampToValueAtTime(.0001,t+d);
 src.connect(filter).connect(amp).connect(ctx.destination);src.start();src.stop(t+d);
}
$("navTree").onclick=progressPanel;$("navSettings").onclick=()=>settings();$("about").onclick=about;
buildCards();changeMission(selectedMission);refreshRecord();soundLabel();applyOptions();

function chooseSize(size){
 options.battleSize=size===6?6:25;
 $("wingSmall").setAttribute("aria-pressed",String(options.battleSize===6));$("wingMass").setAttribute("aria-pressed",String(options.battleSize===25));
 putLocal("options",options);changeMission(selectedMission);
}
$("wingSmall").onclick=()=>chooseSize(6);$("wingMass").onclick=()=>chooseSize(25);chooseSize(options.battleSize);
