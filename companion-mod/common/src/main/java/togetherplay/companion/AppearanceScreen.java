package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.*;

public final class AppearanceScreen extends Screen {
    private final Screen parent;private final CompanionClient c;private final JsonObject draft,personality;private MultiLineEditBox personalityEditor;private final String owner;
    private String error="",chatter,requestId="";private int page=0,section=0,slice=0,expression=0,view=0;private boolean cave=false;private boolean saving=false;private long saveStarted;
    private final List<EditBox> fields=new ArrayList<>();private JsonArray keepsakes=new JsonArray();private String keepsakeStatus="正在看看我们留下的纪念…";
    private static final List<OrbFace.Face> EXPRESSIONS=OrbFace.all();
    private static final String[] COLORS={"color","color2","coreColor","accentColor","accessoryColor","eyeColor","muzzleColor","innerEarColor","noseColor","markingColor","markingColor2"},LABELS={"身体 / 顶部","渐变底部","光芯 / 卫星","耳朵 / 星环","饰品","表情颜色","口鼻毛色","内耳 / 肉垫","鼻尖","花纹一","花纹二"};
    public AppearanceScreen(Screen parent,CompanionClient c){super(Component.literal("伙伴设置"));this.parent=parent;this.c=c;draft=c.config.appearance();personality=c.config.personality();owner=c.roleId;chatter=c.config.chatter;}
    private int left(){return Math.max(12,(width-460)/2);}private int span(){return Math.min(460,width-24);}private int controls(){return (int)(span()*.57);}
    private String value(String key){return CompanionConfig.get(draft,key,"");}private boolean flag(String key){return draft.has(key)&&draft.get(key).getAsBoolean();}
    private Button button(String label,int x,int y,int w,Runnable action){Button b=Button.builder(Component.literal(label),ignored->action.run()).bounds(x,y,w,20).build();addRenderableWidget(b);return b;}
    private void rebuild(){clearWidgets();init();}
    private void toggle(String key){draft.addProperty(key,!flag(key));rebuild();}
    private void cycle(String key,String[] values){int i=Arrays.asList(values).indexOf(value(key));draft.addProperty(key,values[(i+1)%values.length]);rebuild();}
    @Override protected void init(){
        if(personalityEditor!=null){personality.addProperty("custom",personalityEditor.getValue());personalityEditor=null;}fields.clear();int x=left(),w=span(),cw=controls(),gap=6,half=(cw-gap)/2;
        String[] tabs={"形态","配色","装饰","性格","纪念"};for(int i=0;i<5;i++){final int index=i;Button b=button(tabs[i],x+i*(w+4)/5,43,(w-16)/5,()->{page=index;section=0;slice=0;error="";rebuild();if(page==4)loadKeepsakes();});b.active=i!=page;}
        if(page==0){
            boolean animal=value("form").equals("puppy")||value("form").equals("kitten");
            button("选择形态",x,76,animal?half:cw,()->{section=0;slice=0;rebuild();});if(animal)button(value("form").equals("puppy")?"狗狗品种":"猫咪花纹",x+half+gap,76,half,()->{section=1;slice=0;rebuild();});
            List<String[]> items=new ArrayList<>();String key=section==0||!animal?"form":value("form").equals("puppy")?"dogBreed":"coatPattern";
            if(key.equals("form"))for(var f:OrbShape.all())items.add(new String[]{f.id(),f.name()});else for(JsonElement e:OrbShape.choices(key.equals("dogBreed")?"dogBreeds":"coatPatterns")){JsonObject row=e.getAsJsonObject();items.add(new String[]{value(row,"id"),value(row,"name")});}
            int count=Math.max(2,(height-180)/24*2),start=pageStart(items.size(),count);
            for(int i=start;i<Math.min(items.size(),start+count);i++){String[] item=items.get(i);int at=i-start;button((value(key).equals(item[0])?"✓ ":"")+item[1],x+(at%2)*(half+gap),104+(at/2)*24,half,()->{draft.addProperty(key,item[0]);rebuild();});}
            pager(items.size(),count,x,cw);
        }else if(page==1){
            String[] names={"基础颜色","动物细节","毛色预设"};for(int i=0;i<3;i++){final int n=i;Button b=button(names[i],x+i*(cw+3)/3,76,(cw-6)/3,()->{section=n;slice=0;rebuild();});b.active=i!=section;}
            if(section<2){int first=section==0?0:6,length=section==0?6:5,count=Math.max(2,(height-188)/34*2),start=pageStart(length,count);
                for(int i=start;i<Math.min(length,start+count);i++){String key=COLORS[first+i];int at=i-start;EditBox box=new EditBox(font,x+(at%2)*(half+gap),114+(at/2)*34,half,18,Component.literal(LABELS[first+i]+" #RRGGBB"));box.setMaxLength(7);box.setValue(value(key));box.setResponder(v->draft.addProperty(key,v));box.setEditable(!key.equals("eyeColor")||!flag("autoEyeColor"));fields.add(box);addRenderableWidget(box);}pager(length,count,x,cw);
            }else{
                List<JsonObject> options=new ArrayList<>();if(value("form").equals("kitten")){for(JsonElement e:OrbShape.choices("catCoats"))options.add(e.getAsJsonObject());}
                else {JsonObject recommended=new JsonObject();OrbShape.Form f=OrbShape.get(CompanionConfig.preview(draft));recommended.addProperty("name",f.name()+"推荐");recommended.add("palette",f.palette());options.add(recommended);if(value("form").equals("puppy"))for(JsonElement e:OrbShape.choices("dogPalettes"))options.add(e.getAsJsonObject());}
                int count=Math.max(1,(height-180)/24),start=pageStart(options.size(),count);for(int i=start;i<Math.min(options.size(),start+count);i++){JsonObject choice=options.get(i);button("采用："+value(choice,"name"),x,104+(i-start)*24,cw,()->{for(var e:choice.getAsJsonObject("palette").entrySet())if(!List.of("accessoryColor","eyeColor","autoEyeColor").contains(e.getKey()))draft.add(e.getKey(),e.getValue().deepCopy());if(choice.has("pattern"))draft.add("coatPattern",choice.get("pattern"));error="已采用毛色，饰品与表情色保留。";rebuild();});}pager(options.size(),count,x,cw);
            }
        }else if(page==2){
            String[] earIds={"preset","none","floppy","round","pointed"},earNames={"随形态","不戴耳朵","垂耳","圆耳","立耳"},accIds={"none","scarf","hat","flower"},accNames={"不戴饰品","小围巾","毛线帽","头顶小花"};
            String[] labels={"耳朵："+earNames[Math.max(0,Arrays.asList(earIds).indexOf(value("ears")))],"饰品："+accNames[Math.max(0,Arrays.asList(accIds).indexOf(value("accessory")))],"表情："+(flag("face")?"开":"关"),"柔软形变："+(flag("softBody")?"开":"关"),"减少动画："+(flag("reducedMotion")?"开":"关"),"表情自动色："+(flag("autoEyeColor")?"开":"关"),"主动说话："+(chatter.equals("quiet")?"关":"开"),value("mode").equals("solid")?"纯色":"双色渐变","聊天文字配色"};
            Runnable[] actions={()->cycle("ears",earIds),()->cycle("accessory",accIds),()->toggle("face"),()->toggle("softBody"),()->toggle("reducedMotion"),()->toggle("autoEyeColor"),()->{chatter=chatter.equals("quiet")?"natural":"quiet";rebuild();},()->cycle("mode",new String[]{"solid","gradient"}),()->minecraft.setScreen(new ChatAppearanceScreen(this,c))};
            int count=Math.max(2,(height-154)/24*2),start=pageStart(labels.length,count);for(int i=start;i<Math.min(labels.length,start+count);i++){int at=i-start;button(labels[i],x+(at%2)*(half+gap),78+(at/2)*24,half,actions[i]);}pager(labels.length,count,x,cw);
        }else if(page==3){
            JsonArray modes=OrbShape.choices("personalityModes");for(int i=0;i<modes.size();i++){JsonObject m=modes.get(i).getAsJsonObject();String id=value(m,"id");Button b=button(value(m,"name"),x+i*(cw+3)/3,76,(cw-6)/3,()->{personality.addProperty("mode",id);slice=0;error="";rebuild();});b.active=!id.equals(value(personality,"mode"));}
            if(value(personality,"mode").equals("form")){
                List<JsonObject> options=new ArrayList<>();JsonObject auto=new JsonObject();auto.addProperty("id","auto");auto.addProperty("name","随当前形态");auto.addProperty("summary","经典小球沿用角色人设，其余形态使用对应性格。");options.add(auto);for(JsonElement e:OrbShape.choices("personalityPresets"))options.add(e.getAsJsonObject());
                int count=Math.max(2,(height-186)/24*2),start=pageStart(options.size(),count);for(int i=start;i<Math.min(options.size(),start+count);i++){JsonObject option=options.get(i);String id=value(option,"id");int at=i-start;Button b=button((id.equals(value(personality,"preset"))?"✓ ":"")+value(option,"name"),x+(at%2)*(half+gap),104+(at/2)*24,half,()->{personality.addProperty("preset",id);rebuild();});b.setTooltip(Tooltip.create(Component.literal(value(option,"summary")+(option.has("example")?"\n口吻示例："+value(option,"example"):""))));}pager(options.size(),count,x,cw);
            }else if(value(personality,"mode").equals("custom")){
                personalityEditor=new MultiLineEditBox(font,x,108,cw,Math.max(36,height-180),Component.literal("补充性格与说话习惯…"),Component.literal("自定义性格"));personalityEditor.setCharacterLimit(2000);personalityEditor.setValue(value(personality,"custom"));addRenderableWidget(personalityEditor);
            }else button("采用当前形态性格",x,height-96,cw,()->{personality.addProperty("mode","form");personality.addProperty("preset","auto");rebuild();});
        }else{
            int count=Math.max(1,(height-180)/36),start=pageStart(keepsakes.size(),count);for(int i=start;i<Math.min(keepsakes.size(),start+count);i++){JsonObject k=keepsakes.get(i).getAsJsonObject();String id=CompanionConfig.get(k,"id",""),accessory=id.equals("home")?"scarf":id.equals("snow")?"hat":"flower";button("戴上"+CompanionConfig.get(k,"label","纪念品"),x,100+(i-start)*36,cw,()->{draft.addProperty("accessory",accessory);error="已试戴，保存后生效。";});}pager(keepsakes.size(),count,x,cw);button("刷新纪念",x+w-100,14,100,this::loadKeepsakes);
        }
        int px=x+cw+12,pw=w-cw-12;
        button("视角："+new String[]{"正面","侧面","背面"}[view],px,height-118,pw,()->{view=(view+1)%3;rebuild();});
        button(cave?"光线：洞穴":"光线：白天",px,height-92,pw,()->{cave=!cave;rebuild();});
        button("预览："+EXPRESSIONS.get(expression).label(),px,height-66,pw,()->{expression=(expression+1)%EXPRESSIONS.size();rebuild();});
        button(saving?"正在保存…":"保存",x,height-29,(w-6)/2,this::save);button("返回",x+(w+6)/2,height-29,(w-6)/2,this::onClose);
        if(saving)for(var child:children())if(child instanceof AbstractWidget widget)widget.active=false;
    }
    private static String value(JsonObject o,String k){return CompanionConfig.get(o,k,"");}
    private int pageStart(int length,int count){slice=Math.max(0,Math.min(slice,Math.max(0,(length-1)/count)));return slice*count;}
    private void pager(int length,int count,int x,int w){if(length<=count)return;int pages=(length+count-1)/count;button("上一页",x,height-72,(w-6)/2,()->{slice=(slice+pages-1)%pages;rebuild();});button((slice+1)+"/"+pages+" 下一页",x+(w+6)/2,height-72,(w-6)/2,()->{slice=(slice+1)%pages;rebuild();});}
    private void loadKeepsakes(){keepsakeStatus="正在读取…";c.request("keepsakes",new JsonObject(),result->{if(!owner.equals(c.roleId))return;if(result.has("error"))keepsakeStatus=result.get("error").getAsString();else{keepsakes=result.getAsJsonArray("keepsakes");keepsakeStatus=keepsakes.isEmpty()?"还没有记录，慢慢玩就好。":"一起经历过的小事";}if(minecraft.screen==this)rebuild();});}
    private void save(){
        if(saving)return;if(personalityEditor!=null)personality.addProperty("custom",personalityEditor.getValue());if(value(personality,"mode").equals("custom")&&value(personality,"custom").isBlank()){error="请先填写自定义性格。";return;}if(!owner.equals(c.roleId)){error="伙伴已切换，请重新打开外观设置。";return;}
        for(String key:COLORS)if(!value(key).matches("#[a-fA-F0-9]{6}")){error="请输入完整的 #RRGGBB 色值。";return;}
        JsonObject a=draft.deepCopy();a.remove("chatColor");a.remove("chatNameColor");saving=true;saveStarted=System.currentTimeMillis();rebuild();
        requestId=c.saveAppearance(a,chatter,personality,result->{saving=false;if(result.has("error")){error=result.get("error").getAsString();if(minecraft.screen==this)rebuild();return;}
            JsonObject savedRole=result.getAsJsonObject("role");if(!savedRole.has("personality")){error="请更新本地服务至 0.12 后保存性格。";if(minecraft.screen==this)rebuild();return;}JsonObject saved=savedRole.getAsJsonObject("appearance");if(!saved.has("dogBreed")){error="请更新本地服务至 0.11 后保存新形态。";if(minecraft.screen==this)rebuild();return;}
            if(owner.equals(c.roleId)){c.config.appearance(saved);c.config.personality(savedRole.getAsJsonObject("personality"));c.config.chatter=chatter;c.config.save();}if(minecraft.screen==this)minecraft.setScreen(parent);
        });
    }
    @Override public void tick(){for(EditBox field:fields)GameVersion.tick(field);if(saving&&System.currentTimeMillis()-saveStarted>8000){saving=false;c.cancelRequest(requestId);error="保存尚未确认，请检查连接后重试。";rebuild();}}
    @Override public void render(GuiGraphics g,int mx,int my,float pt){
        g.fill(0,0,width,height,0xF01B2929);int x=left(),cw=controls(),pw=span()-cw-12,px=x+cw+12;g.drawString(font,title,x,18,0xB8E8D2);
        if(page==1&&section<2){int first=section==0?0:6,length=section==0?6:5,count=Math.max(2,(height-188)/34*2),start=slice*count;for(int i=start;i<Math.min(length,start+count);i++){int at=i-start;g.drawString(font,LABELS[first+i],x+(at%2)*((cw-6)/2+6),104+(at/2)*34,0xDDE8E0);}}
        if(page==4)g.drawString(font,font.plainSubstrByWidth(keepsakeStatus,cw),x,77,0xDDE8E0);
        if(page==3&&value(personality,"mode").equals("role"))g.drawWordWrap(font,Component.literal("继续使用角色人设。采用形态性格时，名字、关系和共同记忆仍会保留。"),x,108,cw,0xDDE8E0);
        if(page==3&&value(personality,"mode").equals("custom"))g.drawString(font,"最多 2000 字符，保留原有人设。",x,99,0xDDE8E0);
        CompanionConfig preview=CompanionConfig.preview(draft);int cy=(82+height-124)/2;double radius=Math.max(7,Math.min(pw/3.6,(height-206)/3.6));
        OrbPreview.draw(g,px+pw/2.0,cy,radius,preview,EXPRESSIONS.get(expression).id(),System.currentTimeMillis(),new double[]{0,.85,Math.PI}[view],cave?.12:1);
        g.drawCenteredString(font,OrbShape.get(preview).name(),px+pw/2,68,0xDDE8E0);
        String hint=error.isEmpty()?(page==1?"色值可自由输入；表情自动色在装饰页关闭。":page==4?"饰品都能随时穿戴，不需要解锁。":page==3?"口癖偶尔使用；认真交流时优先说清楚。":"换形态、品种保留配色；毛色预设在配色页。"):error;
        g.drawString(font,font.plainSubstrByWidth(hint,span()),x,height-42,error.isEmpty()?0xAABCB3:0xFFD2A0);super.render(g,mx,my,pt);
    }
    @Override public boolean isPauseScreen(){return false;}
    @Override public void onClose(){if(!saving)minecraft.setScreen(parent);}
}
