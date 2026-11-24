package togetherplay.companion;
import com.google.gson.*;
import com.mojang.blaze3d.vertex.*;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.*;
import net.minecraft.world.item.crafting.*;
import org.joml.Matrix4f;

final class GameVersion {
    static final String LOOT_DIRECTORY="loot_tables";
    record Entry(ResourceLocation id, Recipe<?> recipe, Predicate<ServerPlayer> learned) {}
    static List<Entry> recipes(RecipeManager m) {
        return m.getRecipes().stream().map(r -> new Entry(r.getId(), r, p -> p.getRecipeBook().contains(r))).toList();
    }
    static List<Component> tooltip(ItemStack stack, Player player) {
        return stack.getTooltipLines(player, TooltipFlag.Default.NORMAL);
    }
    static ResourceLocation id(String ns,String key){return new ResourceLocation(ns,key);}
    static boolean same(ItemStack a,ItemStack b){return ItemStack.isSameItemSameTags(a,b);}
    static void tick(EditBox box){box.tick();}
    static BufferBuilder triangles(){
        BufferBuilder b=Tesselator.getInstance().getBuilder(); b.begin(VertexFormat.Mode.TRIANGLES,DefaultVertexFormat.POSITION_COLOR); return b;
    }
    static void vertex(BufferBuilder b,Matrix4f m,float x,float y,float z,int r,int g,int blue,int alpha){
        b.vertex(m,x,y,z).color(r,g,blue,alpha).endVertex();
    }
    static void draw(BufferBuilder b){BufferUploader.drawWithShader(b.end());}
    static void completed(MinecraftServer server,ServerPlayer player,JsonArray result){
        for(var a:server.getAdvancements().getAllAdvancements()){
            var display=a.getDisplay();
            if(display==null||!player.getAdvancements().getOrStartProgress(a).isDone())continue;
            JsonObject value=new JsonObject();value.addProperty("id",a.getId().toString());value.addProperty("title",display.getTitle().getString());result.add(value);
        }
    }
}
