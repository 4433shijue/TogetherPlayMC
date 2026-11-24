import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const archiveName=/\.(?:zip|mrpack|7z|rar|tar|tar\.(?:gz|xz|bz2)|tgz|txz|tbz2?)$/i;
export function archiveSignature(file){
  const b=Buffer.alloc(512),fd=fs.openSync(file,'r');try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}
  const prefix=b.subarray(0,8).toString('hex');
  if(/^504b(?:0304|0506|0708)/.test(prefix))return 'zip';
  if(prefix.startsWith('377abcaf271c'))return '7z';
  if(prefix.startsWith('526172211a07'))return 'rar';
  if(prefix.startsWith('1f8b')||prefix.startsWith('fd377a585a00')||prefix.startsWith('425a68')||b.toString('ascii',257,262)==='ustar')return 'tar';
  return 'unknown';
}

// Entry names remain data: only our sequential file numbers ever become disk paths.
export async function spoolArchive(file,scratch,accept,progress){
  let lib;
  try{
    const {default:koffi}=await import('koffi');
    lib=koffi.load(process.platform==='win32'?path.join(process.env.SystemRoot,'System32','archiveint.dll'):process.platform==='darwin'?'/usr/lib/libarchive.dylib':'libarchive.so.13');
  }catch{throw Error('本机缺少可用的 libarchive 读取器，请升级系统或选择已解压的游戏文件夹。');}
  const fn=(name,ret,args)=>lib.func(name,ret,args),windows=process.platform==='win32';
  const create=fn('archive_read_new','void *',[]),enable=n=>fn('archive_read_support_'+n,'int',['void *']);
  const open=fn('archive_read_open_filename'+(windows?'_w':''),'int',['void *',windows?'str16':'str','size_t']);
  const next=lib.func('int archive_read_next_header(void *a, _Out_ void **entry)');
  const entryName=fn('archive_entry_pathname_'+(windows?'w':'utf8'),windows?'str16':'str',['void *']),type=fn('archive_entry_filetype','uint32',['void *']);
  const sizeOf=fn('archive_entry_size','int64',['void *']),read=fn('archive_read_data','intptr_t',['void *','void *','size_t']);
  const err=fn('archive_error_string','str',['void *']),release=fn('archive_read_free','int',['void *']);
  const encrypted=fn('archive_entry_is_encrypted','int',['void *']),link=fn('archive_entry_hardlink','void *',['void *']);
  const a=create(),files=new Map(),buf=Buffer.alloc(256*1024);let total=0,index=0;
  const failure=()=>Error('归档不可读（损坏、加密或缺少分卷）；可选择已解压目录。'+(err(a)||''));
  try{
    for(const n of ['format_7zip','format_rar','format_rar5','format_tar','filter_gzip','filter_bzip2','filter_xz'])enable(n)(a);
    if(open(a,file,256*1024)<0)throw failure();
    while(true){
      const out=[null],status=next(a,out);if(status===1)break;if(status<0)throw failure();
      const e=out[0],raw=entryName(e);if(++index>100000)throw Error('压缩包条目过多。');
      if(encrypted(e)>0)throw Error('暂不导入加密包，请解密后选择游戏文件夹。');
      if(type(e)!==0o100000||link(e))continue;
      const n=(raw??'').replace(/^(?:\.\/)+/,'');if(!accept(n))continue;
      const size=Number(sizeOf(e));if(size<0||size>512*1024**2||total+size>4*1024**3)throw Error('所选资料超过解压上限。');
      if(files.has(n))throw Error('压缩包有重复路径：'+n);
      const dest=path.join(scratch,'entry-'+index),fd=fs.openSync(dest,'wx');let used=0;
      try{while(true){const len=Number(read(a,buf,buf.length));if(len<0)throw failure();if(!len)break;
        used+=len;if(used>size)throw Error('条目长度与清单不一致。');let written=0;while(written<len)written+=fs.writeSync(fd,buf,written,len-written);}
      }finally{fs.closeSync(fd);}
      if(used!==size)throw failure();total+=used;files.set(n,dest);if(files.size%40===0)progress({done:files.size,total:0});
    }
    return files;
  }finally{release(a);}
}
