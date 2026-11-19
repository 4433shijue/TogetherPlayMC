import {dogBreeds,coatPatterns} from './orb-animals.mjs';
import {orbForms,orbEars,orbAccessories} from './orb-forms.mjs';
export const defaultAppearance = () => ({dogBreed:'golden',coatPattern:'solid',muzzleColor:'#F5DBAD',innerEarColor:'#DBA9A0',noseColor:'#483534',markingColor:'#D8A15B',markingColor2:'#F1D19A',form:'orb',ears:'preset',accessory:'none',softBody:true,coreColor:'#FFE8AB',accentColor:'#6F9C89',accessoryColor:'#E79C8E',eyeColor:'#203F36',autoEyeColor:true,mode:'solid',color:'#88C9B0',color2:'#F3D69B',face:true,reducedMotion:false,chatColor:'#B8E8D2',chatNameColor:'#88C9B0'});
export function validateAppearance(value = {}) {
  if(!value || typeof value !== 'object' || Array.isArray(value) || !['solid','gradient'].includes(value.mode ?? 'solid')) throw new Error('请选择纯色或双色渐变。');
  const result={...defaultAppearance(),...value};
  for(const [key,values] of [['dogBreed',dogBreeds],['coatPattern',coatPatterns],['form',orbForms],['ears',orbEars],['accessory',orbAccessories]])if(!values.some(v=>v.id===result[key]))throw Error('请选择有效的形态、耳朵和饰品。');
  for(const key of ['muzzleColor','innerEarColor','noseColor','markingColor','markingColor2','color','color2','coreColor','accentColor','accessoryColor','eyeColor','chatColor','chatNameColor']) {
    if(typeof result[key]!=='string'||!/^#[\da-f]{6}$/i.test(result[key]))throw new Error('颜色必须为 #RRGGBB。');
    result[key]=result[key].toUpperCase();
  }
  for(const key of ['softBody','autoEyeColor','face','reducedMotion'])if(typeof result[key]!=='boolean')throw Error('外观开关无效。');
  return Object.fromEntries(Object.keys(defaultAppearance()).map(key=>[key,result[key]]));
}
