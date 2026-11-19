// Animal silhouettes, fittings and fur presets are shared by both clients.
import {dogEarProfiles} from './orb-dog-ears.mjs';
const p=(mesh,x=0,y=0,z=0,rx=1,ry=1,rz=1,material='body',extra={})=>({kind:'mesh',mesh,x,y,z,rx,ry,rz,material,rotation:0,pitch:0,alpha:1,...extra});
const fur=(color,color2,accentColor,muzzleColor,markingColor,markingColor2,innerEarColor='#DBA9A0',noseColor='#483534')=>({mode:'gradient',color,color2,accentColor,muzzleColor,markingColor,markingColor2,innerEarColor,noseColor});
const breeds=[
 ['golden','金毛','厚垂耳和宽口鼻，摇着蓬松尾巴','drop','feather',[1.04,.91,.94,.23],fur('#E6BD79','#C69459','#C99756','#F5DBAD','#D8A15B','#F1D19A')],
 ['shiba','柴犬','小立耳、圆脸颊和卷卷尾','point','curl',[1.04,.94,.91,.15],fur('#DFA064','#BA7546','#BD7B49','#FFF1D5','#FFF0D2','#A2633E')],
 ['corgi','柯基','大耳朵、宽脸和短豆豆爪','large','short',[1.16,.84,.90,.20],fur('#D7A163','#BA7D46','#C28A54','#FFF4DF','#FFF2DA','#AC703E')],
 ['husky','哈士奇','挺立的耳朵和额头眼周面罩','point','feather',[.98,1.00,.94,.21],fur('#DBE0E2','#A9B5BF','#697987','#F7F4E9','#526370','#ECF0EB')],
 ['border','边牧','半折耳、白色额线和蓬松尾尖','fold','feather',[1.01,.95,.94,.20],fur('#454A4D','#30383C','#343C40','#F7EEE0','#F5EEE0','#2C3437')],
 ['beagle','比格','长长垂耳和暖棕黑白斑块','long','short',[1.02,.92,.98,.24],fur('#FAEDD8','#E8D4B5','#B67B4E','#FFF4E2','#48403C','#BE8553')],
 ['samoyed','萨摩耶','厚脸颊毛、毛领和蓬松卷尾','point','fluffCurl',[1.06,.94,.99,.20],fur('#FCF5E7','#DDDBCF','#EAE4D6','#FFF9EA','#EEE7D8','#DCD8CC')],
 ['poodle','贵宾（泰迪）','圆绒耳、团状卷毛和绒球尾','round','pom',[.95,.97,.94,.22],fur('#BA8663','#94664B','#A87555','#D6AE86','#B17C59','#D1A17B')]
];
export const dogBreeds=breeds.map(([id,name,description,earType,tailType,shape,palette])=>({id,name,description,earType,tailType,shape,palette}));
export const catCoats=[
 {id:'white',name:'白猫',pattern:'solid',palette:fur('#FFF6E7','#E5DFD0','#F0E7D8','#FFFAF0','#C8C2B6','#AAA59B','#E2B4AD','#B77F7B')},
 {id:'cow',name:'奶牛猫',pattern:'cow',palette:fur('#FBF5E9','#DDD9CD','#EFE8DB','#FFF9ED','#343B40','#52585B')},
 {id:'orange',name:'橘猫',pattern:'tabby',palette:fur('#EBC18C','#DFA66C','#E0AB70','#FFF0D7','#B77D4B','#CE935C')},
 {id:'black',name:'黑猫',pattern:'solid',palette:fur('#414A52','#293238','#3A444C','#4B5359','#303A42','#626A70','#A9878B','#AB9293')},
 {id:'calico',name:'三花猫',pattern:'calico',palette:fur('#FFF1DB','#E5D5BA','#EEDCC2','#FFF6E5','#45403D','#D69B62')}
];
export const dogPalettes=[{id:'cream',name:'奶油',palette:fur('#F3DDBA','#DCC4A3','#CCAC86','#FFF0D9','#BD9872','#E2C29A')},{id:'chocolate',name:'巧克力',palette:fur('#8E6856','#684B40','#705042','#C6A18A','#4F3B34','#B58A6B')}];
export const coatPatterns=[{id:'solid',name:'纯色'},{id:'cow',name:'奶牛斑'},{id:'tabby',name:'虎斑条纹'},{id:'calico',name:'三花斑'}];
const earRoot=a=>a.id==='kitten'?[.64,.52,.08]:dogEarProfiles[a.id].root;
const earParts=a=>[-1,1].flatMap(side=>{
 const {id,earType:type}=a,[ex,y,z]=earRoot(a),s=side<0?'Left':'Right',motion='ear'+s+(['point','large','cat','fold'].includes(type)?'Point':type==='round'?'Round':'Drop');
 return [p(`pet-ear-${id}-${s}`,side*ex,y,z,1,1,1,'accent',{motion}),p(`pet-inner-${id}-${s}`,side*ex,y,z,1,1,1,'innerEar',{motion})];
});
export const animalParts={};
export const animalModels={};
for(const a of [...dogBreeds,{id:'kitten',name:'猫猫球',earType:'cat',tailType:'cat',shape:[1.06,.90,.94,.095],palette:catCoats[0].palette}]){
 const [earX,earY,earZ]=earRoot(a);
 animalParts['pet-'+a.id]=earParts(a);
 const parts=[p('body-'+a.id),p('pet-tail-'+a.id,.68,-.42,-.62,1,1,1,'accent',{motion:'tail'+(a.id==='kitten'?'Cat':a.tailType==='pom'?'Pom':a.tailType.includes('Curl')||a.tailType==='curl'?'Curl':'Dog')}),...[-1,1].map(side=>p('pet-paw',side*.42,-.77,.51,.18,.16,.22,'body',{motion:'paw'+(side<0?'Left':'Right')})),...[-1,1].map(side=>p('pet-pad',side*.42,-.81,.69,.09,.065,.025,'innerEar',{motion:'paw'+(side<0?'Left':'Right')}))];
 if(a.id==='samoyed'||a.id==='poodle'){
  const tufts=a.id==='poodle'?[[-.32,.79],[0,.87],[.32,.79],[-.85,-.22],[.85,-.22],[-.56,-.65],[.56,-.65]]:[[-.88,-.04],[.88,-.04],[-.92,-.30],[.92,-.30],[-.73,-.56],[.73,-.56],[0,-.79]];
  for(const [x,y]of tufts)parts.push(p('pet-tuft',x,y,.13,a.id==='poodle'?.24:.28,.23,.27,'body'));
 }
 animalModels[a.id]={...a,material:'plush',softness:.48,face:[0,-.015,1,a.id==='kitten'?.99:1.06],parts,earPreset:'pet-'+a.id,fittings:{ears:[earX,earY,earZ],scarf:[a.shape[0]*.88,-.55,.85],hat:dogEarProfiles[a.id]?.hat??[.46,.75],flower:dogEarProfiles[a.id]?.flower??[.45,.59,.65]}};
}
