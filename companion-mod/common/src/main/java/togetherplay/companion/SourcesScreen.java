package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.*;
public final class SourcesScreen extends Screen {
    private final Screen parent;private final CompanionClient c;private int scroll=0;
    public SourcesScreen(Screen parent,CompanionClient c){super(Component.literal("回复引用的资料"));this.parent=parent;this.c=c;}
    protected void init(){addRenderableWidget(Button.builder(Component.literal("返回聊天"),b->minecraft.setScreen(parent)).bounds(20,height-30,100,20).build());}
    public void render(GuiGraphics g,int x,int y,float p){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,"最近回复的资料来源（实际配方优先）",20,15,0xB8E8D2);List<String> text=new ArrayList<>();Set<String> seen=new HashSet<>();for(int i=c.history.size()-1;i>=0&&text.size()<40;i--)for(JsonElement source:c.history.get(i).sources()){JsonObject s=source.getAsJsonObject();String row=CompanionConfig.get(s,"title","")+"\n"+CompanionConfig.get(s,"source","");if(seen.add(row))text.add(row);}if(text.isEmpty())text.add("这段对话没有引用外部资料。");g.enableScissor(18,36,width-18,height-40);int yy=40-scroll;for(String row:text){for(var line:font.split(Component.literal(row),width-45)){g.drawString(font,line,22,yy,0xEEEEEE);yy+=12;}yy+=10;}g.disableScissor();super.render(g,x,y,p);}
    public boolean mouseScrolled(double x,double y,double d){scroll=Math.max(0,scroll-(int)(d*24));return true;}
    public boolean isPauseScreen(){return false;}public void onClose(){minecraft.setScreen(parent);}
}
