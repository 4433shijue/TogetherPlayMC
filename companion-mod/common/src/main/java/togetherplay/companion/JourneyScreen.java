package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.network.chat.Component;
import java.util.*;

public final class JourneyScreen extends Screen {
    private final CompanionClient c;private final boolean goals;private JsonArray rows=new JsonArray();private int offset=0,page=0;private String notice="正在读取…",date="";private boolean favorite=false,goalTrash=false;private EditBox dateBox;private final Set<String> chosen=new HashSet<>();
    public JourneyScreen(CompanionClient c,boolean goals){super(Component.literal(goals?"我们的打算":"共同冒险日记"));this.c=c;this.goals=goals;}
    @Override protected void init(){drawControls();load();}
    private Button button(String label,int x,int y,int w,Runnable click){return addRenderableWidget(Button.builder(Component.literal(label),b->click.run()).bounds(x,y,w,20).build());}
    private void drawControls(){
        if(dateBox!=null)date=dateBox.getValue();clearWidgets();
        int nav=Math.min(60,(width-112)/4);button("聊天",16,12,nav,c::openChat);button("回忆",22+nav,12,nav,()->minecraft.setScreen(new JourneyScreen(c,false)));button("打算",28+nav*2,12,nav,()->minecraft.setScreen(new JourneyScreen(c,true)));button("设置",34+nav*3,12,nav,()->minecraft.setScreen(new AppearanceScreen(this,c)));
        if(goals){button("写个新打算",16,43,100,()->minecraft.setScreen(new JourneyEditScreen(this,c,null,true)));button(goalTrash?"返回当前打算":"已删除",124,43,100,()->{goalTrash=!goalTrash;offset=0;load();});}
        else{button("记住这一刻",16,43,86,()->c.capture(true));dateBox=new EditBox(font,110,43,Math.max(70,width-250),20,Component.literal("日期 YYYY-MM-DD"));dateBox.setValue(date);dateBox.setHint(Component.literal("YYYY-MM-DD"));dateBox.setMaxLength(10);addRenderableWidget(dateBox);button(favorite?"只看收藏":"全部经历",width-134,43,76,()->{favorite=!favorite;offset=0;load();});button("筛选",width-52,43,36,()->{date=dateBox.getValue();offset=0;load();});}
        int per=Math.max(1,(height-133)/38),start=page*per;
        for(int i=start;i<Math.min(rows.size(),start+per);i++){JsonObject row=rows.get(i).getAsJsonObject(),data=row.getAsJsonObject("data");int y=77+(i-start)*38;
            String label=CompanionConfig.get(data,"title","记录");if(goals)label=status(CompanionConfig.get(row,"status","active"))+" · "+label;
            final JsonObject selected=row;button(font.plainSubstrByWidth(label,width-115),16,y,width-100,()->{if(goals&&goalTrash)minecraft.setScreen(new ConfirmScreen(yes->{minecraft.setScreen(this);if(yes){JsonObject b=new JsonObject();b.add("id",selected.get("id"));c.request("goal-restore",b,r->{if(r.has("error"))notice=r.get("error").getAsString();else load();});}},Component.literal("恢复这个打算？"),Component.literal(CompanionConfig.get(data,"title",""))));else minecraft.setScreen(new JourneyEditScreen(this,c,selected,goals));});
            if(!goals){String id=row.get("id").getAsString();button(chosen.contains(id)?"已选":"选择",width-76,y,60,()->{if(!chosen.add(id))chosen.remove(id);drawControls();});}
        }
        int foot=(width-50)/4;button("上一页",16,height-40,foot,()->{if(page>0){page--;drawControls();}else if(offset>=60){offset-=60;load();}});
        button("下一页",22+foot,height-40,foot,()->{if((page+1)*per<rows.size()){page++;drawControls();}else if(rows.size()==60){offset+=60;load();}});
        if(!goals){button("整理选中经历",28+foot*2,height-40,foot,()->{JsonObject b=new JsonObject();JsonArray ids=new JsonArray();chosen.forEach(ids::add);b.add("ids",ids);c.request("summarize",b,r->{notice=r.has("error")?r.get("error").getAsString():"正在整理，稍后刷新查看。";});});button("导出日记",34+foot*3,height-40,foot,()->c.request("export",new JsonObject(),r->{notice=r.has("error")?r.get("error").getAsString():"已导出到 "+CompanionConfig.get(r,"path","");}));}
        button("刷新",width-72,12,56,this::load);
    }
    public void load(){JsonObject b=new JsonObject();b.addProperty("offset",offset);b.addProperty("date",date);b.addProperty("favorite",favorite);b.addProperty("goalTrash",goalTrash);c.request("list",b,r->{if(r.has("error")){notice=r.get("error").getAsString();return;}rows=r.getAsJsonArray(goals?"goals":"entries");page=0;notice=goals&&goalTrash?(rows.isEmpty()?"没有已删除的打算。":"当前存档 · 点击一个已删除的打算恢复"):rows.isEmpty()?"这里还空着，写下第一件想记住的事吧。":"当前存档 · 点击一条记录查看和编辑";if(minecraft.screen==this)drawControls();});}
    private static String localTime(String value){try{return java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));}catch(Exception e){return value;}}
    public static String status(String value){return switch(value){case "suggested"->"等你决定";case "paused"->"暂时搁置";case "done"->"已完成";case "abandoned"->"不做啦";case "deleted"->"已删除";default->"记在心上";};}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void onClose(){c.openChat();}
    @Override public void render(GuiGraphics g,int mx,int my,float p){g.fill(0,0,width,height,0xF01B2929);int per=Math.max(1,(height-133)/38),start=page*per;for(int i=start;i<Math.min(rows.size(),start+per);i++){JsonObject row=rows.get(i).getAsJsonObject();String time=localTime(CompanionConfig.get(row,goals?"updated":"created",""));g.drawString(font,font.plainSubstrByWidth(time+" · "+CompanionConfig.get(row,"dimension",""),width-40),22,100+(i-start)*38,0x91ADA0);}g.drawString(font,font.plainSubstrByWidth(notice,width-32),16,height-57,0xBCD3C6);super.render(g,mx,my,p);}
}
