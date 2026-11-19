const {app,BrowserWindow,Tray,Menu,ipcMain,dialog,shell,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=process.env.TOGETHER_ROOT||[path.resolve(__dirname,'..'),path.resolve(__dirname,'../..')].find(p=>fs.existsSync(path.join(p,'src/server.mjs')));
function dataDirectory(){
 if(process.env.TOGETHER_DATA?.trim())return path.resolve(process.env.TOGETHER_DATA.trim());
 const local=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local');
 return path.join(local,'TogetherPlayMC','data');
}
const dataRoot=dataDirectory();
let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(dataRoot,'connection.json'),'utf8'));}catch{}
let port=Number(process.env.TOGETHER_PORT||settings.port||38885),url='http://127.0.0.1:'+port;
let win,tray,quitting=false,starting;
const startFile=path.join(__dirname,'start.html');
app.setName('TogetherPlayMC');
function ensureDesktopShortcut(){
 if(process.platform!=='win32'||!app.isPackaged)return;
 try{
   const shortcut=path.join(app.getPath('desktop'),'一起玩 MC.lnk');
   const options={target:process.execPath,cwd:root,description:'一起玩 MC · 本地陪伴',icon:process.execPath,iconIndex:0};
   if(fs.existsSync(shortcut)){
     try{if(path.resolve(shell.readShortcutLink(shortcut).target)===path.resolve(process.execPath))return;}catch{}
     shell.writeShortcutLink(shortcut,'replace',options);
   }else shell.writeShortcutLink(shortcut,'create',options);
 }catch{}
}
// One desktop window per distribution; it can share a backend with the CMD entry.
app.setPath('userData',path.join(dataRoot,'desktop'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{win?.show();win?.focus();});
 app.whenReady().then(()=>{
   ensureDesktopShortcut();
   win=new BrowserWindow({width:1240,height:840,minWidth:740,minHeight:560,title:'一起玩 MC',backgroundColor:'#f5f7f2',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.webContents.on('will-navigate',(e,target)=>{if(!trusted(target))e.preventDefault();});
   win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
   win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
   win.loadFile(startFile);
   const icon=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVQ4T2NkaG78z0ABYBw1YNSAUQNGDRg1YOAAAGJkAg9+I42rAAAAAElFTkSuQmCC');
   tray=new Tray(icon);tray.setToolTip('一起玩 MC · 本地陪伴');tray.on('double-click',()=>win.show());
   tray.setContextMenu(Menu.buildFromTemplate([{label:'打开控制台',click:()=>win.show()},{label:'打开网页版',click:()=>shell.openExternal(url)},{type:'separator'},{label:'关闭桌面，服务继续运行',click:()=>{quitting=true;app.quit();}},{label:'退出本地服务与桌面',click:async()=>{try{const s=await state();if(s)await fetch(url+'/api/shutdown',{method:'POST',headers:{'x-together-token':s.csrf}});quitting=true;app.quit();}catch(e){dialog.showErrorBox('退出服务失败',e.message);}}}]));
   Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'一起玩 MC',submenu:[{label:'开始连接 / 返回控制台',click:()=>connect().catch(e=>dialog.showErrorBox('连接失败',e.message))},{label:'打开网页版',click:()=>shell.openExternal(url)},{label:'重新加载',role:'reload'},{type:'separator'},{label:'收进托盘',click:()=>win.hide()}]}]));
 });
}
function trusted(target){try{const u=new URL(target);return u.origin===url||target===require('node:url').pathToFileURL(startFile).href;}catch{return false;}}
function guard(event){if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!trusted(event.senderFrame.url))throw Error('不允许此页面调用桌面功能。');}
async function state(){try{const r=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1500)}),s=await r.json();if(s.app!=='TogetherPlayMC')throw Error('端口被其他程序占用。请关闭占用该端口的程序，或在启动设置中更换端口。');return s;}catch(e){if(/端口/.test(e.message))throw e;return null;}}
async function connect(){
 if(starting)return starting;
 starting=(async()=>{
   if(!(await state())){
     const node=path.join(root,'runtime/node/node.exe');if(!fs.existsSync(node))throw Error('缺少本地运行时，请解压完整安装包。');
     fs.mkdirSync(path.join(dataRoot,'logs'),{recursive:true});const log=fs.openSync(path.join(dataRoot,'logs/service.log'),'a');
     const child=spawn(node,[path.join(root,'src/server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,TOGETHER_PORT:String(port),TOGETHER_DATA:dataRoot}});child.on('error',()=>{});child.unref();fs.closeSync(log);
     let ready=false;for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,250));if(await state()){ready=true;break;}}
     if(!ready)throw Error('本地服务没有启动成功。查看 '+path.join(dataRoot,'logs/service.log')+'；端口 '+port+' 可能已被占用。关闭占用程序后重试，或在 CMD 中设置 TOGETHER_PORT。');
   }
   await win.loadURL(url);win.show();return {url};
 })().finally(()=>starting=null);return starting;
}
ipcMain.handle('connect',(e)=>{guard(e);return connect();});
ipcMain.handle('port',async(e,value)=>{guard(e);if(value!==undefined){if(starting)throw Error('请等连接结束再修改。');if(!Number.isInteger(value)||value<1024||value>65535)throw Error('端口应为 1024–65535。');port=value;url='http://127.0.0.1:'+port;fs.mkdirSync(dataRoot,{recursive:true});fs.writeFileSync(path.join(dataRoot,'connection.json'),JSON.stringify({port}));}return port;});
ipcMain.handle('choose-folder',async e=>{guard(e);const r=await dialog.showOpenDialog(win,{title:'选择 PCL 或游戏版本文件夹',properties:['openDirectory']});return r.canceled?null:r.filePaths[0];});
ipcMain.handle('open-web',async e=>{guard(e);await shell.openExternal(url);});
ipcMain.handle('storage-info',async e=>{guard(e);let migration=null;try{migration=JSON.parse(fs.readFileSync(path.join(dataRoot,'migration.json'),'utf8'));}catch{}return {directory:dataRoot,source:process.env.TOGETHER_DATA?'override':'localappdata',migration};});
app.on('before-quit',()=>quitting=true);
