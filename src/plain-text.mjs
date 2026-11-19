export function plainTextReply(value=''){
  let text=String(value??'').replace(/\r\n?/g,'\n');
  text=text.replace(/```[^\n]*\n?/g,'').replace(/```/g,'');
  text=text.replace(/\*\*([\s\S]*?)\*\*/g,'$1').replace(/__([\s\S]*?)__/g,'$1');
  text=text.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
  text=text.replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/^\s*[-*+]\s+/gm,'');
  text=text.replace(/\\\n/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  return text.trim();
}
