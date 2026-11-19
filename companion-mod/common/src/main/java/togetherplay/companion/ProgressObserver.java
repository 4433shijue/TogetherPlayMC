package togetherplay.companion;
import com.google.gson.*;
import net.minecraft.client.Minecraft;
import net.minecraft.stats.Stats;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ProgressObserver {
    private volatile JsonObject last=new JsonObject();
    private final AtomicBoolean pending=new AtomicBoolean();
    public void request(Minecraft mc){var server=mc.getSingleplayerServer();if(server==null||mc.player==null||!pending.compareAndSet(false,true))return;var id=mc.player.getUUID();
        server.execute(()->{try{var player=server.getPlayerList().getPlayer(id);if(player==null)return;JsonObject data=new JsonObject();JsonArray completed=new JsonArray();
            for(var advancement:server.getAdvancements().getAllAdvancements()){if(advancement.getDisplay()==null)continue;if(player.getAdvancements().getOrStartProgress(advancement).isDone()){JsonObject a=new JsonObject();a.addProperty("id",advancement.getId().toString());a.addProperty("title",advancement.getDisplay().getTitle().getString());completed.add(a);}}
            data.addProperty("recipeFingerprint",server.getRecipeManager().getRecipes().stream().mapToLong(r->System.identityHashCode(r)).sum());data.add("advancements",completed);data.addProperty("advancementsKnown",true);data.addProperty("deathCount",player.getStats().getValue(Stats.CUSTOM.get(Stats.DEATHS)));last=data;
        }finally{pending.set(false);}});
    }
    public JsonObject snapshot(){return last.deepCopy();}
}
