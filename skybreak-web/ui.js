"use strict";
const $=id=>document.getElementById(id),ico=name=>'<svg class="ico" aria-hidden="true"><use href="#'+name+'"/></svg>';
const getLocal=(k,alt)=>{try{const val=JSON.parse(localStorage.getItem("skybreak.v1."+k));return val===null?alt:val}catch{return alt}};
const putLocal=(k,v)=>{try{localStorage.setItem("skybreak.v1."+k,JSON.stringify(v))}catch{}};
let selectedPlane=clamp(Number(getLocal("airframe",5))||0,0,fleet.length-1)|0,selectedMission=clamp(Number(getLocal("mission",0))||0,0,2)|0;
let logbook=getLocal("logbook",[]);if(!Array.isArray(logbook))logbook=[];logbook=logbook.filter(x=>x&&missions[x.mission]&&fleet[x.plane]&&Number.isFinite(x.score));
let recordBest=Math.max(+getLocal("record",0)||0,...logbook.map(x=>x.score));
const dialog=$("dialog"),content=$("dialogContent");
const stateCount=n=>n===1?"цель":n<5?"цели":"целей";
function refreshRecord(){$("best").textContent=recordBest.toLocaleString("ru-RU");$("rank").textContent=recordBest>=1800?"Ас":recordBest>=600?"Пилот":"Кадет"}
function saveSortie(s){logbook.unshift(s);logbook.length=Math.min(35,logbook.length);recordBest=Math.max(recordBest,s.score);putLocal("logbook",logbook);putLocal("record",recordBest);refreshRecord()}
let closeAction=null;
function showPanel(kicker,title,html,actions=[],onClose=null){closeAction=onClose;content.innerHTML='<div class="modal-kicker">'+kicker+'</div><h2>'+title+'</h2>'+html;
 if(actions.length){const area=document.createElement("div");area.className="actions";for(const [label,action,primary] of actions){const b=document.createElement("button");b.className=primary?"primary":"secondary";b.textContent=label;b.onclick=action;area.append(b)}content.append(area)}
 if(!dialog.open)dialog.showModal();}
function closePanel(){if(dialog.open)dialog.close();closeAction=null}
function dismiss(){const cb=closeAction;closePanel();if(cb)cb()}
dialog.querySelector(".close").onclick=dismiss;dialog.addEventListener("cancel",e=>{e.preventDefault();dismiss()});dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss()}});
const row=(a,b)=>'<div class="data-row"><span>'+a+'</span><strong>'+b+'</strong></div>';
function journal(){const labels={win:"Победа",loss:"Поражение",exit:"Прерван",draw:"Ничья"};
 showPanel("БОРТОВОЙ ЖУРНАЛ","История вылетов",logbook.length?logbook.slice(0,12).map(s=>'<div class="data-row journal-row"><div>'+(s.revision===3?missions[s.mission].title.join(" "):["Тихий рубеж","Янтарный пролив","Синий шторм"][s.mission])+'<small>'+fleet[s.plane].code+' · '+labels[s.status]+' · '+(Array.isArray(s.tally)?'Счёт '+s.tally.join(' : ')+' · Лично '+s.kills:s.kills+' / '+missions[s.mission].goal)+'</small></div><strong>'+s.score+' очк.</strong></div>').join(""):'<p>Здесь появятся результаты твоих вылетов. Выбери самолёт и отправляйся на первую операцию.</p>',[["В ангар",closePanel,true]])}
function help(){showPanel("ЛЁТНАЯ ПОДГОТОВКА","Управление",
 '<p>Веди пальцем по свободной части экрана. Большой круг задаёт направление полёта. Маленькая точка показывает, куда сейчас направлена пушка.</p>'+
 row("Поворот и высота","Свайп / WASD / стрелки")+row("Пушка","Удерживай «Огонь» / пробел")+
 row("Захват","Держи красную метку внутри круга")+row("Пуск после захвата","«Ракета» / R")+
 row("Форсаж","Нажми «Форсаж» / держи Shift")+row("Кобра на Су-27","«Кобра» / F после взлёта")+row("Смена камеры","Камера / C")+row("Пауза","Ⅱ / Esc")+
 '<p class="team-help">Синие метки — твоё звено «Вектор». Красные — звено «Гриф». За каждый сбитый самолёт команда получает очко.</p>',[["Понятно",closePanel,true]])}

$("navLog").onclick=journal;$("navHangar").onclick=closePanel;$("home").onclick=e=>{e.preventDefault();closePanel();window.scrollTo(0,0)};$("help").onclick=help;
let soundOn=getLocal("sound",true)!==false,soundCtx=null,motor=null,amp=null,jetNoise=null,jetTone=null,lastPower=-1;
function soundLabel(){$("sound").innerHTML=ico(soundOn?"audio":"mute");$("sound").ariaLabel=soundOn?"Выключить звук":"Включить звук";$("sound").setAttribute("aria-pressed",soundOn)}
function startAudio(){if(!soundOn)return;try{if(!soundCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;soundCtx=new AC();motor=soundCtx.createOscillator();motor.type="sawtooth";const filter=soundCtx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=195;amp=soundCtx.createGain();amp.gain.value=0;motor.connect(filter).connect(amp).connect(soundCtx.destination);motor.start();
 const buffer=soundCtx.createBuffer(1,soundCtx.sampleRate*2,soundCtx.sampleRate),samples=buffer.getChannelData(0);let low=0;
 for(let i=0;i<samples.length;i++){low=.88*low+.12*(Math.random()*2-1);samples[i]=low*2.6}
 const rush=soundCtx.createBufferSource();rush.buffer=buffer;rush.loop=true;jetNoise=soundCtx.createGain();jetNoise.gain.value=0;jetTone=soundCtx.createBiquadFilter();jetTone.type="lowpass";jetTone.frequency.value=450;rush.connect(jetTone).connect(jetNoise).connect(soundCtx.destination);rush.start();
 }if(soundCtx.state==="suspended")soundCtx.resume().catch(()=>{})}catch{}}
function engine(active,boost=0){
 if(!amp)return;const t=soundCtx.currentTime,power=active&&soundOn?Math.round(Number(boost)*50)/50:-1;
 const effective=(power+2)*(options.engine+1);if(effective===lastPower)return;lastPower=effective;
 const on=power>=0?options.engine:0;
 amp.gain.setTargetAtTime(on*(.021+.027*Math.max(0,power)),t,.12);motor.frequency.setTargetAtTime(53+31*Math.max(0,power)+selectedPlane*2,t,.19);
 if(jetNoise){jetNoise.gain.setTargetAtTime(on*(.065+.31*Math.max(0,power)),t,.16);jetTone.frequency.setTargetAtTime(420+2100*Math.max(0,power),t,.20)}
}
function tone(f,d=.09,type="triangle",gain=.05,to=f*.5){if(!soundOn||!soundCtx||!options.effects)return;const t=soundCtx.currentTime,o=soundCtx.createOscillator(),a=soundCtx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(15,to),t+d);a.gain.setValueAtTime(gain*options.effects,t);a.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(a).connect(soundCtx.destination);o.start(t);o.stop(t+d+.02)}
$("sound").onclick=()=>{soundOn=!soundOn;putLocal("sound",soundOn);if(soundOn){startAudio();tone(520)}else engine(false);soundLabel()};
