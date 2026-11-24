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
    static final String LOOT_DIRECTORY="loot_table";
    record Entry(ResourceLocation id, Recipe<?> recipe, Predicate<ServerPlayer> learned) {}
    static List<Entry> recipes(RecipeManager m) {
        return m.getRecipes().stream().map(r -> new Entry(r.id(), r.value(), p -> p.getRecipeBook().contains(r))).toList();
    }
    static List<Component> tooltip(ItemStack stack, Player player) {
        return stack.getTooltipLines(Item.TooltipContext.of(player.level()), player, TooltipFlag.Default.NORMAL);
    }
    static ResourceLocation id(String ns,String key){return ResourceLocation.fromNamespaceAndPath(ns,key);}
    static boolean same(ItemStack a,ItemStack b){return ItemStack.isSameItemSameComponents(a,b);}
    static void tick(EditBox box){/* Cursor timing is managed by the widget. */}
    static BufferBuilder triangles(){
        return Tesselator.getInstance().begin(VertexFormat.Mode.TRIANGLES,DefaultVertexFormat.POSITION_COLOR);
    }
    static void vertex(BufferBuilder b,Matrix4f m,float x,float y,float z,int r,int g,int blue,int alpha){
        b.addVertex(m,x,y,z).setColor(r,g,blue,alpha);
    }
    static void draw(BufferBuilder b){var mesh=b.build(); if(mesh!=null)BufferUploader.drawWithShader(mesh);}
    static void completed(MinecraftServer server,ServerPlayer player,JsonArray result){
        for(var a:server.getAdvancements().getAllAdvancements()){
            var display=a.value().display().orElse(null);
            if(display==null||!player.getAdvancements().getOrStartProgress(a).isDone())continue;
            JsonObject value=new JsonObject();value.addProperty("id",a.id().toString());value.addProperty("title",display.getTitle().getString());result.add(value);
        }
    }
}
