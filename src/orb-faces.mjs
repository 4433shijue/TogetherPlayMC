// One small, vector-based face library for Minecraft and the console.
const ellipse=(x,y,rx,ry,group='eyes',color='ink',opacity=1)=>({type:'ellipse',x,y,rx,ry,group,color,opacity});
const line=(points,width=3.6,group='mouth',color='ink',opacity=1)=>({type:'line',points,width,group,color,opacity});
const curve=(a,b,c,width=3.6,group='mouth')=>line(Array.from({length:13},(_,i)=>{const t=i/12;return [0,1].map(k=>Math.round(((1-t)**2*a[k]+2*(1-t)*t*b[k]+t*t*c[k])*100)/100);}),width,group);
const eyes=(rx=5,ry=8)=>[-31,31].map(x=>ellipse(x,19,rx,ry));
const closed=()=>[-31,31].map(x=>curve([x-7,17],[x,28],[x+7,17],3.8,'eyes'));
const sleepy=()=>[-31,31].map(x=>curve([x-8,21],[x,13],[x+8,21],3.5,'eyes'));
const smile=()=>curve([-18,-14],[0,-33],[18,-14]);
const blush=(opacity=.5)=>[-48,48].map(x=>ellipse(x,-3,10,4.6,'accent','#dc8d98',opacity));
const brow=(x,y,flip=false)=>line([[x-7,y+(flip?0:3)],[x+7,y+(flip?3:0)]],2.8,'brows');
const make=(id,label,cue,parts,{blink=true,tilt=0,duration=3600,priority=2,bob=.012}={})=>({id,label,cue,parts,blink,tilt,duration,priority,bob});
export const orbFaces=[
  make('calm','平静','安静陪在你身边',[...eyes(),smile()],{priority:0}),
  make('happy','开心','手动留下合照时',[...closed(),curve([-21,-11],[0,-37],[21,-11],4),...blush(.36)],{blink:false,bob:.022}),
  make('curious','好奇','主动让他看一张图时',[ellipse(-31,19,5,8),ellipse(31,21,6,10),ellipse(1,-20,5,6,'mouth'),brow(31,39,true)],{tilt:-4}),
  make('worried','担心','看到你受伤时',[...eyes(4.6,7),brow(-31,35,true),brow(31,35),curve([-14,-24],[0,-10],[14,-24])],{duration:5000,priority:5}),
  make('thinking','思考','等待模型回答时',[...eyes(5,4),line([[-12,-21],[12,-21]],3.5),brow(31,34,true)],{priority:1,bob:.008}),
  make('responding','回应','认真回答你时',[...eyes(),ellipse(0,-19,7,7,'mouth'),...blush(.18)],{duration:3000}),
  make('shy','害羞','听到你的夸奖和亲近话时',[...closed(),curve([-10,-19],[0,-28],[10,-19],3.2),...blush(.65)],{blink:false,tilt:-5,duration:4200,priority:3}),
  make('surprised','惊讶','第一次看到新维度时',[...eyes(6,10),ellipse(0,-21,5.5,8,'mouth'),brow(-31,41),brow(31,41,true)],{duration:3200,priority:3,bob:.016}),
  make('sleepy','困困','夜深久坐，或你躺下休息时',[...sleepy(),curve([-9,-21],[0,-26],[9,-21],3)],{blink:false,tilt:3,duration:5500,priority:1,bob:.006}),
  make('proud','小得意','你获得一个新进度时',[line([[-39,22],[-26,18]],4,'eyes'),line([[26,18],[39,22]],4,'eyes'),curve([-15,-18],[6,-34],[22,-11]),...blush(.32)],{blink:false,tilt:3,duration:4200,priority:3}),
  make('sad','难过','你在冒险中倒下时',[...eyes(4,6),brow(-31,34,true),brow(31,34),curve([-13,-25],[0,-12],[13,-25]),ellipse(42,1,2.7,4.4,'accent','#8bbfd0',.7)],{duration:6000,priority:6,bob:.005}),
  make('wink','眨眼','被你叫到名字或打招呼时',[curve([-39,18],[-31,27],[-23,18],3.8,'eyes'),ellipse(31,19,5,8),smile(),...blush(.24)],{blink:false,tilt:-3,priority:3,duration:2400}),
  make('confused','疑惑','图片看不清或请求出错时',[ellipse(-31,19,5,8),ellipse(31,19,5,4),brow(31,36,true),line([[-11,-23],[10,-18]],3.3)],{tilt:5,duration:4000,priority:3}),
  make('relieved','安心','受伤后恢复过来时',[...sleepy(),smile(),...blush(.26)],{blink:false,duration:4000,priority:3,bob:.009})
];
// Small eye glints follow the same blink and expression motion as their eyes.
for(const face of orbFaces){const glints=face.parts.filter(p=>p.type==='ellipse'&&p.group==='eyes'&&p.color==='ink'&&p.ry>=6).map(p=>ellipse(p.x-1.3,p.y+2.3,1.25,1.6,'eyes','#FFF5DD',.72));face.parts.push(...glints);}
for(const face of orbFaces){
 face.variants={};
 for(const species of ['puppy','kitten']){
  let parts=face.parts.filter(p=>p.group!=='mouth');
  if(species==='kitten'&&face.id==='wink')parts=[...eyes(),...parts.filter(p=>p.group!=='eyes')];
  parts=parts.map(p=>p.type==='ellipse'&&p.group==='eyes'?{...p,rx:p.rx*1.16,ry:p.ry*1.06}:p);
  const concerned=['worried','sad','confused'].includes(face.id),open=['responding','surprised','curious'].includes(face.id);
  if(open)parts.push(ellipse(0,-24,species==='kitten'?4:6,face.id==='surprised'?7:5,'mouth'));
  else if(concerned)parts.push(curve([-12,-26],[0,-17],[12,-26],3));
  else if(species==='puppy')parts.push(curve([-19,-21],[0,-39],[19,-21],3.5));
  else parts.push(curve([-16,-19],[-9,-32],[0,-20],3),curve([0,-20],[9,-32],[16,-19],3));
  parts.push(line([[0,-13],[0,species==='puppy'?-28:-20]],2.5,'mouth'));
  // Soft triangular nose uses the same curved face surface as the mouth.
  if(species==='puppy')parts.push(ellipse(0,-10,7.5,5.3,'nose','nose'));
  else parts.push(line([[-4.5,-10],[4.5,-10],[0,-14.5],[-4.5,-10]],2.7,'nose','nose'));
  if(species==='kitten')for(const side of [-1,1])for(const y of [-11,-18])parts.push(line([[side*43,y],[side*58,y+2]],1.5,'whiskers','ink',.85));
  parts=parts.map(p=>({...p,anchor:p.group==='mouth'?[0,-22]:p.type==='ellipse'?[p.x,p.y]:[p.points.reduce((n,v)=>n+v[0],0)/p.points.length,p.points.reduce((n,v)=>n+v[1],0)/p.points.length]}));
  const outlines=parts.filter(p=>p.color==='ink').map(p=>({...p,color:'outline',opacity:.70,...(p.type==='ellipse'?{rx:p.rx+.8,ry:p.ry+.8}:{width:p.width+1.5})}));
  face.variants[species]={parts:[...outlines,...parts],slowBlink:species==='kitten'&&face.id==='wink',tilt:species==='kitten'?face.tilt*.4:face.tilt};
 }
}
