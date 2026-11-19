const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('togetherDesktop',{connect:()=>ipcRenderer.invoke('connect'),chooseFolder:()=>ipcRenderer.invoke('choose-folder'),openWeb:()=>ipcRenderer.invoke('open-web'),port:value=>ipcRenderer.invoke('port',value),storageInfo:()=>ipcRenderer.invoke('storage-info')});
