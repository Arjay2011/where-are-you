/* ===== 角色：AI 生成的扁平卡通形象（透明 PNG） =====
   每个角色由一张透明 PNG 构成。"探头 / 露耳尖 / 伸尾巴" 通过裁切图片的
   局部区域实现（regions），再把遮挡物画在上面，自然形成"藏在后面"的效果。

   nat    : 图片原始像素尺寸
   regions: 名称 → [x, y, w, h]（图片像素坐标里的裁切框）
             head  = 头部（探头用）
             small = 头顶/耳朵（只露一点点用）
             side  = 侧身探头用的头部
             tail  = 尾巴 / 翅膀 / 前爪（从右侧伸出用）
   peeks  : 这个角色有哪几种"露出方式"
*/
const CH = {};

CH.cat = {
  name:'小猫', line:'喵～找到我啦！',
  img:'img/cat.png', nat:[601,881],
  regions:{
    head :[78,   6, 402, 258],
    small:[78,   6, 402, 104],
    side :[78,   6, 402, 258],
    tail :[468, 548, 130, 158]
  },
  peeks:[
    {type:'head', region:'head'},
    {type:'small',region:'small'},
    {type:'side', region:'side'},
    {type:'trunk', region:'trunk'}
  ]
};

CH.duck = {
  name:'小鸭子', line:'嘎嘎！我是小鸭子～',
  img:'img/duck.png', nat:[534,758],
  regions:{
    head :[96,  10, 248, 214],
    small:[150, 10, 178,  82],
    side :[96,  10, 248, 214],
    tail :[380, 300, 154, 168]
  },
  peeks:[
    {type:'head', region:'head'},
    {type:'small',region:'small'},
    {type:'side', region:'side'},
    {type:'tail', region:'tail'}
  ]
};

CH.squirrel = {
  name:'小松鼠', line:'吱吱～我躲在这里！',
  img:'img/squirrel.png', nat:[929,918],
  regions:{
    head :[150,  10, 480, 440],
    small:[280,  10, 330, 170],
    side :[150,  10, 480, 440],
    tail :[762, 190, 167, 600]
  },
  peeks:[
    {type:'head', region:'head'},
    {type:'small',region:'small'},
    {type:'side', region:'side'},
    {type:'tail', region:'tail'}
  ]
};

CH.croc = {
  name:'小鳄鱼', line:'咔哒咔哒！找到我啦～',
  img:'img/croc.png', nat:[490,734],
  regions:{
    head :[2,     2, 400, 250],
    small:[120,  10, 300, 130],
    side :[2,     2, 400, 250],
    tail :[14,  300, 130, 110],
    snout:[2,   30, 300, 170]
  },
  peeks:[
    {type:'head', region:'head'},
    {type:'small',region:'small'},
    {type:'side', region:'side'},
    {type:'snout',region:'snout'}
  ]
};

CH.eleph = {
  name:'小象', line:'吼吼～我在这儿呢！',
  img:'img/eleph.png', nat:[976,976],
  regions:{
    head :[470,  14, 500, 560],
    small:[540,  14, 400, 180],
    side :[470,  14, 500, 560],
    trunk:[500, 300, 230, 420]
  },
  peeks:[
    {type:'head', region:'head'},
    {type:'small',region:'small'},
    {type:'side', region:'side'},
    {type:'trunk',region:'trunk'}
  ]
};

/* 可被找到的四个（不含主角小猫） */
CH.targets = ['duck','squirrel','croc','eleph'];

/* 角色在场景中的标准高度（世界单位），会再乘以该躲藏点的缩放 */
CH.CHAR_H = 165;

/* <image> 标签 */
CH.imgTag = (key, x, y, w, h)=>
  `<image href="${CH[key].img}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="none"/>`;

/* 完整角色（首页大图用） */
CH.icon = key => {
  const c = CH[key]; if(!c) return '';
  return `<svg viewBox="0 0 ${c.nat[0]} ${c.nat[1]}" preserveAspectRatio="xMidYMid meet">
    ${CH.imgTag(key, 0, 0, c.nat[0], c.nat[1])}</svg>`;
};
/* 头像：裁到头部区域（HUD / 目标卡 / 胜利卡）
   用 clipPath 把图片裁到 head 框内，否则整张图会被缩放显示 */
CH.faceIcon = key => {
  const c = CH[key]; if(!c) return '';
  const b = c.regions.head;
  const cid = 'fc-'+key+'-'+(CH._fcN = (CH._fcN||0)+1);
  return `<svg viewBox="${b[0]} ${b[1]} ${b[2]} ${b[3]}" preserveAspectRatio="xMidYMid meet">
    <clipPath id="${cid}"><rect x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}"/></clipPath>
    <g clip-path="url(#${cid})">${CH.imgTag(key, 0, 0, c.nat[0], c.nat[1])}</g></svg>`;
};
