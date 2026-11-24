package togetherplay.companion.fabric;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
final class FabricFrames {
    static float partial(WorldRenderContext context){return context.tickDelta();}
}
