package togetherplay.companion;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import org.lwjgl.glfw.GLFW;
import java.util.*;

public final class CompanionScreen extends VersionScrollScreen {
    private final CompanionClient companion;
    private EditBox input;
    private final ChatViewport viewport=new ChatViewport();
    private CompanionClient.Line lastMessage;
    private Button latest;
    private int unread=0;
    private boolean dragging=false;
    private double dragGrab=0;
    private String draft="";
    public CompanionScreen(CompanionClient companion){super(Component.literal("和伙伴聊聊"));this.companion=companion;}
    @Override protected void init(){
        if(input!=null)draft=input.getValue();
        input=new EditBox(font,20,height-34,width-112,20,Component.literal("想对他说的话"));input.setMaxLength(4000);input.setValue(draft);addRenderableWidget(input);setInitialFocus(input);
        addRenderableWidget(Button.builder(Component.literal("发送"),b->send()).bounds(width-84,height-34,64,20).build());
        latest=addRenderableWidget(Button.builder(Component.literal("回到最新"),b->jumpToLatest()).bounds(width-116,height-57,96,18).build());latest.visible=viewport.readingHistory();
        addRenderableWidget(Button.builder(Component.literal("设置"),b->{draft=input.getValue();minecraft.setScreen(new AppearanceScreen(this,companion));}).bounds(width-76,12,56,20).build());
        addRenderableWidget(Button.builder(Component.literal("回忆"),b->minecraft.setScreen(new JourneyScreen(companion,false))).bounds(width-200,12,56,20).build());
        addRenderableWidget(Button.builder(Component.literal("打算"),b->minecraft.setScreen(new JourneyScreen(companion,true))).bounds(width-138,12,56,20).build());
        boolean gifts=companion.journeyState.has("giftMode");int cell=gifts?(width-76)/7:(width-70)/6;
        addRenderableWidget(Button.builder(Component.literal("取消回复"),b->{companion.cancelReply();}).bounds(20,37,cell,18).build());
        addRenderableWidget(Button.builder(Component.literal("资料来源"),b->minecraft.setScreen(new SourcesScreen(this,companion))).bounds(26+cell,37,cell,18).build());
        addRenderableWidget(Button.builder(Component.literal("让他看看"),b->companion.capture(false)).bounds(32+cell*2,37,cell,18).build());
        addRenderableWidget(Button.builder(Component.literal("记住这一刻"),b->companion.capture(true)).bounds(38+cell*3,37,cell,18).build());
        addRenderableWidget(Button.builder(Component.literal("地点"),b->minecraft.setScreen(new PlacesScreen(companion))).bounds(44+cell*4,37,cell,18).build());
        addRenderableWidget(Button.builder(Component.literal("语音"),b->minecraft.setScreen(new VoiceScreen(companion))).bounds(50+cell*5,37,cell,18).build());
        if(gifts){
            String mode=togetherplay.companion.CompanionConfig.get(companion.journeyState,"giftMode","off");
            Button gift=addRenderableWidget(Button.builder(Component.literal(switch(mode){case "role"->"礼物:随心";case "progress"->"礼物:进度";default->"礼物:关";}),b->{
                b.active=false;companion.invalidateGift();var args=new com.google.gson.JsonObject();
                args.addProperty("mode",switch(mode){case "off"->"role";case "role"->"progress";default->"off";});
                companion.request("gift-mode",args,r->{if(r.has("mode"))companion.journeyState.add("giftMode",r.get("mode"));else companion.notice(CompanionConfig.get(r,"error","设置未保存"));rebuildWidgets();});
            }).bounds(56+cell*6,37,cell,18).build());
            gift.setTooltip(Tooltip.create(Component.literal("当前存档的赠礼：关闭、由角色决定（可跨进度）、保护进度")));
        }
        addRenderableWidget(Button.builder(Component.literal(guideName()),b->{companion.config.guideLevel=switch(companion.config.guideLevel){case "hint"->"next";case "next"->"full";default->"hint";};companion.connection.appearance();b.setMessage(Component.literal(guideName()));}).bounds(20,60,(width-52)/3,18).build());
        if(companion.journeyState.has("recap")&&!companion.journeyState.get("recap").isJsonNull()){
            addRenderableWidget(Button.builder(Component.literal("接着上次的打算"),b->{companion.request("recap-dismiss",new com.google.gson.JsonObject(),r->{});minecraft.setScreen(new JourneyScreen(companion,true));}).bounds(26+(width-52)/3,60,(width-52)/3,18).build());
            addRenderableWidget(Button.builder(Component.literal("今天换件事"),b->{companion.request("recap-dismiss",new com.google.gson.JsonObject(),r->{});companion.journeyState.remove("recap");rebuildWidgets();}).bounds(32+2*((width-52)/3),60,(width-52)/3,18).build());
        }
    }
    private void jumpToLatest(){viewport.latest();unread=0;}
    private void send(){String text=input.getValue().trim();if(text.isEmpty())return;jumpToLatest();if(!companion.connection.status.equals("陪在你身边")){companion.history.add(new CompanionClient.Line("提示","伙伴尚未连接，请检查控制台或稍后重试。",new com.google.gson.JsonArray()));return;}companion.voice.stop();companion.connection.send(text);input.setValue("");draft="";}
    @Override public boolean keyPressed(int key,int scan,int modifiers){if((key==GLFW.GLFW_KEY_ENTER||key==GLFW.GLFW_KEY_KP_ENTER)&&input.isFocused()){send();return true;}if(key==GLFW.GLFW_KEY_PAGE_UP||key==GLFW.GLFW_KEY_PAGE_DOWN){viewport.scroll((key==GLFW.GLFW_KEY_PAGE_UP?1:-1)*Math.max(12,height-160));return true;}if(hasControlDown()&&(key==GLFW.GLFW_KEY_HOME||key==GLFW.GLFW_KEY_END)){if(key==GLFW.GLFW_KEY_HOME)viewport.oldest();else jumpToLatest();return true;}return super.keyPressed(key,scan,modifiers);}
    @Override protected boolean scrollContent(double x,double y,double delta){if(y>=86&&y<height-60){viewport.scroll((int)Math.round(delta*28));return true;}return false;}
    @Override public boolean mouseClicked(double x,double y,int button){if(button==0&&viewport.maximum()>0&&x>=width-24&&x<=width-12&&y>=86&&y<height-60){int thumb=viewport.thumbTop(86);dragGrab=y>=thumb&&y<thumb+viewport.thumbHeight()?y-thumb:viewport.thumbHeight()/2.0;dragging=true;viewport.dragThumb(y-dragGrab,86);return true;}return super.mouseClicked(x,y,button);}
    @Override public boolean mouseDragged(double x,double y,int button,double dx,double dy){if(dragging&&button==0){viewport.dragThumb(y-dragGrab,86);return true;}return super.mouseDragged(x,y,button,dx,dy);}
    @Override public boolean mouseReleased(double x,double y,int button){if(button==0&&dragging){dragging=false;return true;}return super.mouseReleased(x,y,button);}
    @Override public void tick(){GameVersion.tick(input);}
    @Override public void render(GuiGraphics graphics,int mouseX,int mouseY,float partial){
        graphics.fill(8,5,width-8,height-8,0xE51B2929);graphics.drawString(font,font.plainSubstrByWidth(companion.connection.name,Math.max(40,width-250)),20,16,0xB8E8D2);graphics.drawString(font,font.plainSubstrByWidth(companion.connection.thinking?(companion.connection.progress.isEmpty()?"正在想怎么回答你…":companion.connection.progress):companion.connection.status,Math.max(20,width-144)),20,height-47,0xB6C8C5);
        List<FormattedCharSequence> lines=new ArrayList<>();int appended=0,newMessages=0;boolean foundLast=false;
        for(CompanionClient.Line line:companion.history){List<FormattedCharSequence> wrapped=font.split(Component.literal(line.speaker()+"  "+line.text()),width-48);lines.addAll(wrapped);lines.add(FormattedCharSequence.EMPTY);if(foundLast){appended+=(wrapped.size()+1)*12;newMessages++;}if(line==lastMessage)foundLast=true;}
        if(lastMessage!=null&&!foundLast)jumpToLatest();
        if(viewport.readingHistory())unread+=newMessages;
        lastMessage=companion.history.isEmpty()?null:companion.history.get(companion.history.size()-1);
        if(companion.journeyState.has("recap")&&!companion.journeyState.get("recap").isJsonNull()){String summary=CompanionConfig.get(companion.journeyState.getAsJsonObject("recap"),"summary","");lines.addAll(0,font.split(Component.literal("上次玩到这里："+summary),width-48));}
        if(!companion.connection.draft.isEmpty()){lines.addAll(font.split(Component.literal("回复草稿（尚未完成）  "+companion.connection.draft),width-48));}
        int top=86,bottom=Math.max(top+1,height-60),total=lines.size()*12;viewport.update(total,bottom-top,appended);
        if(!viewport.readingHistory())unread=0;latest.visible=viewport.readingHistory();latest.setMessage(Component.literal(unread>0?"回到最新 ("+unread+")":"回到最新"));
        graphics.enableScissor(18,top,width-26,bottom);int y=viewport.origin(top);for(FormattedCharSequence line:lines){if(y>=top-12&&y<bottom)graphics.drawString(font,line,24,y,0xE8F0EC);y+=12;}graphics.disableScissor();
        if(viewport.maximum()>0){int thumb=viewport.thumbTop(top);graphics.fill(width-21,top,width-17,bottom,0x66465E55);graphics.fill(width-22,thumb,width-16,thumb+viewport.thumbHeight(),0xFFB8DACA);}
        super.render(graphics,mouseX,mouseY,partial);
    }
    @Override public boolean isPauseScreen(){return false;}
    private String guideName(){return switch(companion.config.guideLevel){case "next"->"告诉我下一步";case "full"->"完整攻略";default->"只给提示";};}
}
