package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.network.chat.Component;
import javax.sound.sampled.*;
import java.io.*;
import java.util.Base64;

/** Local, bounded audio. Recording never sends chat without the player's confirmation. */
public final class CompanionVoice {
    private final CompanionClient c;
    private volatile TargetDataLine microphone;
    private volatile SourceDataLine speaker;
    private volatile boolean recording=false;
    private volatile int epoch=0;
    private boolean held=false,wasAvailable=false;
    private String scope="";
    private volatile float left=.75f,right=.75f;
    public JsonObject config=new JsonObject();
    public String status="";
    public CompanionVoice(CompanionClient c){this.c=c;}
    private void background(Runnable r){Thread t=new Thread(r,"Together Local Audio");t.setDaemon(true);t.start();}
    public void request(String route,JsonObject data,java.util.function.Consumer<JsonObject> callback){data.addProperty("voiceId",epoch);c.connection.voice(route,data,r->c.mc.execute(()->callback.accept(r)));}
    private boolean enabled(String key){return config.has(key)&&config.get(key).getAsBoolean();}
    public void configure(JsonObject value){boolean changed=!value.equals(config);config=value.deepCopy();if(changed)stop();}
    public void stop(){
        int previous=epoch++;recording=false;status="";
        TargetDataLine m=microphone;microphone=null;if(m!=null){m.stop();m.close();}
        SourceDataLine s=speaker;speaker=null;if(s!=null){s.stop();s.flush();s.close();}
        if(c.connection.status.equals("陪在你身边")){JsonObject b=new JsonObject();b.addProperty("voiceId",previous);c.connection.command("voice/cancel",b);}
    }
    public void tick(boolean down,boolean interrupt){
        String next=c.world+":"+(c.mc.level==null?"":c.mc.level.dimension().location());
        boolean available=c.mc.player!=null&&c.mc.getSingleplayerServer()!=null&&!c.mc.getSingleplayerServer().isPublished()&&c.connection.status.equals("陪在你身边");
        if(!next.equals(scope)||!available||!c.mc.isWindowActive()){if(wasAvailable||recording||speaker!=null||!status.isEmpty())stop();wasAvailable=false;scope=next;held=down;return;}
        wasAvailable=true;
        if(interrupt){c.cancelReply();held=down;return;}
        if(recording&&c.mc.screen!=null){stop();held=down;return;}
        if(down&&!held&&c.mc.screen==null){if(enabled("inputEnabled"))start();else c.mc.gui.setOverlayMessage(Component.literal("先在 F8 → 语音 开启按键说话"),false);}
        if(!down&&held&&recording){recording=false;TargetDataLine m=microphone;if(m!=null){m.stop();m.close();}}
        held=down;
        if(recording)c.mc.gui.setOverlayMessage(Component.literal("正在录音 · 松开按键检查文字 · 最长 20 秒 · F7 取消"),false);
        else if(!status.isEmpty())c.mc.gui.setOverlayMessage(Component.literal(status),false);
        float volume=config.has("volume")?config.get("volume").getAsFloat()/100f:.75f;double pan=0,gain=1;
        OrbMotion.Point p=c.orb.interpolate(1);
        if(enabled("spatial")&&p!=null){double dx=p.x()-c.mc.player.getX(),dz=p.z()-c.mc.player.getZ(),d=Math.hypot(dx,dz),yaw=Math.toRadians(c.mc.player.getYRot());pan=d<.01?0:Math.max(-1,Math.min(1,(-Math.cos(yaw)*dx-Math.sin(yaw)*dz)/d));gain=Math.min(1,3/Math.max(3,d));}
        left=(float)(volume*gain*(1-Math.max(0,pan)*.8));right=(float)(volume*gain*(1+Math.min(0,pan)*.8));
    }
    private void start(){
        stop();int token=epoch;recording=true;status="正在录音…";
        background(()->{TargetDataLine line=null;try{
            AudioFormat format=new AudioFormat(16000,16,1,true,false);line=AudioSystem.getTargetDataLine(format);line.open(format,3200);
            synchronized(this){if(token!=epoch||!recording){line.close();return;}microphone=line;line.start();}
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] block=new byte[1600];
            while(recording&&token==epoch&&bytes.size()<640000){int n=line.read(block,0,Math.min(block.length,640000-bytes.size()));if(n>0)bytes.write(block,0,n);else break;}
            byte[] pcm=bytes.toByteArray();
            c.mc.execute(()->{if(token!=epoch)return;recording=false;status="正在识别，F7 可以取消…";if(pcm.length<3200){status="";c.notice("这次录音太短，再按住说一句吧。");return;}
                try{ByteArrayOutputStream wav=new ByteArrayOutputStream();AudioSystem.write(new AudioInputStream(new ByteArrayInputStream(pcm),format,pcm.length/2),AudioFileFormat.Type.WAVE,wav);JsonObject body=new JsonObject();body.addProperty("data",Base64.getEncoder().encodeToString(wav.toByteArray()));request("transcribe",body,r->{if(token!=epoch)return;status="";if(r.has("error")){c.notice(r.get("error").getAsString());return;}String text=CompanionConfig.get(r,"text","");if(text.isBlank()){c.notice("没有听清这次说的话，可以重试或直接打字。");return;}c.mc.setScreen(new VoiceDraftScreen(c,text));});}catch(Exception e){status="";c.notice("录音没有完成，可以直接打字。");}
            });
        }catch(Exception e){c.mc.execute(()->{if(token==epoch){recording=false;status="";c.notice("麦克风不可用，请检查 Windows 麦克风权限和输入设备。");}});}finally{if(line!=null){line.stop();line.close();if(microphone==line)microphone=null;}}});
    }
    public void speak(String text){
        if(!enabled("outputEnabled")||text.isBlank()||recording)return;
        stop();int token=epoch;
        java.util.Queue<String> sentences=new java.util.ArrayDeque<>();
        int budget=220;
        for(String sentence:text.split("(?<=[。！？!?；;\\n])")){
            if(budget<=0)break;sentence=sentence.strip();if(sentence.isEmpty())continue;
            String bounded=sentence.substring(0,Math.min(sentence.length(),budget));sentences.add(bounded);budget-=bounded.length();
        }
        speakNext(sentences,token);
    }
    private void speakNext(java.util.Queue<String> sentences,int token){
        if(token!=epoch||sentences.isEmpty())return;
        JsonObject body=new JsonObject();body.addProperty("text",sentences.remove());status="正在准备朗读，F7 可以停止…";
        request("speak",body,r->{if(token!=epoch)return;status="";if(r.has("error")){c.notice(r.get("error").getAsString());return;}if(!r.has("data"))return;background(()->{play(r.get("data").getAsString(),token);c.mc.execute(()->speakNext(sentences,token));});});
    }
    private void play(String base64,int token){SourceDataLine line=null;try{
        byte[] wav=Base64.getDecoder().decode(base64);
        try(AudioInputStream raw=AudioSystem.getAudioInputStream(new ByteArrayInputStream(wav))){AudioFormat format=new AudioFormat(raw.getFormat().getSampleRate(),16,2,true,false);
            try(AudioInputStream audio=AudioSystem.getAudioInputStream(format,raw)){line=AudioSystem.getSourceDataLine(format);line.open(format,4096);synchronized(this){if(token!=epoch){line.close();return;}speaker=line;line.start();}
                byte[] bytes=new byte[2048];int n;while(token==epoch&&(n=audio.read(bytes))>0){for(int i=0;i+3<n;i+=4){scale(bytes,i,left);scale(bytes,i+2,right);}if(token==epoch)line.write(bytes,0,n);}if(token==epoch)line.drain();
            }
        }
    }catch(Exception e){c.mc.execute(()->{if(token==epoch)c.notice("无法播放声音，请检查 Windows 输出设备。");});}finally{if(line!=null){line.stop();line.close();if(speaker==line)speaker=null;}}}
    private static void scale(byte[] b,int i,float gain){short s=(short)((b[i]&255)|(b[i+1]<<8));int out=Math.round(s*gain);b[i]=(byte)out;b[i+1]=(byte)(out>>8);}
}
