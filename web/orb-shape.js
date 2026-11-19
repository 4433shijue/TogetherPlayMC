export const formLibrary=fetch('/orb-forms.json').then(r=>{if(!r.ok)throw Error('形态预览暂时不可用');return r.json();});
export const meshLibrary=fetch('/orb-meshes.json').then(r=>{if(!r.ok)throw Error('模型预览暂时不可用');return r.json();}).then(data=>data.meshes);
