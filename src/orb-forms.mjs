import {dogBreeds,catCoats,dogPalettes,coatPatterns,animalModels,animalParts} from './orb-animals.mjs';
import {personalityModes,personalityPresets} from './personality.mjs';
// Shared shape descriptions, fitted attachments and material choices.
const part=(mesh,x=0,y=0,z=0,rx=1,ry=1,rz=1,material='body',extra={})=>({kind:'mesh',mesh,x,y,z,rx,ry,rz,material,rotation:0,pitch:0,alpha:1,...extra});
const palette=(color,color2,coreColor,accentColor,accessoryColor)=>({mode:'gradient',color,color2,coreColor,accentColor,accessoryColor,eyeColor:'#203F36',autoEyeColor:true});
const fittings={orb:{ears:[.85,.59,.02],scarf:[.85,-.57,.84],hat:[.82,.61],flower:[.59,.67,.66]},lantern:{ears:[.79,.63,.02],scarf:[.89,-.57,.87],hat:[.70,.68],flower:[.56,.70,.58]},jelly:{ears:[.90,.43,.02],scarf:[.96,-.52,.88],hat:[.78,.43],flower:[.61,.51,.64]},puppy:{ears:[.85,.57,.015],scarf:[.89,-.55,.84],hat:[.80,.58],flower:[.61,.64,.65]},cloud:{ears:[1.03,.47,.02],scarf:[1.04,-.55,.82],hat:[.89,.76],flower:[.72,.67,.65]},planet:{ears:[.79,.55,.02],scarf:[.77,-.54,.77],hat:[.77,.55],flower:[.57,.62,.61]}};
const form=(id,name,description,material,softness,parts,palette,face=[0,0,1,.95])=>({id,name,description,material,softness,parts,palette,face,fittings:fittings[id]});
export const orbForms=[
 form('orb','经典小球','熟悉的小伙伴，保留圆圆的轮廓','matte',0,[part('body-orb')],palette('#88C9B0','#F3D69B','#FFE8AB','#6F9C89','#E79C8E'),[0,0,1,1]),
 form('lantern','小灯灵','磨砂水滴外壳，里面悬着暖暖的光芯','glass',.45,[part('sphere',0,-.08,.06,.45,.51,.45,'core',{motion:'core'}),part('sphere',0,-.08,.06,.60,.65,.58,'core',{alpha:.09,motion:'core'}),part('body-lantern',0,0,0,1,1,1,'body',{alpha:.35}),part('sphere',.025,1.055,0,.13,.10,.13,'accent')],palette('#AFD9CC','#77B7A4','#FFE6A5','#6C9F8A','#E6A58F'),[0,-.02,1,.92]),
 form('jelly','果冻团子','软软的团子，带着湿润高光和轻轻回弹','jelly',1,[part('body-jelly')],palette('#B1DADB','#80B9CB','#FBE7B0','#8AAAC8','#DD9CB6'),[0,-.10,1,.96]),
 form('puppy','狗狗球','八种小狗，各有自己的耳朵和尾巴','plush',.48,[part('body-puppy'),part('tail',.77,-.43,-.60,1,1,1,'accent',{motion:'tail'})],palette('#F2D5AC','#D5B48D','#FFE9B9','#A9846B','#CB8F87'),[0,-.01,1,.97]),
 form('cloud','小云朵','云瓣融成一团，慢慢呼吸和舒展','cloud',.40,[part('body-cloud')],palette('#F4EEE1','#C6D8D3','#FFE4A8','#A4BCB4','#B692AC'),[0,-.09,1,.94]),
 form('planet','口袋星球','薄薄的星环，小卫星绕着身体前后转','ceramic',.12,[part('body-planet'),part('orbitBand',0,-.20,0,1,1,.76,'accent',{rotation:-16,pitch:25,surface:'satin'}),part('sphere',1.30,.32,0,.145,.145,.145,'core',{motion:'satellite'})],palette('#ACB7DD','#7C8CB4','#FFE9AD','#E6C992','#D6A9B8'),[0,.02,1,.9])
];
orbForms.find(f=>f.id==='puppy').palette=dogBreeds[0].palette;
orbForms.push({...animalModels.kitten,id:'kitten',name:'猫猫球',description:'圆圆猫腮、短胡须和弯尾，五套毛色自由改'});
export const orbEars=[{id:'preset',name:'随形态'},{id:'none',name:'不戴耳朵'},{id:'floppy',name:'垂耳'},{id:'round',name:'圆耳'},{id:'pointed',name:'立耳'}];
export const orbAccessories=[{id:'none',name:'不戴饰品'},{id:'scarf',name:'小围巾'},{id:'hat',name:'毛线帽'},{id:'flower',name:'头顶小花'}];
export const orbParts={
 floppy:[part('earLeft',-.85,.59,.02,1,1,1,'accent',{motion:'earLeft',fit:'ear',rotation:-4,surface:'plush'}),part('earRight',.85,.59,.02,1,.96,1,'accent',{motion:'earRight',fit:'ear',rotation:5,surface:'plush'})],
 round:[part('sphere',-.72,.81,-.03,.28,.30,.14,'accent',{motion:'earLeft',fit:'roundEar',surface:'plush'}),part('sphere',.72,.81,-.03,.27,.29,.14,'accent',{motion:'earRight',fit:'roundEar',surface:'plush'})],
 scarf:[part('clothBand',0,-.57,0,.85,1,.84,'accessory',{fit:'scarf',surface:'cloth'}),part('sphere',.38,-.64,.80,.16,.14,.075,'accessory',{fit:'knot',surface:'cloth'}),part('ribbonLeft',.40,-.69,.82,1,1,1,'accessory',{motion:'ribbonLeft',fit:'ribbon',rotation:-10,surface:'cloth'}),part('ribbonRight',.54,-.66,.79,.86,1,1,'accessory',{motion:'ribbonRight',fit:'ribbon',rotation:15,surface:'cloth'})],
 hat:[part('cap',0,.61,-.02,.80,1,.80,'accessory',{fit:'hat',surface:'cloth'}),part('clothBand',0,.64,-.02,.80,.80,.75,'accessory',{fit:'brim',surface:'cloth'}),part('sphere',.145,1.24,-.02,.15,.15,.15,'core',{fit:'pom',surface:'plush'})],
 flower:[...Array.from({length:5},(_,i)=>part('petal',.59,.67,.66,1,1,1,'accessory',{rotation:i*72+12,fit:'flower',surface:'petal'})),part('sphere',.59,.67,.72,.105,.105,.07,'core',{fit:'flowerCenter',surface:'petal'})]
};
Object.assign(orbParts,animalParts);
orbParts.pointed=[...animalParts['pet-shiba']].map(p=>({...p,fit:'pointedEar'}));
export const orbCatalogue={version:3,personalityModes,personalityPresets,forms:orbForms,ears:orbEars,accessories:orbAccessories,parts:orbParts,dogBreeds,catCoats,dogPalettes,coatPatterns,animals:animalModels};
