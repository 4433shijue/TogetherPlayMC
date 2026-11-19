package togetherplay.companion.forge;
import net.minecraft.client.Minecraft;
import net.minecraft.client.KeyMapping;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.event.RenderLevelStageEvent;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.client.event.ClientChatEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.lwjgl.glfw.GLFW;
import togetherplay.companion.*;
final class ClientHooks {
    static CompanionClient companion;
    static final KeyMapping CHAT=new KeyMapping("key.together_companion.chat",GLFW.GLFW_KEY_F8,"key.categories.together_companion");
    static final KeyMapping PHOTO=new KeyMapping("key.together_companion.photo",GLFW.GLFW_KEY_F9,"key.categories.together_companion");
    static final KeyMapping VOICE=new KeyMapping("key.together_companion.voice",GLFW.GLFW_KEY_F6,"key.categories.together_companion");
    static final KeyMapping STOP_VOICE=new KeyMapping("key.together_companion.stop_voice",GLFW.GLFW_KEY_F7,"key.categories.together_companion");
    static void register(){
        FMLJavaModLoadingContext.get().getModEventBus().addListener(ClientHooks::keys);
        MinecraftForge.EVENT_BUS.addListener(ClientHooks::tick);MinecraftForge.EVENT_BUS.addListener(ClientHooks::render);
        MinecraftForge.EVENT_BUS.addListener(ClientHooks::screenKey);
        MinecraftForge.EVENT_BUS.addListener(ClientHooks::chat);
    }
    static void keys(RegisterKeyMappingsEvent event){event.register(CHAT);event.register(PHOTO);event.register(VOICE);event.register(STOP_VOICE);}
    static void chat(ClientChatEvent event){if(companion!=null&&companion.sendNativeChat(event.getMessage()))event.setCanceled(true);}
    static void screenKey(ScreenEvent.KeyPressed.Post event){if(companion==null)return;if(PHOTO.matches(event.getKeyCode(),event.getScanCode()))companion.capture(false);if(STOP_VOICE.matches(event.getKeyCode(),event.getScanCode()))companion.cancelReply();}
    static void tick(TickEvent.ClientTickEvent event){if(event.phase!=TickEvent.Phase.END)return;if(companion==null)companion=new CompanionClient(Minecraft.getInstance().gameDirectory.toPath());companion.tick();companion.voice.tick(VOICE.isDown(),STOP_VOICE.consumeClick());while(VOICE.consumeClick()){}while(CHAT.consumeClick())companion.openChat();while(PHOTO.consumeClick())companion.capture(false);}
    static void render(RenderLevelStageEvent event){if(event.getStage()==RenderLevelStageEvent.Stage.AFTER_PARTICLES&&companion!=null)OrbRenderer.render(event.getPoseStack(),event.getCamera(),event.getPartialTick());}
}
