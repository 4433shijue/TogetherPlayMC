package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.function.BiConsumer;

/** Local draft editor. Only the parent Save button persists the goal. */
public final class GoalStepsScreen extends VersionScrollScreen {
    private final Screen parent;private final JsonArray steps;private final BiConsumer<JsonArray,String> accept;
    private EditBox text;private int offset=0,selected=-1;private String reminder,error="";
    public GoalStepsScreen(Screen parent,JsonArray steps,String reminder,BiConsumer<JsonArray,String> accept){super(Component.literal("分步骤与提醒"));this.parent=parent;this.steps=steps.deepCopy();this.reminder=reminder;this.accept=accept;}
    private void button(String label,int x,int y,int w,Runnable run){addRenderableWidget(Button.builder(Component.literal(label),b->run.run()).bounds(x,y,w,20).build());}
    @Override protected void init(){
        String draft=text==null?"":text.getValue();
        text=new EditBox(font,16,46,width-32,20,Component.literal("步骤内容"));text.setMaxLength(300);text.setValue(draft);addRenderableWidget(text);
        button(selected<0?"添加步骤":"保存这一步",16,72,96,()->{if(text.getValue().trim().isEmpty())return;if(selected<0&&steps.size()>=30){error="最多 30 步";return;}JsonObject s=new JsonObject();s.addProperty("text",text.getValue().trim());s.addProperty("done",selected>=0&&steps.get(selected).getAsJsonObject().get("done").getAsBoolean());if(selected<0)steps.add(s);else steps.set(selected,s);selected=-1;text.setValue("");rebuildWidgets();});
        button("取消选择",120,72,78,()->{selected=-1;text.setValue("");rebuildWidgets();});
        button(reminder.equals("next-session")?"下次进入提醒":"安静记录",206,72,Math.max(90,width-222),()->{reminder=reminder.equals("quiet")?"next-session":"quiet";rebuildWidgets();});
        int count=Math.max(1,(height-154)/26);offset=Math.max(0,Math.min(offset,Math.max(0,steps.size()-count)));
        for(int i=offset;i<Math.min(steps.size(),offset+count);i++){final int index=i;JsonObject s=steps.get(i).getAsJsonObject();int y=102+(i-offset)*26;
            button(s.get("done").getAsBoolean()?"✓":"○",16,y,24,()->{s.addProperty("done",!s.get("done").getAsBoolean());rebuildWidgets();});
            button(font.plainSubstrByWidth(s.get("text").getAsString(),width-118),46,y,width-102,()->{selected=index;text.setValue(s.get("text").getAsString());rebuildWidgets();});
            button("删",width-48,y,32,()->{steps.remove(index);selected=-1;text.setValue("");rebuildWidgets();});
        }
        button("完成编辑",16,height-34,90,()->{accept.accept(steps,reminder);minecraft.setScreen(parent);});button("取消",114,height-34,64,this::onClose);
    }
    @Override protected boolean scrollContent(double x,double y,double delta){offset+=delta<0?1:-1;rebuildWidgets();return true;}
    @Override public void tick(){GameVersion.tick(text);}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void onClose(){minecraft.setScreen(parent);}
    @Override public void render(GuiGraphics g,int x,int y,float tick){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,16,14,0xB8E8D2);g.drawString(font,"点圆圈确认完成，点文字编辑；滚轮翻页。返回后记得保存打算。",16,31,0xAABCB3);if(!error.isEmpty())g.drawString(font,error,188,height-28,0xF0B4A5);super.render(g,x,y,tick);}
}
