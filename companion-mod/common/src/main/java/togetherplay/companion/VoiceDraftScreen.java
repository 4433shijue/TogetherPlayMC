package togetherplay.companion;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class VoiceDraftScreen extends Screen {
    private final CompanionClient c;private String draft;private MultiLineEditBox editor;private final String world,dimension,role;private boolean sent=false;
    public VoiceDraftScreen(CompanionClient c,String text){super(Component.literal("刚才听到的话"));this.c=c;draft=text;world=c.world;role=c.roleId;dimension=c.mc.level.dimension().location().toString();}
    @Override protected void init(){if(editor!=null)draft=editor.getValue();editor=new MultiLineEditBox(font,20,60,width-40,Math.max(36,height-125),Component.literal("可以修改识别结果"),Component.literal("语音草稿"));editor.setValue(draft);editor.setCharacterLimit(4000);addRenderableWidget(editor);setInitialFocus(editor);
        addRenderableWidget(Button.builder(Component.literal("确认发送"),b->{if(!sent&&valid()&&!editor.getValue().isBlank()&&c.sendNativeChat(editor.getValue())){sent=true;c.openChat();}}).bounds(20,height-40,100,20).build());
        addRenderableWidget(Button.builder(Component.literal("取消"),b->onClose()).bounds(128,height-40,76,20).build());}
    private boolean valid(){return role.equals(c.roleId)&&world.equals(c.world)&&c.mc.level!=null&&dimension.equals(c.mc.level.dimension().location().toString());}
    @Override public void tick(){if(!valid())onClose();}
    @Override public void onClose(){minecraft.setScreen(null);}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void render(GuiGraphics g,int x,int y,float p){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,20,16,0xB8E8D2);g.drawString(font,"检查或修改后再发送，Esc 可以丢弃。",20,38,0xBCD3C6);super.render(g,x,y,p);}
}
