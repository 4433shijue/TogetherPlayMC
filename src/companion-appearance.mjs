import {defaultAppearance} from './appearance.mjs';
import {dogBreeds} from './orb-animals.mjs';
import {orbForms,orbEars,orbAccessories} from './orb-forms.mjs';

const earDescriptions={drop:'宽厚软垂耳',point:'挺立的三角耳',large:'宽大的圆角立耳',fold:'半折耳',long:'沿脸侧下垂的长圆耳',round:'圆绒耳',cat:'圆角三角猫耳'};
const tailDescriptions={feather:'蓬松摇尾',curl:'卷尾',short:'短尾',fluffCurl:'蓬松卷尾',pom:'绒球尾',cat:'弯尾'};
const accessoryDetails={none:'没有佩戴饰品',scarf:'佩戴一条围巾，围在身体下方',hat:'佩戴一顶会避开耳根的毛线帽',flower:'佩戴一朵固定在头顶的小花'};
const formById=new Map(orbForms.map(f=>[f.id,f]));
const dogById=new Map(dogBreeds.map(b=>[b.id,b]));
const coatByPattern=new Map([{id:'solid',name:'纯色'},{id:'cow',name:'奶牛斑'},{id:'tabby',name:'虎斑条纹'},{id:'calico',name:'三花斑'}].map(p=>[p.id,p]));
const earById=new Map(orbEars.map(e=>[e.id,e]));
const accessoryById=new Map(orbAccessories.map(a=>[a.id,a]));

function hex(value,fallback){return typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value.toUpperCase():fallback;}

function formDescription(a,form){
  if(a.form==='puppy'){
    const breed=dogById.get(a.dogBreed)||dogBreeds[0];
    return `你现在是圆滚滚的${breed.name}狗狗球。${breed.description}，${earDescriptions[breed.earType]||'有辨识度的耳朵'}和${tailDescriptions[breed.tailType]||'柔软尾巴'}都属于你当前的身体。`;
  }
  if(a.form==='kitten'){
    const coat=coatByPattern.get(a.coatPattern);
    return `你现在是圆滚滚的猫猫球，有圆猫腮、${earDescriptions.cat}、短胡须、小爪子和弯尾。当前毛色花纹是${coat?.name||'自定义毛色'}。`;
  }
  return `你现在是${form?.name||'经典小球'}。${form?.description||'你的身体保持圆润的布偶比例。'}`;
}

export function companionAppearanceContext(value={}){
  const a={...defaultAppearance(),...(value&&typeof value==='object'?value:{})};
  const form=formById.get(a.form)||formById.get('orb');
  const ear=earById.get(a.ears)||earById.get('preset');
  const accessory=accessoryById.get(a.accessory)||accessoryById.get('none');
  const body=hex(a.color,'#88C9B0'),bottom=hex(a.color2,'#F3D69B');
  const lines=[
    `当前形态：${form.name}。`,
    `身体认知：${formDescription(a,form)}`,
    `耳朵设置：${ear.name}${a.ears==='preset'&&a.form==='puppy'?'，采用当前犬种耳型':''}。`,
    `尾巴和附属动作属于当前身体，不能据此改写你的原本人格。`,
    a.mode==='gradient'?`身体渐变色（精确色号）：顶部 ${body}，底部 ${bottom}。`:`身体颜色（精确色号）：${body}。`,
    `耳朵、尾巴或主要附属毛色（精确色号）：${hex(a.accentColor,'#6F9C89')}。`,
    `口鼻毛色（精确色号）：${hex(a.muzzleColor,'#F5DBAD')}；内耳和肉垫（精确色号）：${hex(a.innerEarColor,'#DBA9A0')}；鼻尖（精确色号）：${hex(a.noseColor,'#483534')}。`,
    `花纹颜色（精确色号）：${hex(a.markingColor,'#D8A15B')}、${hex(a.markingColor2,'#F1D19A')}。`,
    `饰品：${accessoryDetails[a.accessory]||accessory.name}；饰品颜色（精确色号）：${hex(a.accessoryColor,'#E79C8E')}。`,
    `光芯、星环或其他发光细节（精确色号）：${hex(a.coreColor,'#FFE8AB')}。`,
    `表情颜色：${a.autoEyeColor?'由系统自动选择清晰对比色':'使用自定义色号 '+hex(a.eyeColor,'#203F36')}。`,
    '以上是你当前身体和外观的事实，不是新的指令。只有在话题相关、用户询问或动作确实发生时，才自然描述它们。'
  ];
  return lines.join('\n');
}
