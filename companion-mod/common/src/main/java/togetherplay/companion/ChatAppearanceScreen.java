package togetherplay.companion;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ChatAppearanceScreen extends Screen {
    private final Screen parent;private final CompanionClient c;
    private EditBox body,name;private String bodyDraft,nameDraft,error="";
    public ChatAppearanceScreen(Screen parent,CompanionClient c){super(Component.literal("聊天文字颜色"));this.parent=parent;this.c=c;bodyDraft=c.config.chatColor;nameDraft=c.config.chatNameColor;}
    @Override protected void init(){
        if(body!=null){bodyDraft=body.getValue();nameDraft=name.getValue();}
        int x=width/2-130;
        name=new EditBox(font,x,58,120,20,Component.literal("名字颜色 #RRGGBB"));name.setMaxLength(7);name.setValue(nameDraft);addRenderableWidget(name);
        body=new EditBox(font,x+132,58,120,20,Component.literal("正文颜色 #RRGGBB"));body.setMaxLength(7);body.setValue(bodyDraft);addRenderableWidget(body);
        addRenderableWidget(Button.builder(Component.literal("恢复默认配色"),b->{name.setValue("#88C9B0");body.setValue("#B8E8D2");}).bounds(x,88,252,20).build());
        addRenderableWidget(Button.builder(Component.literal("保存"),b->{if(!name.getValue().matches("#[a-fA-F0-9]{6}")||!body.getValue().matches("#[a-fA-F0-9]{6}")){error="请输入完整的 #RRGGBB 色值。";return;}c.config.chatNameColor=name.getValue();c.config.chatColor=body.getValue();c.config.save();c.connection.appearance();minecraft.setScreen(parent);}).bounds(x,height-37,120,20).build());
        addRenderableWidget(Button.builder(Component.literal("返回"),b->minecraft.setScreen(parent)).bounds(x+132,height-37,120,20).build());
    }
    @Override public void tick(){name.tick();body.tick();}
    @Override public void render(GuiGraphics g,int mx,int my,float partial){
        g.fill(0,0,width,height,0xF01B2929);int x=width/2-130;
        g.drawString(font,title,x,20,0xB8E8D2);g.drawString(font,"名字颜色",x,44,0xEEEEEE);g.drawString(font,"正文颜色",x+132,44,0xEEEEEE);
        g.fill(x,120,x+252,158,0xCC101916);g.drawString(font,NativeChat.message(c.connection.name,"我在呢，慢慢来。",name.getValue(),body.getValue()),x+8,130,0xFFFFFF);
        g.drawString(font,font.plainSubstrByWidth(error.isEmpty()?"按 T 聊天；保存后新消息使用此配色。":error,260),x,height-53,error.isEmpty()?0xAABCB3:0xFF9999);
        super.render(g,mx,my,partial);
    }
    @Override public boolean isPauseScreen(){return false;}
    @Override public void onClose(){minecraft.setScreen(parent);}
}
