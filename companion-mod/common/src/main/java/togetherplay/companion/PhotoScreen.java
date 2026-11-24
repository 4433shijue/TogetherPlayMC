package togetherplay.companion;
import com.google.gson.*;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import java.io.ByteArrayInputStream;
import java.util.Base64;

public final class PhotoScreen extends Screen {
    private final CompanionClient c;private final byte[] bytes;private final boolean journal;
    private ResourceLocation texture;private int photoWidth=1,photoHeight=1;private EditBox input,mood;private String draft="",moodDraft="",error="",mediaId="";private boolean busy=false,saved=false,sent=false;
    public PhotoScreen(CompanionClient c,byte[] bytes,boolean journal){super(Component.literal(journal?"记住这一刻":"让他看看"));this.c=c;this.bytes=bytes;this.journal=journal;}
    public void useSaved(String id){mediaId=id;saved=true;}
    @Override protected void init(){
        if(input!=null)draft=input.getValue();if(mood!=null)moodDraft=mood.getValue();
        try{if(texture==null){NativeImage image=NativeImage.read(new ByteArrayInputStream(bytes));photoWidth=image.getWidth();photoHeight=image.getHeight();texture=minecraft.getTextureManager().register("together_photo",new DynamicTexture(image));}}catch(Exception e){error="照片预览失败。";}
        input=new EditBox(font,20,height-70,journal?(width-48)*2/3:width-40,20,Component.literal(journal?"可选标题":"想问他什么"));input.setMaxLength(2000);input.setValue(draft);input.setHint(Component.literal(journal?"这一刻，想起什么？":"帮我看看这个建筑 / 界面…"));addRenderableWidget(input);setInitialFocus(input);
        if(journal){int left=28+(width-48)*2/3;mood=new EditBox(font,left,height-70,width-left-20,20,Component.literal("可选心情"));mood.setMaxLength(80);mood.setValue(moodDraft);mood.setHint(Component.literal("心情（可选）"));addRenderableWidget(mood);}
        int cell=(width-58)/4;
        addRenderableWidget(Button.builder(Component.literal(journal?"保存到日记":"发送图片"),b->submit()).bounds(20,height-39,cell,20).build());
        addRenderableWidget(Button.builder(Component.literal("重拍"),b->{if(!busy){discard();c.capture(journal);}}).bounds(26+cell,height-39,cell,20).build());
        if(!journal)addRenderableWidget(Button.builder(Component.literal("只保存留念"),b->{if(!busy)upload(true);}).bounds(32+cell*2,height-39,cell,20).build());
        addRenderableWidget(Button.builder(Component.literal("取消"),b->onClose()).bounds(38+cell*3,height-39,cell,20).build());
    }
    private void submit(){if(busy)return;if(!journal&&input.getValue().trim().isEmpty()){error="写一句想让他看的问题。";return;}upload(journal);}
    private void upload(boolean keep){busy=true;error="正在处理照片…";if(!mediaId.isEmpty()){finish(keep);return;}JsonObject b=new JsonObject();b.addProperty("data",Base64.getEncoder().encodeToString(bytes));c.request("photo",b,result->{if(result.has("error")){busy=false;error=result.get("error").getAsString();return;}mediaId=result.get("id").getAsString();finish(keep);});}
    private void finish(boolean keep){
        if(keep){JsonObject b=new JsonObject();b.addProperty("title",input.getValue().isBlank()?"一起记住这一刻":input.getValue());b.addProperty("mediaId",mediaId);b.addProperty("mood",mood==null?"":mood.getValue());c.request("journal-save",b,result->{busy=false;if(result.has("error")){error=result.get("error").getAsString();return;}saved=true;c.expression.trigger("happy",System.currentTimeMillis());if(minecraft.screen==this)minecraft.setScreen(new JourneyScreen(c,false));});}
        else{sent=true;c.connection.send(input.getValue(),mediaId);busy=false;if(minecraft.screen==this)c.openChat();}
    }
    private void discard(){if(!mediaId.isEmpty()&&!saved&&!sent){JsonObject b=new JsonObject();b.addProperty("id",mediaId);c.request("discard",b,r->{});mediaId="";}}
    @Override public void onClose(){if(busy){error="正在保存，请稍等片刻。";return;}discard();c.openChat();}
    @Override public void removed(){if(texture!=null){minecraft.getTextureManager().release(texture);texture=null;}}
    @Override public boolean isPauseScreen(){return false;}
    @Override public void tick(){GameVersion.tick(input);}
    @Override public void render(GuiGraphics g,int mx,int my,float partial){g.fill(0,0,width,height,0xF01B2929);g.drawString(font,title,20,14,0xB8E8D2);g.drawString(font,journal?"只保存到本机，不会自动交给模型。":"预览后再发送，只使用这张游戏画面。",20,30,0xAABCB3);
        if(texture!=null){double scale=Math.min((width-40.0)/photoWidth,(height-125.0)/photoHeight);int w=Math.max(1,(int)(photoWidth*scale)),h=Math.max(1,(int)(photoHeight*scale));g.blit(texture,(width-w)/2,47,w,h,0,0,photoWidth,photoHeight,photoWidth,photoHeight);}
        if(!error.isEmpty())g.drawString(font,font.plainSubstrByWidth(error,width-40),20,height-86,0xF0CE9D);super.render(g,mx,my,partial);}
}
