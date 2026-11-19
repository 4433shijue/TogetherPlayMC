package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class PlacesScreen extends Screen {
    private final CompanionClient c;private JsonArray places=new JsonArray(),suggestions=new JsonArray();private String notice="正在读取…";private int page=0;
    public PlacesScreen(CompanionClient c){super(Component.literal("一起记住的地方"));this.c=c;}
    @Override protected void init(){draw();load();}
    private void button(String text,int x,int y,int w,Runnable action){addRenderableWidget(Button.builder(Component.literal(text),b->action.run()).bounds(x,y,w,20).build());}
    private void load(){c.request("places",new JsonObject(),r->{if(r.has("error")){notice=r.get("error").getAsString();return;}places=r.getAsJsonArray("places");suggestions=r.getAsJsonArray("suggestions");notice="当前存档和维度 · 距离为直线，不代表可走路线";if(minecraft.screen==this)draw();});}
    private int per(){return Math.max(1,(height-135)/48);}
    private void decide(JsonObject p,boolean accept){JsonObject b=new JsonObject();b.add("id",p.get("id"));b.addProperty("accept",accept);c.request("place-decide",b,r->{if(r.has("error")){notice=r.get("error").getAsString();return;}load();});}
    private void draw(){clearWidgets();int total=suggestions.size()+places.size();page=Math.min(page,Math.max(0,(total-1)/per()));for(int i=page*per();i<Math.min(total,(page+1)*per());i++){int y=70+(i-page*per())*48;if(i<suggestions.size()){JsonObject p=suggestions.get(i).getAsJsonObject();button("记住",width-124,y,50,()->decide(p,true));button("忽略",width-68,y,48,()->decide(p,false));}}
        button("上一页",20,height-38,70,()->{page=Math.max(0,page-1);draw();});button("下一页",96,height-38,70,()->{if((page+1)*per()<total)page++;draw();});button("刷新",width-150,height-38,62,this::load);button("返回",width-82,height-38,62,this::onClose);}
    @Override public void onClose(){c.openChat();}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void render(GuiGraphics g,int x,int mouseY,float partial){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,20,14,0xB8E8D2);g.drawString(font,"聊天说“把这里记为家”，确认后才收入地点簿。",20,36,0xBCD3C6);int total=suggestions.size()+places.size();for(int i=page*per();i<Math.min(total,(page+1)*per());i++){boolean pending=i<suggestions.size();JsonObject p=(pending?suggestions.get(i):places.get(i-suggestions.size())).getAsJsonObject();int y=70+(i-page*per())*48;String label=(pending?"待确认 · ":"")+CompanionConfig.get(p,"name","");if(!pending&&p.has("distance")&&!p.get("distance").isJsonNull())label+=" · 约 "+p.get("distance").getAsInt()+" 格";g.drawString(font,font.plainSubstrByWidth(label,width-(pending?162:40)),20,y+4,0xE8F0EC);JsonObject pos=p.getAsJsonObject("position");if(pos!=null)g.drawString(font,"X "+pos.get("x").getAsInt()+" / Y "+pos.get("y").getAsInt()+" / Z "+pos.get("z").getAsInt(),20,y+26,0x91ADA0);}if(total==0)g.drawString(font,"还没有记下地点。",20,76,0xBCD3C6);g.drawString(font,font.plainSubstrByWidth(notice,width-40),20,height-56,0xBCD3C6);super.render(g,x,mouseY,partial);}
}
