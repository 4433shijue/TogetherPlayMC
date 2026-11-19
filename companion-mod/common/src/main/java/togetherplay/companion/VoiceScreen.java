package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class VoiceScreen extends Screen {
    private final CompanionClient c;private JsonObject settings;private JsonArray voices=new JsonArray();private String notice="正在读取本机语音…";private boolean busy=true;
    public VoiceScreen(CompanionClient c){super(Component.literal("一起说说话"));this.c=c;settings=c.voice.config.deepCopy();}
    @Override protected void init(){draw();c.voice.request("config",new JsonObject(),r->{if(minecraft.screen!=this)return;if(r.has("error")){notice=r.get("error").getAsString();return;}settings=r.deepCopy();voices=r.getAsJsonArray("voices");busy=false;notice="设置保存在本机。语音默认关闭。";draw();});}
    private void button(String text,int y,Runnable click){Button b=addRenderableWidget(Button.builder(Component.literal(text),v->click.run()).bounds(20,y,width-40,20).build());b.active=!busy;}
    private boolean value(String key){return settings.has(key)&&settings.get(key).getAsBoolean();}
    private void toggle(String key){settings.addProperty(key,!value(key));draw();}
    private void draw(){clearWidgets();button("按键说话："+(value("inputEnabled")?"开启":"关闭"),56,()->toggle("inputEnabled"));button("朗读伙伴回复："+(value("outputEnabled")?"开启":"关闭"),77,()->toggle("outputEnabled"));button("声音跟随小球的位置："+(value("spatial")?"开启":"关闭"),98,()->toggle("spatial"));
        button("声音："+CompanionConfig.get(settings,"voice","").replaceFirst("^$","自动选择中文声音"),119,()->{if(voices.isEmpty())return;String current=CompanionConfig.get(settings,"voice","");int i=-1;for(int n=0;n<voices.size();n++)if(CompanionConfig.get(voices.get(n).getAsJsonObject(),"name","").equals(current))i=n;settings.addProperty("voice",voices.get((i+1)%voices.size()).getAsJsonObject().get("name").getAsString());draw();});
        button("音量："+(settings.has("volume")?settings.get("volume").getAsInt():75)+"%",140,()->{int v=settings.has("volume")?settings.get("volume").getAsInt():75;settings.addProperty("volume",v>=100?0:v+25);draw();});
        button("保存设置",height-60,()->{busy=true;draw();JsonObject body=settings.deepCopy();body.addProperty("save",true);c.voice.request("config",body,r->{busy=false;if(r.has("error"))notice=r.get("error").getAsString();else{c.voice.configure(r);notice="已保存。回到游戏后按住说话。";}if(minecraft.screen==this)draw();});});
        addRenderableWidget(Button.builder(Component.literal("返回"),v->onClose()).bounds(20,height-36,width-40,20).build());}
    @Override public void onClose(){c.openChat();}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void render(GuiGraphics g,int x,int y,float p){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,20,14,0xB8E8D2);g.drawString(font,"默认 F6 按住说话，F7 停止。可在游戏按键设置修改。",20,32,0xBCD3C6);g.drawString(font,"松开后检查文字再发送；识别和朗读都在本机完成。",20,44,0xBCD3C6);g.drawString(font,font.plainSubstrByWidth(notice,width-40),20,height-76,0xBCD3C6);super.render(g,x,y,p);}
}
