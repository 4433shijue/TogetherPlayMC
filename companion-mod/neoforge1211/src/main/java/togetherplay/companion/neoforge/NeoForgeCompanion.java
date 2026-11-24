package togetherplay.companion.neoforge;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.*;
import net.neoforged.neoforge.common.NeoForge;
import org.lwjgl.glfw.GLFW;
import togetherplay.companion.CompanionClient;
import togetherplay.companion.OrbRenderer;

@Mod(value="together_companion", dist=Dist.CLIENT)
public final class NeoForgeCompanion {
    private CompanionClient companion;
    private final KeyMapping chat=key("chat",GLFW.GLFW_KEY_F8),photo=key("photo",GLFW.GLFW_KEY_F9),
        voice=key("voice",GLFW.GLFW_KEY_F6),stop=key("stop_voice",GLFW.GLFW_KEY_F7);
    private static KeyMapping key(String id,int code){return new KeyMapping("key.together_companion."+id,code,"key.categories.together_companion");}
    public NeoForgeCompanion(IEventBus modBus){
        modBus.addListener((RegisterKeyMappingsEvent e)->{e.register(chat);e.register(photo);e.register(voice);e.register(stop);});
        NeoForge.EVENT_BUS.addListener(this::tick);
        NeoForge.EVENT_BUS.addListener(this::render);
        NeoForge.EVENT_BUS.addListener(this::screenKey);
        NeoForge.EVENT_BUS.addListener(this::chat);
    }
    private void tick(ClientTickEvent.Post e){
        if(companion==null)companion=new CompanionClient(Minecraft.getInstance().gameDirectory.toPath());
        companion.tick();companion.voice.tick(voice.isDown(),stop.consumeClick());
        while(voice.consumeClick()){} while(chat.consumeClick())companion.openChat();while(photo.consumeClick())companion.capture(false);
    }
    private void render(RenderLevelStageEvent e){
        if(companion!=null&&e.getStage()==RenderLevelStageEvent.Stage.AFTER_PARTICLES)
            OrbRenderer.render(e.getPoseStack(),e.getCamera(),e.getPartialTick().getGameTimeDeltaPartialTick(false));
    }
    private void chat(ClientChatEvent e){if(companion!=null&&companion.sendNativeChat(e.getMessage()))e.setCanceled(true);}
    private void screenKey(ScreenEvent.KeyPressed.Post e){
        if(companion==null)return;
        if(photo.matches(e.getKeyCode(),e.getScanCode()))companion.capture(false);
        if(stop.matches(e.getKeyCode(),e.getScanCode()))companion.cancelReply();
    }
}
