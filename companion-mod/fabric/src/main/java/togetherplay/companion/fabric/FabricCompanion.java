package togetherplay.companion.fabric;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientSendMessageEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;
import togetherplay.companion.*;
public final class FabricCompanion implements ClientModInitializer {
    public void onInitializeClient(){
        CompanionClient companion=new CompanionClient(FabricLoader.getInstance().getGameDir());
        ClientSendMessageEvents.ALLOW_CHAT.register(message->!companion.sendNativeChat(message));
        KeyMapping chat=KeyBindingHelper.registerKeyBinding(new KeyMapping("key.together_companion.chat",GLFW.GLFW_KEY_F8,"key.categories.together_companion"));
        KeyMapping photo=KeyBindingHelper.registerKeyBinding(new KeyMapping("key.together_companion.photo",GLFW.GLFW_KEY_F9,"key.categories.together_companion"));
        KeyMapping voice=KeyBindingHelper.registerKeyBinding(new KeyMapping("key.together_companion.voice",GLFW.GLFW_KEY_F6,"key.categories.together_companion"));
        KeyMapping stop=KeyBindingHelper.registerKeyBinding(new KeyMapping("key.together_companion.stop_voice",GLFW.GLFW_KEY_F7,"key.categories.together_companion"));
        ScreenEvents.AFTER_INIT.register((mc,screen,w,h)->ScreenKeyboardEvents.afterKeyPress(screen).register((s,key,scan,mod)->{if(photo.matches(key,scan))companion.capture(false);if(stop.matches(key,scan))companion.cancelReply();}));
        ClientTickEvents.END_CLIENT_TICK.register(mc->{companion.tick();companion.voice.tick(voice.isDown(),stop.consumeClick());while(voice.consumeClick()){}while(chat.consumeClick())companion.openChat();while(photo.consumeClick())companion.capture(false);});
        WorldRenderEvents.AFTER_TRANSLUCENT.register(c->OrbRenderer.render(c.matrixStack(),c.camera(),c.tickDelta()));
    }
}
