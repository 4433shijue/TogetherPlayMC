package togetherplay.companion;

import com.google.gson.*;
import java.io.Reader;
import java.lang.ref.WeakReference;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.resources.ResourceManager;

// Loot-only mod items need positive source evidence too. Read data on a worker;
// unknown items stay unavailable until indexing completes.
final class GiftLoot {
    private static WeakReference<ResourceManager> current=new WeakReference<>(null);
    private static CompletableFuture<Set<String>> entries;
    static CompletableFuture<Set<String>> index(ServerLevel level){
        ResourceManager resources=level.getServer().getResourceManager();
        if(resources!=current.get()){current=new WeakReference<>(resources);entries=CompletableFuture.supplyAsync(()->read(resources)).exceptionally(e->Set.of());}
        return entries;
    }
    private static Set<String> read(ResourceManager manager){
        Set<String> ids=new HashSet<>();
        for(var resource:manager.listResources("loot_tables",p->p.getPath().endsWith(".json")).values()){
            try(Reader reader=resource.openAsReader()){collect(JsonParser.parseReader(reader),ids);}catch(Exception ignored){}
        }
        return ids;
    }
    private static void collect(JsonElement e,Set<String> ids){
        if(e.isJsonArray())for(JsonElement a:e.getAsJsonArray())collect(a,ids);
        if(!e.isJsonObject())return;
        JsonObject o=e.getAsJsonObject();
        if(o.has("type")&&o.get("type").isJsonPrimitive()&&"minecraft:item".equals(o.get("type").getAsString())&&o.has("name")&&o.get("name").isJsonPrimitive())ids.add(o.get("name").getAsString());
        for(String k:new String[]{"pools","entries","children"})if(o.has(k))collect(o.get(k),ids);
    }
}
