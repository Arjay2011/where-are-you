/* ===== 小猫躲猫猫 · 主逻辑 =====
   躲藏原理：
   每个障碍物（灌木/石头/树桩/草丛）由若干"圆/椭圆"拼成，所有圆的最高点
   都在同一条水平线 y-h 上。于是：
   - 可以算出障碍物在任意 x 处的"表面高度" coverTopAt(x)
   - 可以算出障碍物在任意 y 处的"左右边界" coverEdgeX(y)
   角色只画要露出的那一块，障碍物画在角色之上 → 自然衔接。
*/
(function(){
'use strict';

const SCENE_H = 1040;
let SCENE_W = 520;
const HORIZON = 330;

const S = { diff:1, targets:[], found:new Set(), hidden:[], running:false };

const $ = id => document.getElementById(id);
const L = {
  far:$('l-far'), mid:$('l-mid'), chars:$('l-chars'),
  covers:$('l-covers'), fore:$('l-fore'), cat:$('l-cat'), hit:$('l-hit')
};

const rnd  = (a,b)=> a + Math.random()*(b-a);
const rndI = (a,b)=> Math.floor(rnd(a,b+1));
const pick = a => a[Math.floor(Math.random()*a.length)];
function shuffle(a){ const r=a.slice(); for(let i=r.length-1;i>0;i--){const j=rndI(0,i);[r[i],r[j]]=[r[j],r[i]];} return r; }

/* ================= 音效 ================= */
let AC=null;
function ac(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ AC=null; } }
  if(AC && AC.state==='suspended') AC.resume();
  return AC;
}
function tone(f,dur,type,vol,delay){
  const c=ac(); if(!c) return;
  const t0=c.currentTime+(delay||0);
  const o=c.createOscillator(), g=c.createGain();
  o.type=type||'sine'; o.frequency.value=f;
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol||0.2,t0+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.05);
}
function slide(f1,f2,dur,type,vol,delay){
  const c=ac(); if(!c) return;
  const t0=c.currentTime+(delay||0);
  const o=c.createOscillator(), g=c.createGain();
  o.type=type||'triangle';
  o.frequency.setValueAtTime(f1,t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(40,f2),t0+dur);
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol||0.18,t0+0.03);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.05);
}
const SFX = {
  tap(){ tone(680,0.08,'triangle',0.16); },
  ok(){ [784,988,1319].forEach((f,i)=>tone(f,0.14,'triangle',0.18,i*0.07)); },
  wrong(){ slide(320,170,0.3,'sine',0.12); },
  num(i){ tone(520+i*42,0.16,'sine',0.18); },
  win(){ [523,659,784,1047,1319,1568].forEach((f,i)=>tone(f,0.3,'triangle',0.18,i*0.11)); }
};

/* ================= 语音 ================= */
let voices=[];
function loadVoices(){ if('speechSynthesis' in window) voices = window.speechSynthesis.getVoices()||[]; }
if('speechSynthesis' in window){ loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
function speak(txt,rate,pitch){
  if(!('speechSynthesis' in window) || !txt) return false;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(txt);
    u.lang='zh-CN'; u.rate=rate||0.92; u.pitch=pitch||1.18; u.volume=1;
    const zh=voices.find(v=>/zh|Chinese|中文|普通话/i.test((v.lang||'')+' '+(v.name||'')));
    if(zh) u.voice=zh;
    window.speechSynthesis.speak(u);
    return true;
  }catch(e){ return false; }
}
function stopSpeak(){ if('speechSynthesis' in window){ try{ window.speechSynthesis.cancel(); }catch(e){} } }

/* ================= 障碍物 ================= */
function buildCover(type, x, y, w, h){
  const rx = w/2, blobs=[], extra=[];
  const B=(cx,cy,brx,bry,fill)=>blobs.push({cx,cy,rx:brx,ry:bry,fill});

  if(type==='bush'){
    const r = Math.min(h*0.56, rx*0.64);
    B(x-rx*0.46, y-h+r, r*0.94, r, '#3E9E4F');
    B(x+rx*0.50, y-h+r, r*0.86, r, '#4FB25C');
    B(x,         y-h+r, r*1.04, r, '#5CC267');
    B(x-rx*0.16, y-h+r*1.06, r*0.60, r*0.70, '#6ED179');
    B(x+rx*0.30, y-h+r*1.10, r*0.40, r*0.48, '#7FDD88');
    extra.push(`<ellipse cx="${x}" cy="${y+2}" rx="${rx*1.02}" ry="${h*0.09}" fill="#3C8C45"/>`);
  } else if(type==='rock'){
    const r = Math.min(h*0.58, rx*0.60);
    // 一块有棱角的石头，坐在地上
    extra.push(`<path d="M${x-rx*0.96} ${y} q${-rx*0.1} ${-h*0.62} ${rx*0.34} ${-h*0.78}
                          q${rx*0.44} ${-h*0.16} ${rx*0.62} ${h*0.78} Z" fill="#C3CBD4"/>`);
    extra.push(`<path d="M${x-rx*0.5} ${y} q${rx*0.04} ${-h*0.42} ${rx*0.4} ${-h*0.5}
                          q${rx*0.3} ${h*0.16} ${rx*0.42} ${h*0.5} Z" fill="#AEB8C2"/>`);
    extra.push(`<path d="M${x-rx*0.62} ${y-h*0.56} q${rx*0.22} ${-h*0.22} ${rx*0.56} ${-h*0.06}
                          l${-rx*0.16} ${h*0.22} Z" fill="#DDE4EA"/>`);
    extra.push(`<ellipse cx="${x}" cy="${y+2}" rx="${rx}" ry="${h*0.1}" fill="#7E8892" opacity=".4"/>`);
  } else if(type==='stump'){
    const ry = Math.min(h*0.13, rx*0.28);
    B(x, y-h+ry, rx, ry, '#C08A4E');
    B(x, y-h+ry*0.9, rx*0.74, ry*0.78, '#D2A165');
    B(x, y-h+ry*0.85, rx*0.38, ry*0.55, '#E2BC86');
    extra.push(`<path d="M${x-rx*0.96} ${y} L${x-rx*0.90} ${y-h+ry*1.1} L${x+rx*0.90} ${y-h+ry*1.1} L${x+rx*0.96} ${y} Z" fill="#8A5F35"/>`);
    extra.push(`<path d="M${x-rx*0.62} ${y} L${x-rx*0.58} ${y-h+ry*1.4} L${x-rx*0.24} ${y-h+ry*1.4} L${x-rx*0.22} ${y} Z" fill="#A5753F"/>`);
    // 树皮纹
    for(let i=-2;i<=2;i++){
      extra.push(`<path d="M${x+i*rx*0.34} ${y-6} q${i*2} ${-h*0.3} ${i*3} ${-h*0.44}" stroke="#7A5230" stroke-width="2" fill="none" opacity=".45"/>`);
    }
    extra.push(`<ellipse cx="${x}" cy="${y+2}" rx="${rx*1.05}" ry="${rx*0.14}" fill="#3C8C45" opacity=".45"/>`);
  } else { // grass 草丛：实心草墩
    const r = Math.min(h*0.46, rx*0.40);
    for(let i=-2;i<=2;i++)
      B(x+i*rx*0.40, y-h+r, r*0.96, r, i%2 ? '#4FB25C' : '#5CC267');
    B(x, y-h+r*1.05, rx*0.5, r*0.72, '#6ED179');
    for(let i=-3;i<=3;i++){
      const bx = x + i*(rx*0.30);
      extra.push(`<path d="M${bx} ${y+2} q${i*5} ${-h*0.55} ${i*8} ${-h*0.82}" stroke="#63BB4E" stroke-width="5" stroke-linecap="round" fill="none"/>`);
    }
    extra.push(`<ellipse cx="${x}" cy="${y+2}" rx="${rx}" ry="${h*0.09}" fill="#4C9E4A" opacity=".5"/>`);
  }
  return { type, x, y, w, h, rx, blobs, extra,
           x0:x-rx*1.8, x1:x+rx*1.8, noSide:(type==='grass') };
}
function coverSVG(c){
  return `<g>${c.blobs.map(b=>`<ellipse cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}" fill="${b.fill}"/>`).join('')}${c.extra.join('')}</g>`;
}
function coverHit(c, x, y){
  for(const b of c.blobs){
    const dx=(x-b.cx)/b.rx, dy=(y-b.cy)/b.ry;
    if(dx*dx+dy*dy <= 1) return true;
  }
  return false;
}
/* 障碍物在 x 处的表面高度（找不到返回 null） */
function coverTopAt(c, x){
  let best=null;
  for(const b of c.blobs){
    const t=(x-b.cx)/b.rx;
    if(Math.abs(t)<=1){
      const yy=b.cy-b.ry*Math.sqrt(1-t*t);
      if(best===null||yy<best) best=yy;
    }
  }
  return best;
}
/* 障碍物在高度 y 处的左右边界 */
function coverEdgeX(c, y, side){
  let lo=null, hi=null;
  for(let i=0;i<=160;i++){
    const x=c.x0+(c.x1-c.x0)*i/160;
    if(coverHit(c,x,y)){ if(lo===null) lo=x; hi=x; }
  }
  return side==='L' ? lo : hi;
}

/* ================= 自适应布局 ================= */
function layout(){
  const r = $('app').getBoundingClientRect();
  const aspect = r.width / Math.max(1, r.height);
  // viewBox 宽高比 = 容器宽高比 → 刚好铺满，不变形也不留黑边
  SCENE_W = Math.max(320, Math.round(SCENE_H * aspect));
  $('scene').setAttribute('viewBox', `0 0 ${SCENE_W} ${SCENE_H}`);
  $('scene').setAttribute('preserveAspectRatio', 'xMidYMid meet');
  drawScene();
  if(S.hidden.length) renderRound();
}

/* ================= 背景 ================= */
function drawScene(){
  const W=SCENE_W, far=[], mid=[], fore=[];
  const F = v => Math.round(v*W);

  far.push(`<rect x="0" y="0" width="${W}" height="${SCENE_H}" fill="#BFEAF8"/>`);
  far.push(`<circle cx="${F(0.84)}" cy="78" r="52" fill="#FFE27A" opacity=".3"/>
            <circle cx="${F(0.84)}" cy="78" r="39" fill="#FFE27A"/>
            <circle cx="${F(0.84)-10}" cy="73" r="3.8" fill="#F2B441"/><circle cx="${F(0.84)+10}" cy="73" r="3.8" fill="#F2B441"/>
            <path d="M${F(0.84)-8} 86 q8 10 16 0" stroke="#F2B441" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  const cloud=(fx,y,s)=>`<g transform="translate(${F(fx)},${y}) scale(${s})" fill="#fff" opacity=".95">
    <ellipse cx="0" cy="0" rx="38" ry="22"/><ellipse cx="28" cy="6" rx="28" ry="17"/>
    <ellipse cx="-27" cy="7" rx="25" ry="15"/></g>`;
  far.push(cloud(0.20,92,1), cloud(0.55,62,.68), cloud(0.74,158,.48));
  far.push(`<path d="M0 ${HORIZON} L${F(0.15)} ${HORIZON-72} L${F(0.30)} ${HORIZON} Z" fill="#AEDC8C"/>
            <path d="M${F(0.20)} ${HORIZON} L${F(0.39)} ${HORIZON-104} L${F(0.58)} ${HORIZON} Z" fill="#93CE72"/>
            <path d="M${F(0.50)} ${HORIZON} L${F(0.65)} ${HORIZON-76} L${F(0.82)} ${HORIZON} Z" fill="#AEDC8C"/>
            <path d="M${F(0.73)} ${HORIZON} L${F(0.87)} ${HORIZON-58} L${W} ${HORIZON} Z" fill="#93CE72"/>`);
  far.push(`<rect x="0" y="${HORIZON}" width="${W}" height="${SCENE_H-HORIZON}" fill="#8FD35C"/>`);
  far.push(`<path d="M0 ${HORIZON+28} Q${F(0.27)} ${HORIZON+8} ${F(0.52)} ${HORIZON+28} T${W} ${HORIZON+22} L${W} ${SCENE_H} L0 ${SCENE_H} Z" fill="#7FC94F"/>`);
  const pc=F(0.46);
  far.push(`<path d="M${pc-46} ${HORIZON} Q${pc-30} ${HORIZON+120} ${pc-40} ${HORIZON+300}
              Q${pc-50} ${HORIZON+520} ${pc-96} ${SCENE_H}
              L${pc+96} ${SCENE_H}
              Q${pc+50} ${HORIZON+520} ${pc+40} ${HORIZON+300}
              Q${pc+30} ${HORIZON+120} ${pc+46} ${HORIZON} Z" fill="#EBD3A3"/>`);

  const flower=(fx,y,c,s)=>`<g transform="translate(${F(fx)},${y}) scale(${s||1})">
    <path d="M0 0 V-15" stroke="#5FA845" stroke-width="3" stroke-linecap="round"/>
    <circle cx="0" cy="-20" r="6" fill="${c}"/><circle cx="0" cy="-20" r="2.4" fill="#FFF3B0"/></g>`;
  mid.push(flower(0.06,380,'#FF9EB5'), flower(0.95,372,'#FFD24A'), flower(0.68,386,'#C9A0FF'),
           flower(0.42,432,'#FF9EB5',.9), flower(0.17,418,'#FFD24A',.85), flower(0.87,458,'#C9A0FF',.9),
           flower(0.20,560,'#FFD24A',1), flower(0.86,590,'#FF9EB5',1.1), flower(0.40,640,'#C9A0FF',1),
           flower(0.70,690,'#FFD24A',1.2), flower(0.14,730,'#FF9EB5',1.1), flower(0.92,760,'#C9A0FF',1.1),
           flower(0.52,830,'#FFD24A',1.3), flower(0.24,880,'#FF9EB5',1.2), flower(0.84,900,'#FFD24A',1.2));
  const tuft=(fx,y,s)=>`<g transform="translate(${F(fx)},${y}) scale(${s})" stroke="#63BB4E" stroke-width="4" stroke-linecap="round" fill="none">
    <path d="M0 0 q-7 -20 -19 -27"/><path d="M0 0 q3 -24 -2 -33"/><path d="M0 0 q9 -20 19 -25"/></g>`;
  mid.push(tuft(0.38,400,.9), tuft(0.80,420,1), tuft(0.16,478,1.1), tuft(0.62,506,1.2), tuft(0.94,520,1.1),
           tuft(0.30,596,1.3), tuft(0.72,618,1.2), tuft(0.44,700,1.4), tuft(0.14,690,1.2), tuft(0.88,712,1.3),
           tuft(0.34,830,1.5), tuft(0.78,860,1.4), tuft(0.12,880,1.4), tuft(0.60,930,1.6), tuft(0.92,900,1.3));
  mid.push(`<ellipse cx="${F(0.09)}" cy="590" rx="50" ry="14" fill="#6FB94F" opacity=".45"/>
            <ellipse cx="${F(0.90)}" cy="720" rx="56" ry="15" fill="#6FB94F" opacity=".4"/>
            <ellipse cx="${F(0.44)}" cy="560" rx="46" ry="13" fill="#6FB94F" opacity=".38"/>
            <ellipse cx="${F(0.20)}" cy="790" rx="58" ry="16" fill="#6FB94F" opacity=".38"/>
            <ellipse cx="${F(0.70)}" cy="900" rx="64" ry="17" fill="#6FB94F" opacity=".36"/>`);

  const tree=(fx,y,s)=>`<g transform="translate(${F(fx)},${y}) scale(${s})">
    <rect x="-14" y="-82" width="28" height="86" rx="9" fill="#9A6B3F"/>
    <rect x="-8" y="-82" width="8" height="82" rx="4" fill="#B07C4B"/>
    <circle cx="-35" cy="-96" r="37" fill="#3E9E4F"/><circle cx="33" cy="-102" r="41" fill="#4FB25C"/>
    <circle cx="0" cy="-130" r="46" fill="#5CC267"/><circle cx="-17" cy="-124" r="27" fill="#6ED179" opacity=".85"/>
    <ellipse cx="-4" cy="-33" rx="33" ry="8" fill="#4C8F45" opacity=".35"/></g>`;
  mid.push(tree(0.02,350,.66), tree(0.99,346,.58));
  fore.push(tree(0.02,1044,1.25), tree(0.99,1048,1.15));

  L.far.innerHTML  = far.join('');
  L.mid.innerHTML  = mid.join('');
  L.fore.innerHTML = fore.join('');
}

/* ================= 躲藏点 =================
   fx: 横向位置（占屏宽比例）  w/h: 障碍物尺寸  s: 角色缩放
   尺寸用绝对世界单位（世界高 1040），横向位置按屏宽比例分布 */
function makeSpots(){
  const W=SCENE_W;
  const u = Math.max(0.86, Math.min(1.14, W/520));   // 尺寸缩放（限制范围，别把灌木撑爆）
  const defs=[
    { fx:0.15, y:432,  cover:'bush',  w:182, h:80,  s:0.68 },
    { fx:0.55, y:420,  cover:'rock',  w:160, h:68,  s:0.64 },
    { fx:0.88, y:436,  cover:'grass', w:172, h:74,  s:0.66 },
    { fx:0.32, y:522,  cover:'stump', w:128, h:106, s:0.86 },
    { fx:0.76, y:528,  cover:'bush',  w:194, h:92,  s:0.86 },
    { fx:0.08, y:614,  cover:'rock',  w:172, h:80,  s:0.98 },
    { fx:0.50, y:622,  cover:'grass', w:176, h:80,  s:1.02 },
    { fx:0.92, y:610,  cover:'bush',  w:184, h:88,  s:0.96 },
    { fx:0.26, y:708,  cover:'bush',  w:206, h:100, s:1.16 },
    { fx:0.68, y:716,  cover:'stump', w:146, h:124, s:1.20 },
    { fx:0.06, y:800,  cover:'grass', w:180, h:84,  s:1.14 },
    { fx:0.87, y:796,  cover:'bush',  w:192, h:96,  s:1.12 },
    { fx:0.20, y:890,  cover:'rock',  w:190, h:88,  s:1.24 },
    { fx:0.68, y:898,  cover:'grass', w:186, h:86,  s:1.22 }
  ];
  return defs.map(d=>{
    const w=Math.round(d.w*u), h=Math.round(d.h*u), s=d.s*u;
    const rx=w/2, x=Math.round(d.fx*W);
    return { x:Math.max(rx+2, Math.min(W-rx-2, x)), y:d.y, w, h, s, cover:d.cover };
  });
}

/* ================= 生成一局 =================
   每个目标：先挑一个"露出方式"，再验证
     ① 露出的部分在场景内
     ② 不和小猫重叠
     ③ 不和别的目标重叠
   不满足就换一个露出方式 / 换一个位置 */
function buildRound(diff){
  S.diff = diff;
  S.targets = shuffle(CH.targets).slice(0, diff);
  S.found = new Set();

  const spots = shuffle(makeSpots());
  const placed = [];              // 已放好的 {g, key, spot}
  const catBox = catRect();

  S.targets.forEach(key=>{
    const cands = shuffle(CH[key].peeks.slice());
    let done = false;
    // 换位置：先试所有位置
    for(const sp of spots){
      if(done) break;
      if(placed.some(p=>Math.abs(p.spot.x-sp.x) < (p.spot.w+sp.w)*0.34 && Math.abs(p.spot.y-sp.y) < 80)) continue;
      const cov = buildCover(sp.cover, sp.x, sp.y, sp.w, sp.h);
      for(const pk of cands){
        const g = peekGeom(key, pk, sp, cov);
        if(!g) continue;
        if(!boxInScene(g)) continue;
        if(boxOverlap(g, catBox)) continue;
        if(placed.some(p=>boxOverlap(g, p.g) || hitOverlap(g, p.g))) continue;
        placed.push({ key, spot:sp, cover:cov, peek:pk, g, id:'h'+placed.length+'_'+(Math.random()*1e6|0) });
        done = true;
        break;
      }
    }
    // 兜底：随便放一个（极端情况，保证游戏能玩）
    if(!done){
      const sp = spots[placed.length % spots.length];
      const cov = buildCover(sp.cover, sp.x, sp.y, sp.w, sp.h);
      const pk = cands[0] || {type:'head',part:'head'};
      const g = peekGeom(key, pk, sp, cov);
      placed.push({ key, spot:sp, cover:cov, peek:pk, g, id:'h'+placed.length+'_'+(Math.random()*1e6|0) });
    }
  });

  S.hidden = placed;
  renderRound();
}
/* 露出的部分是否在场景内 */
function boxInScene(g){
  const W = SCENE_W, M = 10;
  return g.vx >= -M && g.vy >= -M && g.vx+g.vw <= W+M && g.vy+g.vh <= SCENE_H+M;
}
/* 命中区矩形（露出的可见区 + 余量，最小 76 单位，方便小朋友点） */
const MINHIT = 76;
function hitRectOf(g){
  const pad = Math.max(6, (MINHIT - Math.min(g.vw,g.vh))/2);
  return { vx:g.vx-pad, vy:g.vy-pad, vw:g.vw+pad*2, vh:g.vh+pad*2 };
}
/* 两个矩形是否重叠（留一点间隙） */
function boxOverlap(a, b, gap){
  gap = gap||6;
  return !(a.vx+a.vw+gap < b.vx || b.vx+b.vw+gap < a.vx ||
           a.vy+a.vh+gap < b.vy || b.vy+b.vh+gap < a.vy);
}
/* 命中区之间是否重叠 */
function hitOverlap(a, b){
  const A=hitRectOf(a), B=hitRectOf(b);
  return boxOverlap(A, B, 4);
}
/* 小猫占据的矩形（避免被遮挡物盖住） */
function catRect(){
  const c = CH.cat;
  const u = Math.max(0.86,Math.min(1.14, SCENE_W/520));
  const scale = (CH.CHAR_H*1.06*u) / c.nat[1];
  const iw = c.nat[0]*scale, ih = c.nat[1]*scale;
  const cx = Math.round(SCENE_W*0.20), gy = Math.round(SCENE_H-10);
  return { vx:cx-iw/2, vy:gy-ih, vw:iw, vh:ih };
}

/* ================= 单个角色的露出几何 =================
   角色是一张透明 PNG；region 决定"露出哪一块"。

   统一做法：把角色放在障碍物"后面"，再用 clipPath 裁出要露的区域，
   最后把障碍物画在角色上面 → 被挡住的边缘自然接上障碍物轮廓。

   side / snout / tail / trunk  这些"从边缘探出"的方式，
   不是把整块挪到障碍物外面，而是让角色横跨障碍物边缘，
   只有伸出去的那部分露在障碍物轮廓之外。 */
function peekGeom(key, pk, sp, cov){
  const c = CH[key];
  const reg = c.regions[pk.region];
  if(!reg) return null;                     // 防御：区域没配好就跳过
  const natW = c.nat[0], natH = c.nat[1];
  const scale = (CH.CHAR_H * sp.s) / natH;
  const iw = natW*scale, ih = natH*scale;

  const top = sp.y - sp.h;
  const rx = sp.w/2;
  let ix, iy;

  if(pk.type==='head' || pk.type==='small'){
    // 整块压在障碍物顶边 → 下半被挡，只露上半
    const partH = reg[3]*scale;
    const overlap = pk.type==='small' ? partH*0.60 : partH*0.42;
    const surf = coverTopAt(cov, sp.x);
    const baseY = (surf===null ? top : surf) + overlap;
    iy = baseY - (reg[1]+reg[3])*scale;
    ix = sp.x - (reg[0]+reg[2]/2)*scale;
  } else if(pk.type==='side'){
    // 从障碍物左侧探出：约 45% 在外，55% 被障碍物挡住
    const probeY = sp.y - sp.h*0.60;
    const edge = coverEdgeX(cov, probeY, 'L');
    const left = (edge===null ? sp.x-rx : edge);
    const vis = reg[2]*scale;
    ix = (left - vis*0.45) - reg[0]*scale;
    // 别伸出画面外
    const minX = -reg[0]*scale + 6;
    if(ix < minX) ix = minX;
    iy = probeY - (reg[1]+reg[3]*0.58)*scale;
  } else if(pk.type==='snout'){
    // 长吻横向探出：从障碍物左侧伸出约一半
    const probeY = sp.y - sp.h*0.46;
    const edge = coverEdgeX(cov, probeY, 'L');
    const left = (edge===null ? sp.x-rx : edge);
    const vis = reg[2]*scale;
    ix = (left - vis*0.50) - reg[0]*scale;
    iy = probeY - (reg[1]+reg[3]*0.5)*scale;
  } else if(pk.type==='trunk'){
    // 象鼻子从障碍物左侧垂下
    const probeY = sp.y - sp.h*0.28;
    const edge = coverEdgeX(cov, probeY, 'L');
    const left = (edge===null ? sp.x-rx : edge);
    const vis = reg[2]*scale;
    ix = (left - vis*0.40) - reg[0]*scale;
    iy = (probeY - reg[1]*scale) + reg[3]*scale*0.08;
  } else {
    // 尾巴 / 翅膀 / 前爪：从障碍物右侧伸出约一半
    const probeY = sp.y - sp.h*0.46;
    const edge = coverEdgeX(cov, probeY, 'R');
    const right = (edge===null ? sp.x+rx : edge);
    const vis = reg[2]*scale;
    ix = (right - vis*0.50) - reg[0]*scale;
    iy = probeY - (reg[1]+reg[3]*0.5)*scale;
  }

  return {
    ix, iy, iw, ih,
    vx: ix + reg[0]*scale,
    vy: iy + reg[1]*scale,
    vw: reg[2]*scale,
    vh: reg[3]*scale
  };
}

/* ================= 渲染一局 =================
   只画"要露出的那一块"，障碍物画在其上 → 自然衔接
   head  : 头底压进障碍物 → 从上方探出
   small : 头压得更深 → 只露头顶
   side  : 头从障碍物左侧探出
   tail  : 尾巴 / 翅膀从障碍物右侧伸出
*/
function renderRound(){
  const chars=[], covers=[], hits=[];

  S.hidden.forEach((h, idx)=>{
    const sp=h.spot, pk=h.peek, cov=h.cover;
    const g = h.g;
    const { ix, iy, iw, ih, vx, vy, vw, vh } = g;

    const cid='cp-'+h.id;
    chars.push(`<g class="peek-glow" opacity="0">
        <ellipse cx="${vx+vw/2}" cy="${vy+vh/2}" rx="${vw*0.6}" ry="${vh*0.6}"/>
      </g>
      <clipPath id="${cid}">
        <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" rx="${Math.min(vw,vh)*0.45}"/>
      </clipPath>
      <g class="peek" data-idx="${idx}" clip-path="url(#${cid})">
        ${CH.imgTag(h.key, ix, iy, iw, ih)}
      </g>`);

    // 命中区：最小 76 世界单位，方便小朋友点；但不要过大以免互相干扰
    const hr = hitRectOf(g);
    hits.push(`<g class="hit" data-idx="${idx}" data-key="${h.key}">
        <rect x="${hr.vx}" y="${hr.vy}" width="${hr.vw}" height="${hr.vh}"
              rx="${Math.min(vw,vh)*0.5}" fill="transparent"/>
      </g>`);

    covers.push(coverSVG(cov));
  });

  L.chars.innerHTML  = chars.join('');
  L.covers.innerHTML = covers.join('');
  L.hit.innerHTML    = hits.join('');
  drawCat();
  drawHUD();
}

/* ================= 主角小猫（一直在场景里） ================= */
function drawCat(){
  const c = CH.cat;
  const u = Math.max(0.86,Math.min(1.14, SCENE_W/520));
  const scale = (CH.CHAR_H*1.06*u) / c.nat[1];
  const iw = c.nat[0]*scale, ih = c.nat[1]*scale;
  const cx = Math.round(SCENE_W*0.20), gy = Math.round(SCENE_H-10);
  L.cat.innerHTML = `<g>
      <ellipse cx="${cx}" cy="${gy}" rx="${iw*0.30}" ry="${ih*0.035}" fill="#3C8C45" opacity=".34"/>
      <g class="cat-anim" style="transform-origin:${cx}px ${gy}px">
        ${CH.imgTag('cat', cx-iw/2, gy-ih, iw, ih)}
      </g></g>`;
}

/* ================= HUD ================= */
function drawHUD(){
  $('hudTargets').innerHTML = S.targets.map(k=>{
    const done=S.found.has(k);
    return `<div class="ht ${done?'found':''}" data-k="${k}">${CH.faceIcon(k)}</div>`;
  }).join('');
  updateCount();
}
function updateCount(){
  const left=S.targets.length-S.found.size;
  $('hudCount').textContent = left>0 ? ('还剩 '+left+' 个') : '全部找到啦！';
  $('hudCountBar').classList.toggle('on', S.running);
}

/* ================= 抓到 ================= */
function catchChar(key, idx){
  if(S.found.has(key)) return;
  S.found.add(key);
  SFX.ok();
  const c = CH[key];
  speak(c.line, 0.95, 1.25);

  const node = L.chars.querySelector(`.peek[data-idx="${idx}"]`);
  const h = S.hidden[idx];
  if(node) node.classList.add('caught');
  if(h) bubble(h.spot.x, h.spot.y - h.spot.h - 26, c.name + ' 找到啦！');

  const hit = L.hit.querySelector(`.hit[data-idx="${idx}"]`);
  if(hit) hit.style.pointerEvents = 'none';

  const cat = L.cat.querySelector('.cat-anim');
  if(cat){ cat.classList.remove('hop'); void cat.getBoundingClientRect(); cat.classList.add('hop'); }

  const chip = $('hudTargets').querySelector(`.ht[data-k="${key}"]`);
  if(chip) chip.classList.add('found');
  updateCount();

  if(S.found.size >= S.targets.length) setTimeout(winGame, 1200);
}

/* 点错：温和音效 + 小猫摇头 */
function onWrong(){
  if(!S.running) return;
  SFX.wrong();
  const cat = L.cat.querySelector('.cat-anim');
  if(cat){ cat.classList.remove('shake'); void cat.getBoundingClientRect(); cat.classList.add('shake'); }
}

/* ================= 气泡 / 彩纸 ================= */
function bubble(sx, sy, text){
  const fx = $('fx');
  const d = document.createElement('div');
  d.className='bubble'; d.textContent=text;
  const sr = $('scene').getBoundingClientRect();
  // 贴边时把气泡往里挪，别被裁掉
  const half = 90;
  let left = sr.left + (sx/SCENE_W)*sr.width;
  left = Math.max(sr.left + half, Math.min(sr.right - half, left));
  const top = Math.max(sr.top + 40, sr.top + (sy/SCENE_H)*sr.height);
  d.style.left = left + 'px';
  d.style.top  = top + 'px';
  fx.appendChild(d);
  setTimeout(()=>{ if(d.parentNode) d.parentNode.removeChild(d); }, 2000);
}
function confetti(n){
  const fx = $('fx');
  const colors = ['#FF8FAE','#FFD24A','#7FD0F5','#8FD35C','#FFB648','#C9A0FF'];
  for(let i=0;i<n;i++){
    const d = document.createElement('div');
    d.className='confetti';
    d.style.left = (Math.random()*100)+'%';
    d.style.background = pick(colors);
    d.style.animationDuration = (1.6+Math.random()*1.4)+'s';
    d.style.animationDelay = (Math.random()*0.5)+'s';
    fx.appendChild(d);
    setTimeout(()=>{ if(d.parentNode) d.parentNode.removeChild(d); }, 3800);
  }
}

/* ================= 流程 ================= */
const CN = ['零','一','二','三','四','五','六','七','八','九','十'];
function show(id){
  ['home','preview','count','win'].forEach(k=>{
    const el = $('scr-'+k); if(el) el.classList.toggle('on', k===id);
  });
  $('hud').classList.remove('on');
  $('hudCountBar').classList.remove('on');
}
function showGame(){
  ['home','preview','count','win'].forEach(k=>{
    const el = $('scr-'+k); if(el) el.classList.remove('on');
  });
  $('hud').classList.add('on');
  $('hudCountBar').classList.add('on');
}

/* 目标展示 */
function startPreview(diff){
  S.diff = diff;
  S.targets = shuffle(CH.targets).slice(0, diff);
  $('targetCards').innerHTML = S.targets.map((k,i)=>{
    const c = CH[k];
    return `<div class="tcard" style="animation-delay:${i*0.12}s">
      ${CH.faceIcon(k)}<div class="nm">${c.name}</div></div>`;
  }).join('');
  $('prevSub').textContent = '小猫要来找它们啦！先记住它们～';
  show('preview');
  speak('找'+CN[diff]+'个朋友，先记住它们', 0.9, 1.15);
}

/* 数数 1~10 */
let countTimer = null;
function startCount(){
  show('count');
  stopSpeak();
  let n = 1;
  const numEl = $('countNum'), dotsEl = $('countDots');
  dotsEl.innerHTML='';
  function step(){
    if(n>10){ finishCount(); return; }
    numEl.textContent = n;
    numEl.style.animation='none'; void numEl.offsetWidth; numEl.style.animation='';
    const d = document.createElement('div'); d.className='cdot';
    dotsEl.appendChild(d);
    SFX.num(n);
    speak(CN[n], 0.85, 1.2);
    n++;
    countTimer = setTimeout(step, 1000);
  }
  step();
}
function finishCount(){
  clearTimeout(countTimer);
  stopSpeak();
  $('countNum').textContent = 'GO!';
  $('countDots').innerHTML='';
  SFX.win();
  setTimeout(()=>{
    buildRound(S.diff);
    S.running = true;
    showGame();
    speak('开始找啦！', 0.95, 1.2);
  }, 800);
}
function skipCount(){ clearTimeout(countTimer); stopSpeak(); finishCount(); }

function winGame(){
  S.running = false;
  SFX.win();
  confetti(70);
  $('winCards').innerHTML = S.targets.map((k,i)=>
    `<div class="wcard" style="animation-delay:${i*0.12}s">${CH.faceIcon(k)}</div>`).join('')
    + `<div class="wcard win-cat" style="animation-delay:${S.targets.length*0.12}s">${CH.faceIcon('cat')}</div>`;
  show('win');
  speak('太棒啦！全部找到啦！', 0.95, 1.25);
}

/* ================= 事件 ================= */
function bind(){
  $('diffGrid').addEventListener('click', e=>{
    const b = e.target.closest('.diff'); if(!b) return;
    SFX.tap(); startPreview(+b.dataset.n);
  });
  $('btnStart').addEventListener('click', ()=>{ SFX.tap(); startCount(); });
  $('btnSkip').addEventListener('click', ()=>{ SFX.tap(); skipCount(); });
  $('btnAgain').addEventListener('click', ()=>{ SFX.tap(); startPreview(S.diff); });
  $('btnHome').addEventListener('click', ()=>{ SFX.tap(); stopSpeak(); S.running=false; show('home'); });
  $('btnHudHome').addEventListener('click', ()=>{ SFX.tap(); stopSpeak(); S.running=false; show('home'); });
  $('btnHudTip').addEventListener('click', ()=>{ SFX.tap(); toast('点一点露出来的身体，就能抓到啦！'); });

  L.hit.addEventListener('pointerdown', e=>{
    const g = e.target.closest('.hit'); if(!g) return;
    e.stopPropagation();
    if(!S.running) return;
    catchChar(g.dataset.key, +g.dataset.idx);
  });
  $('scene').addEventListener('pointerdown', e=>{
    if(e.target.closest('.hit')) return;
    onWrong();
  });
  document.addEventListener('gesturestart', e=>e.preventDefault());
  window.addEventListener('resize', ()=>{ layout(); });
  window.addEventListener('orientationchange', ()=>setTimeout(layout,200));
}

let toastTimer=null;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('on'), 2200);
}

/* ================= 启动 ================= */
function init(){
  layout();
  $('catHero').innerHTML = CH.icon('cat');
  // 难度按钮里的小头像
  document.querySelectorAll('.diff .ic').forEach(el=>{
    const keys = (el.dataset.ic||'').split(' ').filter(Boolean);
    el.innerHTML = keys.map(k=>CH.faceIcon(k)).join('');
  });
  bind();
  show('home');
  const unlock = ()=>{ ac(); loadVoices(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
  if(/[?&]debug/.test(location.search)) debugGrid();
  // 测试钩子
  window.__game = { S, CH, buildRound, peekGeom, makeSpots, buildCover, renderRound,
                    coverTopAt, coverEdgeX, layout, drawScene };
}

/* 调试：把所有"角色 × 露出方式"渲染成网格，检查几何 */
function debugGrid(){
  document.querySelectorAll('.layer').forEach(el=>el.style.display='none');
  const host = document.createElement('div');
  host.style.cssText='position:fixed;inset:0;z-index:9999;background:#8FD35C;overflow:auto;display:flex;flex-wrap:wrap;align-content:flex-start';
  document.getElementById('app').appendChild(host);
  let n=0;
  ['duck','squirrel','croc','eleph'].forEach(key=>{
    CH[key].peeks.forEach(pk=>{
      const sp={x:100,y:185,cover:'bush',w:130,h:70,s:1.0};
      const cov=buildCover(sp.cover,sp.x,sp.y,sp.w,sp.h);
      const g=peekGeom(key,pk,sp,cov);
      const cid='dbg'+(n++);
      const d=document.createElement('div');
      d.style.cssText='width:200px;height:230px;position:relative;flex:0 0 auto';
      d.innerHTML=`<svg viewBox="0 0 200 230" style="position:absolute;inset:0">
        <rect width="200" height="230" fill="#8FD35C"/>
        <clipPath id="${cid}"><rect x="${g.vx}" y="${g.vy}" width="${g.vw}" height="${g.vh}" rx="${Math.min(g.vw,g.vh)*0.45}"/></clipPath>
        <g clip-path="url(#${cid})">${CH.imgTag(key, g.ix, g.iy, g.iw, g.ih)}</g>
        ${coverSVG(cov)}
        <rect x="${g.vx}" y="${g.vy}" width="${g.vw}" height="${g.vh}" fill="none" stroke="#f0f" stroke-width="1.2" opacity=".85"/>
        </svg>
        <div style="position:absolute;bottom:2px;left:4px;background:rgba(255,255,255,.9);padding:1px 6px;border-radius:6px;font:12px sans-serif">${key} / ${pk.type}</div>`;
      host.appendChild(d);
    });
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
