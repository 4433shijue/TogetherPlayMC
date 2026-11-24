package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.*;
import net.minecraft.network.chat.Component;
import java.util.Base64;

public final class JourneyEditScreen extends Screen {
    private final JourneyScreen parent;private final CompanionClient c;private final JsonObject entry;private final boolean goal;
    private EditBox name,mood;private MultiLineEditBox notes;private String error="",titleDraft,noteDraft,moodDraft;private boolean favorite,pinHere;private JsonArray steps;private String reminder;
    public JourneyEditScreen(JourneyScreen parent,CompanionClient c,JsonObject entry,boolean goal){super(Component.literal(goal?"我们的打算":"一段回忆"));this.parent=parent;this.c=c;this.entry=entry;this.goal=goal;JsonObject data=entry==null?new JsonObject():entry.getAsJsonObject("data");titleDraft=CompanionConfig.get(data,"title","");noteDraft=CompanionConfig.get(data,goal?"notes":"text","");moodDraft=CompanionConfig.get(data,"mood","");favorite=data.has("favorite")&&data.get("favorite").getAsBoolean();}
    private void button(String label,int x,int y,int w,Runnable action){addRenderableWidget(Button.builder(Component.literal(label),b->action.run()).bounds(x,y,w,20).build());}
    @Override protected void init(){
        if(name!=null){titleDraft=name.getValue();noteDraft=notes.getValue();moodDraft=mood.getValue();}
        name=new EditBox(font,20,46,width-40,20,Component.literal("标题"));name.setMaxLength(200);name.setValue(titleDraft);addRenderableWidget(name);setInitialFocus(name);
        mood=new EditBox(font,20,86,width-40,20,Component.literal(goal?"状态":"心情"));mood.setMaxLength(80);mood.setValue(moodDraft);mood.visible=!goal;addRenderableWidget(mood);
        int y=goal?82:124;notes=new MultiLineEditBox(font,20,y,width-40,Math.max(42,height-y-93),Component.literal(goal?"写下备注…":"记住当时的事…"),Component.literal("正文"));notes.setValue(noteDraft);addRenderableWidget(notes);
        button("保存",20,height-37,66,()->save(null));button("返回",94,height-37,66,this::onClose);
        if(entry!=null&&goal)button("删除",168,height-37,66,()->minecraft.setScreen(new ConfirmScreen(yes->{if(yes){JsonObject b=new JsonObject();b.add("id",entry.get("id"));c.request("goal-delete",b,this::saved);}else minecraft.setScreen(this);},Component.literal("删除这个打算？"),Component.literal("移出打算和接续提醒，可在“已删除”中恢复。"))));
        if(entry!=null&&!goal){button(favorite?"已收藏":"收藏",168,height-37,66,()->{favorite=!favorite;save(null);});button("删除",242,height-37,66,()->minecraft.setScreen(new ConfirmScreen(yes->{if(yes){JsonObject b=new JsonObject();b.addProperty("id",entry.get("id").getAsString());b.addProperty("remove",true);c.request("journal-edit",b,this::saved);}else minecraft.setScreen(this);},Component.literal("删除这条回忆？"),Component.literal("关联的整理日记也会失效。"))));
            JsonObject data=entry.getAsJsonObject("data");if(data.has("mediaId")&&!data.get("mediaId").isJsonNull())button("查看照片 / 提问",width-154,12,134,()->{JsonObject b=new JsonObject();b.add("id",data.get("mediaId"));c.request("media",b,r->{if(r.has("error")){error=r.get("error").getAsString();return;}PhotoScreen screen=new PhotoScreen(c,Base64.getDecoder().decode(r.get("data").getAsString()),false);screen.useSaved(r.get("id").getAsString());minecraft.setScreen(screen);});});
        }
        if(goal){if(steps==null){JsonObject data=entry==null?new JsonObject():entry.getAsJsonObject("data");steps=data.has("steps")?data.getAsJsonArray("steps").deepCopy():new JsonArray();reminder=CompanionConfig.get(data,"reminder","quiet");}button("步骤 / 提醒",width-246,12,96,()->minecraft.setScreen(new GoalStepsScreen(this,steps,reminder,(s,r)->{steps=s;reminder=r;})));button(pinHere?"已选当前地点":"记下当前地点",width-144,12,124,()->{pinHere=!pinHere;rebuildWidgets();});}
        if(goal&&entry!=null){int x=20;for(String status:new String[]{"active","paused","done","abandoned"}){final String value=status;button(JourneyScreen.status(status),x,height-65,Math.min(92,(width-50)/4),()->save(value));x+=(width-40)/4;}}
    }
    private void save(String status){JsonObject b=new JsonObject();if(entry!=null)b.add("id",entry.get("id"));b.addProperty("title",name.getValue());b.addProperty(goal?"notes":"text",notes.getValue());if(goal){b.add("steps",steps);b.addProperty("reminder",reminder);b.addProperty("pinHere",pinHere);if(status!=null)b.addProperty("status",status);}else{b.addProperty("mood",mood.getValue());b.addProperty("favorite",favorite);}c.request(goal?"goal":entry==null?"journal-save":"journal-edit",b,this::saved);}
    private void saved(JsonObject result){if(result.has("error")){error=result.get("error").getAsString();if(minecraft.screen instanceof ConfirmScreen)minecraft.setScreen(this);return;}if(minecraft.screen==this||minecraft.screen instanceof ConfirmScreen)minecraft.setScreen(parent);}
    @Override public void onClose(){minecraft.setScreen(parent);}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void tick(){GameVersion.tick(name);GameVersion.tick(mood);}
    @Override public void render(GuiGraphics g,int mx,int my,float p){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,20,16,0xB8E8D2);g.drawString(font,"标题",20,33,0xAABCB3);if(!goal){g.drawString(font,"心情",20,73,0xAABCB3);g.drawString(font,"记下的话",20,111,0xAABCB3);}else g.drawString(font,"备注",20,70,0xAABCB3);if(goal&&entry!=null){JsonObject d=entry.getAsJsonObject("data");String source=CompanionConfig.get(d,"completionSource","");String info=(source.equals("game")?"游戏进度已确认":source.equals("user")?"由你确认完成":"")+(d.has("position")&&!d.get("position").isJsonNull()?" · 地点 "+d.get("position"):"");g.drawString(font,font.plainSubstrByWidth(info,width-40),20,height-82,0xAABCB3);}if(!error.isEmpty())g.drawString(font,font.plainSubstrByWidth(error,width-40),20,height-82,0xF0B4A5);super.render(g,mx,my,p);}
}
