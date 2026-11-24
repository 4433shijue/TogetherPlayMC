export const gameTargets=[
  {version:'1.20.1',loader:'fabric',java:17,project:'fabric',api:'0.92.2+1.20.1',sha1:'625ee015ee426d9b677382a7bb661383d89c0807'},
  {version:'1.20.1',loader:'forge',java:17,project:'forge'},
  {version:'1.21.1',loader:'fabric',java:21,project:'fabric1211',api:'0.116.1+1.21.1',sha1:'bd8e174dcf695c94a7d8dfc8f86b2e557bad0faa'},
  {version:'1.21.1',loader:'neoforge',java:21,project:'neoforge1211',preview:true}
];
export const gameTarget=(version,loader)=>gameTargets.find(t=>t.version===version&&t.loader===loader&&(!t.preview||process.env.TOGETHER_NEOFORGE_PREVIEW==='1'));
export const managedCompanion=name=>/^together-companion-(?:fabric|forge|neoforge)-\d+(?:\.\d+)+-\d+(?:\.\d+)+\.jar$/.test(name);
export const sameTarget=(a,b)=>(a.version??'1.20.1')===(b.version??'1.20.1')&&a.loader===b.loader;
export const companionJar=t=>'together-companion-'+t.loader+'-'+t.version+'-0.6.0.jar';
