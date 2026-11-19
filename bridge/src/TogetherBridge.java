package togetherplay;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import com.google.gson.*;
import java.lang.reflect.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/** A version-pinned 1.20.1 bridge. Reflection uses Yarn intermediary names so no
 * remapped Minecraft distribution or Gradle download is needed to build it. */
public final class TogetherBridge implements ClientModInitializer {
  private static final Gson JSON = new Gson();
  private final Path game = FabricLoader.getInstance().getGameDir();
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(r -> { Thread t=new Thread(r,"TogetherPlay Bridge");t.setDaemon(true);return t; });
  private String lastError="";
  private static Object call(Object object,String name,Object...args)throws Exception {
    Class<?> type=object instanceof Class<?>?(Class<?>)object:object.getClass();
    for(Method m:type.getMethods())if(m.getName().equals(name)&&m.getParameterCount()==args.length){m.setAccessible(true);return m.invoke(object instanceof Class<?>?null:object,args);}
    throw new NoSuchMethodException(type.getName()+"."+name);
  }
  @Override public void onInitializeClient(){worker.scheduleWithFixedDelay(this::poll,3,2,TimeUnit.SECONDS);}
  private void poll(){
    try{
      Path file=game.resolve("config/togetherbridge.json");if(!Files.exists(file))return;
      JsonObject cfg=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
      String endpoint=cfg.get("endpoint").getAsString(),token=cfg.get("token").getAsString();URI uri=URI.create(endpoint);
      if(!"http".equals(uri.getScheme())||!"127.0.0.1".equals(uri.getHost()))throw new IllegalStateException("Bridge endpoint must be loopback");
      HttpRequest get=HttpRequest.newBuilder(uri.resolve("/bridge")).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+token).GET().build();
      HttpResponse<String> response=http.send(get,HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=200)return;
      JsonObject control=JsonParser.parseString(response.body()).getAsJsonObject();if(!control.get("enabled").getAsBoolean())return;
      Object client=call(Class.forName("net.minecraft.class_310"),"method_1551");
      CompletableFuture<JsonObject> pending=new CompletableFuture<>();
      ((Executor)client).execute(()->{try{
        Object server=call(client,"method_1576");if(server==null){JsonObject empty=new JsonObject();empty.addProperty("online",false);pending.complete(empty);return;}
        String owner=(String)call(call(client,"method_1548"),"method_1676");
        ((Executor)server).execute(()->{try{pending.complete(inspect(server,owner));}catch(Exception e){pending.completeExceptionally(e);}});
      }catch(Exception e){pending.completeExceptionally(e);}});
      JsonObject state=pending.get(8,TimeUnit.SECONDS);
      HttpRequest post=HttpRequest.newBuilder(uri.resolve("/bridge")).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(JSON.toJson(state))).build();
      http.send(post,HttpResponse.BodyHandlers.discarding());lastError="";
    }catch(Exception e){String message=e.getClass().getSimpleName()+": "+e.getMessage();if(!message.equals(lastError)){System.err.println("[TogetherPlay] "+message);lastError=message;}}
  }
  private JsonObject inspect(Object server,String owner)throws Exception {
    Object root=Class.forName("net.minecraft.class_5218").getField("field_24188").get(null);
    Path world=((Path)call(server,"method_27050",root)).toAbsolutePath().normalize();
    Path saves=game.resolve("saves").toAbsolutePath().normalize();if(!world.startsWith(saves))throw new IllegalStateException("World outside managed saves");
    Path idFile=world.resolve("together-world-id.txt");String id;
    if(Files.exists(idFile))id=Files.readString(idFile).trim();else{id=UUID.randomUUID().toString();Files.writeString(idFile,id,StandardOpenOption.CREATE_NEW);}
    boolean practice=Files.exists(world.resolve("together-practice.json"))&&world.getFileName().toString().startsWith("TogetherPractice-");
    if(practice&&!Files.exists(world.resolve("together-practice-ready.txt"))){
      String[] names=(String[])call(server,"method_3858");if(names.length==0){JsonObject waiting=new JsonObject();waiting.addProperty("online",false);return waiting;}
      setupPractice(server,owner);
      if(isSurvivalPractice(world))setupSurvivalPractice(server);
      Files.writeString(world.resolve("together-practice-ready.txt"),"1",StandardOpenOption.CREATE_NEW);
    }
    if(practice&&isSurvivalPractice(world))survivalFixtureStep(server,world);
    int port=((Number)call(server,"method_3756")).intValue();
    if(port<=0){int chosen;try(java.net.ServerSocket socket=new java.net.ServerSocket(0,0,InetAddress.getLoopbackAddress())){chosen=socket.getLocalPort();}
      Object mode=call(server,"method_3790"),properties=call(server,"method_27728");boolean cheats=(Boolean)call(properties,"method_194");
      if(!(Boolean)call(server,"method_3763",mode,cheats,chosen))throw new IllegalStateException("Could not open LAN");port=chosen;
    }
    JsonObject state=new JsonObject();state.addProperty("online",true);state.addProperty("world",(practice?"practice:":"world:")+id);state.addProperty("worldName",world.getFileName().toString());state.addProperty("owner",owner);state.addProperty("port",port);state.addProperty("practice",practice);return state;
  }
  private boolean isSurvivalPractice(Path world)throws Exception {
    JsonObject tag=JsonParser.parseString(Files.readString(world.resolve("together-practice.json"))).getAsJsonObject();
    return tag.has("suite")&&"survival-v04".equals(tag.get("suite").getAsString());
  }
  private void fixtureCommands(Object server,String...commands)throws Exception {
    Object manager=call(server,"method_3734"),source=call(server,"method_3739");
    for(String command:commands)call(manager,"method_44252",source,command);
  }
  private void setupSurvivalPractice(Object server)throws Exception {
    fixtureCommands(server,
      "fill 12 59 0 17 59 5 minecraft:stone","fill 12 60 0 17 63 5 minecraft:water",
      "fill -7 69 3 -3 71 7 minecraft:oak_leaves[persistent=true]","fill -6 72 4 -4 72 6 minecraft:oak_leaves[persistent=true]","fill -5 64 5 -5 71 5 minecraft:oak_log",
      "fill -12 64 -10 -3 67 -6 minecraft:stone","setblock -5 65 -8 minecraft:coal_ore",
      "setblock -4 65 -9 minecraft:lava",
      "setblock 0 64 5 minecraft:chest",
      "data merge block 0 64 5 {Items:[{Slot:0b,id:\"minecraft:oak_log\",Count:16b},{Slot:1b,id:\"minecraft:dirt\",Count:16b},{Slot:2b,id:\"minecraft:coal\",Count:16b},{Slot:3b,id:\"minecraft:bread\",Count:16b},{Slot:4b,id:\"minecraft:iron_sword\",Count:1b},{Slot:5b,id:\"minecraft:shield\",Count:1b}]}"
    );
  }
  // Fixed fixtures are accepted only in an explicitly tagged, separate practice
  // save. No command text, coordinates or selectors are accepted from files.
  private void survivalFixtureStep(Object server,Path world)throws Exception {
    Path request=world.resolve("together-survival-step.json");if(!Files.exists(request))return;
    String step=JsonParser.parseString(Files.readString(request)).getAsJsonObject().get("step").getAsString();
    Files.delete(request);
    switch(step){
      case "drop":fixtureCommands(server,"kill @e[type=minecraft:item,tag=together_water_loot]","summon minecraft:item 14.5 60.3 2.5 {Item:{id:\"minecraft:diamond\",Count:3b},PickupDelay:0s,Tags:[\"together_water_loot\"]}");break;
      case "husk":fixtureCommands(server,"kill @e[tag=together_combat_fixture]","summon minecraft:husk 25 64 10 {PersistenceRequired:1b,Tags:[\"together_combat_fixture\"]}");break;
      case "skeleton":fixtureCommands(server,"kill @e[tag=together_combat_fixture]","summon minecraft:skeleton 25 64 10 {PersistenceRequired:1b,ArmorItems:[{},{},{},{id:\"minecraft:iron_helmet\",Count:1b}],HandItems:[{id:\"minecraft:bow\",Count:1b},{}],Tags:[\"together_combat_fixture\"]}");break;
      case "creeper":fixtureCommands(server,"kill @e[tag=together_combat_fixture]","summon minecraft:creeper 25 64 10 {PersistenceRequired:1b,Tags:[\"together_combat_fixture\"]}");break;
      case "clear":fixtureCommands(server,"kill @e[tag=together_combat_fixture]");break;
      default:throw new IllegalArgumentException("Unknown survival fixture step");
    }
    Files.writeString(world.resolve("together-survival-step-done.txt"),step);
  }
  private void setupPractice(Object server,String owner)throws Exception {
    Object manager=call(server,"method_3734"),source=call(server,"method_3739");
    String[] commands={"forceload add -16 -16 32 32","fill -16 63 -16 32 63 32 minecraft:grass_block","fill -16 64 -16 32 75 32 minecraft:air","setworldspawn 0 64 0","tp "+owner+" 0 64 0","gamemode survival "+owner,"difficulty easy","time set day","gamerule doDaylightCycle false","gamerule doMobSpawning false","gamerule spawnRadius 0","gamerule sendCommandFeedback false","fill 5 64 0 5 67 0 minecraft:oak_log","fill 7 64 0 7 67 0 minecraft:oak_log","fill 9 64 0 9 67 0 minecraft:oak_log","fill 5 63 5 8 63 8 minecraft:stone","setblock 2 64 5 minecraft:chest","setblock 3 64 5 minecraft:furnace","setblock 4 64 5 minecraft:crafting_table","setblock 1 63 8 minecraft:water","fill 2 63 7 4 63 9 minecraft:farmland[moisture=7]","fill 2 64 7 4 64 9 minecraft:wheat[age=7]"};
    call(manager,"method_44252",source,"fill -16 60 -16 32 60 32 minecraft:bedrock");
    call(manager,"method_44252",source,"fill -16 61 -16 32 62 32 minecraft:dirt");
    for(String command:commands)call(manager,"method_44252",source,command);
    call(manager,"method_44252",source,"data merge block 2 64 5 {Items:[{Slot:0b,id:\"minecraft:wooden_pickaxe\",Count:1b},{Slot:1b,id:\"minecraft:coal\",Count:8b},{Slot:2b,id:\"minecraft:raw_iron\",Count:8b},{Slot:3b,id:\"minecraft:oak_planks\",Count:64b},{Slot:4b,id:\"minecraft:oak_planks\",Count:64b},{Slot:5b,id:\"minecraft:oak_planks\",Count:64b},{Slot:6b,id:\"minecraft:stone_hoe\",Count:1b},{Slot:7b,id:\"minecraft:bread\",Count:8b},{Slot:8b,id:\"minecraft:iron_sword\",Count:1b},{Slot:9b,id:\"minecraft:wheat_seeds\",Count:32b}]}" );
    // A stationary, non-burning practice target is far from the initial lesson.
    call(manager,"method_44252",source,"summon minecraft:husk 24 64 -6 {NoAI:1b,PersistenceRequired:1b,Silent:1b,Tags:[\"together_practice_target\"]}");
  }
}
