package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.*;
import net.minecraft.world.item.crafting.*;
import net.minecraft.world.level.block.Block;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** A small batch per tick. Recipes come from the integrated server after scripts/datapacks load. */
public final class KnowledgeExporter {
    private final CompanionClient owner;
    private final Iterator<Item> items=BuiltInRegistries.ITEM.iterator();
    private final Iterator<Block> blocks=BuiltInRegistries.BLOCK.iterator();
    private Iterator<GameVersion.Entry> recipes;
    private volatile boolean recipeDone=false,finished=false;
    private boolean first=true;
    private final String world;
    private final AtomicBoolean pending=new AtomicBoolean(false);
    public KnowledgeExporter(CompanionClient owner){this.owner=owner;this.world=owner.world;}
    private JsonObject doc(String id,String kind,String title,String text){JsonObject d=new JsonObject();d.addProperty("id",id);d.addProperty("kind",kind);d.addProperty("title",title);d.addProperty("text",text.length()>15000?text.substring(0,15000):text);return d;}
    private void enqueue(JsonArray docs,boolean done){if(!world.equals(owner.world))return;JsonObject batch=new JsonObject();batch.add("documents",docs);batch.addProperty("finished",done);batch.addProperty("begin",first);first=false;owner.connection.documents(batch);}
    public void tick(){
        if(finished||!owner.connection.canQueueDocuments())return;
        JsonArray docs=new JsonArray();
        for(int n=0;n<30&&items.hasNext();n++){
            Item item=items.next();try{ItemStack stack=new ItemStack(item);String id=BuiltInRegistries.ITEM.getKey(item).toString();StringBuilder text=new StringBuilder(id);for(var line:GameVersion.tooltip(stack,owner.mc.player))text.append('\n').append(line.getString());docs.add(doc("item:"+id,"item",stack.getHoverName().getString(),text.toString()));}catch(Exception ignored){}
        }
        if(!items.hasNext())for(int n=0;n<30&&blocks.hasNext();n++){Block block=blocks.next();String id=BuiltInRegistries.BLOCK.getKey(block).toString();docs.add(doc("block:"+id,"block",block.getName().getString(),id));}
        if(!docs.isEmpty())enqueue(docs,false);
        if(!items.hasNext()&&!blocks.hasNext()&&!recipeDone&&pending.compareAndSet(false,true)){
            var server=owner.mc.getSingleplayerServer();if(server==null){pending.set(false);return;}
            server.execute(()->{try{
                if(recipes==null)recipes=GameVersion.recipes(server.getRecipeManager()).iterator();JsonArray batch=new JsonArray();
                for(int n=0;n<25&&recipes.hasNext();n++){
                    var entry=recipes.next();Recipe<?> recipe=entry.recipe();try{
                        String serializer=BuiltInRegistries.RECIPE_SERIALIZER.getKey(recipe.getSerializer()).toString();ItemStack output=recipe.getResultItem(server.registryAccess());
                        JsonObject value=new JsonObject();value.addProperty("id",entry.id().toString());value.addProperty("serializer",serializer);value.add("result",stack(output));
                        JsonArray ingredients=new JsonArray();for(Ingredient ingredient:recipe.getIngredients()){JsonArray alternatives=new JsonArray();for(ItemStack option:ingredient.getItems())alternatives.add(stack(option));ingredients.add(alternatives);}value.add("ingredients",ingredients);
                        if(recipe instanceof ShapedRecipe shaped){value.addProperty("width",shaped.getWidth());value.addProperty("height",shaped.getHeight());}
                        if(recipe instanceof AbstractCookingRecipe cooking){value.addProperty("cookTicks",cooking.getCookingTime());value.addProperty("experience",cooking.getExperience());}
                        boolean standard=serializer.startsWith("minecraft:");value.addProperty("coverage",standard?"常规物品配方；材料替代项按槽位排列":"仅通用物品输入输出，机器能量、流体、阶段限制等参数未覆盖");
                        batch.add(doc("recipe:"+entry.id(),"recipe",CompanionClient.item(output)+" · "+entry.id(),value.toString()));
                    }catch(Exception e){batch.add(doc("coverage:"+entry.id(),"coverage",entry.id().toString(),"此配方不能通过通用接口读取，请查对应模组手册。"));}
                }
                recipeDone=!recipes.hasNext();enqueue(batch,recipeDone);finished=recipeDone;
            }finally{pending.set(false);}});
        }
    }
    private static JsonObject stack(ItemStack s){JsonObject o=new JsonObject();o.addProperty("id",BuiltInRegistries.ITEM.getKey(s.getItem()).toString());o.addProperty("name",s.getHoverName().getString());o.addProperty("count",s.getCount());return o;}
}
