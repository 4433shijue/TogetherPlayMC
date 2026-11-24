package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.*;
import net.minecraft.world.item.ItemStack;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.Consumer;

public final class CompanionClient {
    public static CompanionClient INSTANCE;
    public record Line(String speaker,String text,JsonArray sources) {}
    public final Minecraft mc=Minecraft.getInstance();
    public final CompanionConfig config;
    public final CompanionConnection connection;
    public final CompanionVoice voice;
    public final OrbMotion orb=new OrbMotion();
    public final OrbBody body=new OrbBody();
    public final OrbExpression expression=new OrbExpression();
    public JsonObject journeyState=new JsonObject();
    public boolean extended=false;
    private final Map<String,Consumer<JsonObject>> callbacks=new HashMap<>();
    private ProgressObserver progressObserver=new ProgressObserver();
    private long captureAt=0;
    private boolean captureJournal=false;
    private int lastAdvancements=-1;private boolean wasDead=false,wasSleeping=false,waitingForRecovery=false;private long sleepyNight=-1,lastHurtAt=0;private long recipeFingerprint=0;
    public final List<Line> history=new ArrayList<>();
    private final NativeChat nativeChat=new NativeChat();
    public String bubble="",world="",roleId="";
    public long bubbleUntil=0;
    public double followDistance=3;
    private long tick=0,lastActivity=0,lastSnapshot=0;
    private Vec3 lastPosition;
    private float lastYaw=0,lastHealth=20;
    private String lastDimension="",lastInventory="";
    private KnowledgeExporter exporter;
    private String lastGift="";
    private volatile long giftGeneration;
    void invalidateGift(){giftGeneration++;}
    private void pollGift(JsonObject state){
        String id=CompanionConfig.get(state,"giftWaiting","");
        if(id.isEmpty()||id.equals(lastGift)||mc.player==null)return;
        lastGift=id;long generation=giftGeneration;String here=world,owner=roleId;
        var server=mc.getSingleplayerServer();if(server==null||server.isPublished())return;
        UUID playerId=mc.player.getUUID();JsonObject payload=new JsonObject();payload.addProperty("id",id);
        request("gift-claim",payload,result->{
            if(!result.has("gift")||generation!=giftGeneration||mc.getSingleplayerServer()!=server||!world.equals(here)||!roleId.equals(owner))return;
            JsonObject g=result.getAsJsonObject("gift");String session=CompanionConfig.get(g,"session","");
            if(!connection.ownsSession(session)||!id.equals(CompanionConfig.get(g,"id",""))||!owner.equals(CompanionConfig.get(g,"role","")))return;
            var point=orb.interpolate(1);
            Runnable delivery=new Runnable(){public void run(){
                String status="unsafe";var player=server.getPlayerList().getPlayer(playerId);
                if(point!=null&&player!=null&&connection.ownsSession(session)&&generation==giftGeneration&&System.currentTimeMillis()<g.get("expires").getAsLong()){
                    try{status=OrbGift.drop(player,new Vec3(point.x(),point.y(),point.z()),g);}catch(RuntimeException ignored){status="unavailable";}
                    if(status.equals("indexing")){
                        GiftLoot.index(player.serverLevel()).thenRunAsync(this,server);return;
                    }
                }
                final String outcome=status;
                mc.execute(()->{if(!connection.ownsSession(session)||generation!=giftGeneration)return;
                    JsonObject ack=new JsonObject();ack.addProperty("id",id);ack.addProperty("status",outcome);request("gift-receipt",ack,r->{});
                });
            }};
            server.execute(delivery);
        });
    }
    public CompanionClient(Path game){INSTANCE=this;config=new CompanionConfig(game);connection=new CompanionConnection(config,e->mc.execute(()->event(e)));voice=new CompanionVoice(this);}
    private void event(JsonObject event){
        String type=CompanionConfig.get(event,"type","");JsonObject data=event.has("data")&&event.get("data").isJsonObject()?event.getAsJsonObject("data"):new JsonObject();
        if(type.equals("handshake")){
            invalidateGift();extended=data.has("capabilities")&&data.get("capabilities").toString().contains("journal");
            voice.stop();history.clear();settings(data.getAsJsonObject("role"));
            for(JsonElement row:data.getAsJsonArray("history")){JsonObject r=row.getAsJsonObject();history.add(new Line(CompanionConfig.get(r,"type","").equals("owner_chat")?"你":connection.name,CompanionConfig.get(r,"text",""),new JsonArray()));nativeChat.accept(CompanionConfig.get(r,"id",""));}
            // Restart the bounded export after a service restart; unchanged documents are deduplicated server-side.
            if(mc.getSingleplayerServer()!=null)exporter=new KnowledgeExporter(this);
        }else if(type.equals("reply")||type.equals("owner_chat")){
            if(!nativeChat.accept(CompanionConfig.get(event,"id","")))return;
            String text=CompanionConfig.get(data,"text","");history.add(new Line(type.equals("owner_chat")?"你":connection.name,text,data.has("sources")?data.getAsJsonArray("sources"):new JsonArray()));
            while(history.size()>160)history.remove(0);
            if(type.equals("reply")){bubble=text.length()>70?text.substring(0,70)+"…":text;bubbleUntil=System.currentTimeMillis()+12000;expression.trigger("responding",System.currentTimeMillis());voice.speak(text);}
            if(type.equals("owner_chat")){expression.ownerChat(text,connection.name,System.currentTimeMillis());body.attend(System.currentTimeMillis(),config.form.equals("kitten")?350:0);}
            if(mc.player!=null&&!text.isBlank())mc.gui.getChat().addMessage(type.equals("reply")?NativeChat.message(connection.name,text,config.chatNameColor,config.chatColor):NativeChat.message("你",text,"#AAAAAA","#FFFFFF"));
        }else if(type.equals("companion_cancel")){invalidateGift();voice.stop();connection.draft="";connection.progress="";}else if(type.equals("companion_progress")){connection.draft=CompanionConfig.get(data,"text","");connection.progress=CompanionConfig.get(data,"label","");}
        else if(type.equals("companion_settings")){settings(data.getAsJsonObject("role"));}
        else if(type.equals("state")){journeyState=data;pollGift(data);if(data.has("voice"))voice.configure(data.getAsJsonObject("voice"));}
        else if(type.equals("command_result")){Consumer<JsonObject> callback=callbacks.remove(CompanionConfig.get(event,"requestId",""));if(callback!=null)callback.accept(data);else if(data.has("error"))notice(data.get("error").getAsString());}
        else if(type.equals("error")||type.equals("notice")){if(type.equals("error"))expression.trigger("confused",System.currentTimeMillis());String message=CompanionConfig.get(data,"message","");if(!message.isEmpty())notice(message);}
    }
    private void settings(JsonObject role){if(role==null)return;String nextRole=CompanionConfig.get(role,"id","");if(!nextRole.equals(roleId)){invalidateGift();voice.stop();roleId=nextRole;}nativeChat.scope(world+":"+CompanionConfig.get(role,"id",""));connection.name=CompanionConfig.get(role,"name",connection.name);if(role.has("appearance"))config.appearance(role.getAsJsonObject("appearance"));config.personality(role.has("personality")?role.getAsJsonObject("personality"):null);config.chatter=CompanionConfig.get(role,"chatter",config.chatter);config.guideLevel=CompanionConfig.get(role,"guideLevel",config.guideLevel);if(role.has("followDistance"))followDistance=Math.max(2,Math.min(6,role.get("followDistance").getAsDouble()));config.save();}
    public void notice(String text){history.add(new Line("提示",text,new JsonArray()));if(mc.player!=null)mc.gui.getChat().addMessage(NativeChat.message("伙伴提示",text,"#E6C889","#E6C889"));}
    public boolean sendNativeChat(String text){
        if(!NativeChat.route(text,mc.player!=null&&mc.getSingleplayerServer()!=null&&!mc.getSingleplayerServer().isPublished(),config.paired()&&connection.enabled))return false;
        if(!connection.status.equals("陪在你身边")){notice("伙伴暂未连接："+connection.status+"。连接恢复后，请重新发送这句话。");return true;}
        voice.stop();connection.send(text.trim());return true;
    }
    public void tick(){
        tick++;if(mc.level==null||mc.player==null||mc.getSingleplayerServer()==null){if(!world.isEmpty()){invalidateGift();world="";connection.world("");orb.reset();body.reset();expression.reset();exporter=null;history.clear();nativeChat.reset();callbacks.clear();captureAt=0;journeyState=new JsonObject();}return;}
        String nextWorld=worldId();if(!world.equals(nextWorld)){world=nextWorld;orb.reset();body.reset();expression.reset();wasDead=wasSleeping=waitingForRecovery=false;sleepyNight=-1;history.clear();nativeChat.reset();callbacks.clear();progressObserver=new ProgressObserver();lastAdvancements=-1;recipeFingerprint=0;lastPosition=null;lastHealth=20;lastInventory="";lastDimension="";connection.world(world);exporter=null;}
        if(captureAt>0&&tick>=captureAt){captureAt=0;try{mc.setScreen(new PhotoScreen(this,GamePhoto.capture(mc),captureJournal));}catch(Exception e){history.add(new Line("提示","无法截取游戏画面："+e.getMessage(),new JsonArray()));openChat();}}
        if(tick%100==0)progressObserver.request(mc);
        Vec3 pos=mc.player.position();if(lastPosition==null||pos.distanceTo(lastPosition)>.01||Math.abs(mc.player.getYRot()-lastYaw)>.5){lastActivity=System.currentTimeMillis();lastPosition=pos;lastYaw=mc.player.getYRot();}
        String dim=mc.level.dimension().location().toString();
        if(!mc.isPaused())orb.tick(new OrbMotion.Point(pos.x,pos.y,pos.z),mc.player.getYRot(),dim,.05,followDistance,(p,r)->{
            r=Math.max(r,OrbRenderer.radius(config));BlockPos block=BlockPos.containing(p.x(),p.y(),p.z());return mc.level.hasChunkAt(block)&&mc.level.noCollision(new AABB(p.x()-r,p.y()-r,p.z()-r,p.x()+r,p.y()+r,p.z()+r));
        });
        if(!mc.isPaused())body.tick(orb.interpolate(1),new OrbMotion.Point(pos.x,pos.y+mc.player.getEyeHeight(),pos.z),config.reducedMotion,expression.state(System.currentTimeMillis(),connection.thinking),System.currentTimeMillis());
        if(connection.thinking&&mc.screen==null&&voice.status.isEmpty()){String preview=connection.draft.isEmpty()?connection.progress:"回复草稿："+connection.draft;mc.gui.setOverlayMessage(net.minecraft.network.chat.Component.literal(mc.font.plainSubstrByWidth(preview,mc.getWindow().getGuiScaledWidth()-50)),false);}
        boolean hurt=mc.player.getHealth()<lastHealth;
        long now=System.currentTimeMillis();boolean dead=!mc.player.isAlive(),sleeping=mc.player.isSleeping();
        if(dead&&!wasDead)expression.trigger("sad",now);else if(hurt){expression.trigger("worried",now);lastHurtAt=now;waitingForRecovery=true;}
        else if(waitingForRecovery&&!dead&&mc.player.getHealth()>lastHealth&&now-lastHurtAt>5000){expression.trigger("relieved",now);waitingForRecovery=false;}
        if(!lastDimension.isEmpty()&&!lastDimension.equals(dim))expression.trigger("surprised",now);
        long night=mc.level.getDayTime()/24000;boolean tired=mc.level.getDayTime()%24000>=13000&&now-lastActivity>90000;
        if(!dead&&(sleeping&&!wasSleeping||tired&&sleepyNight!=night)){expression.trigger("sleepy",now);sleepyNight=night;}
        wasDead=dead;wasSleeping=sleeping;
        if(System.currentTimeMillis()-lastSnapshot>=2000||hurt||!dim.equals(lastDimension)){
            connection.observe(observation(dim,hurt));lastSnapshot=System.currentTimeMillis();lastHealth=mc.player.getHealth();lastDimension=dim;
        }
        if(exporter!=null&&tick%2==0)exporter.tick();
        // Read-only diagnostics for isolated acceptance runs; never enables actions or commands.
        if(Boolean.getBoolean("together.qa")&&tick%20==0){
            JsonObject report=new JsonObject();report.addProperty("dimension",dim);report.addProperty("tick",tick);
            report.addProperty("playerX",pos.x);report.addProperty("playerY",pos.y);report.addProperty("playerZ",pos.z);
            report.addProperty("players",mc.level.players().size());report.addProperty("published",mc.getSingleplayerServer().isPublished());
            report.addProperty("connection",connection.status);report.addProperty("appearance",config.mode+":"+config.color+":"+config.color2);
            OrbMotion.Point point=orb.interpolate(1);report.addProperty("visible",point!=null);
            if(point!=null){report.addProperty("distance",pos.distanceTo(new Vec3(point.x(),point.y(),point.z())));report.addProperty("clear",mc.level.noCollision(new AABB(point.x()-.3,point.y()-.3,point.z()-.3,point.x()+.3,point.y()+.3,point.z()+.3)));}
            System.out.println("TOGETHER_QA "+report);
        }
    }
    private String worldId(){try{
        Path save=mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(save.toString().getBytes(StandardCharsets.UTF_8))).substring(0,32);
    }catch(Exception e){return "unknown-world";}}
    private JsonObject observation(String dimension,boolean hurt){
        JsonObject o=new JsonObject();o.addProperty("expression",config.face?expression.state(System.currentTimeMillis(),connection.thinking):"calm");o.addProperty("dimension",dimension);o.addProperty("worldName",mc.getSingleplayerServer().getWorldData().getLevelName());
        o.addProperty("biome",mc.level.getBiome(mc.player.blockPosition()).unwrapKey().map(k->k.location().toString()).orElse("unknown"));
        o.addProperty("health",mc.player.getHealth());o.addProperty("food",mc.player.getFoodData().getFoodLevel());o.addProperty("time",mc.level.getDayTime()%24000);
        o.addProperty("weather",mc.level.isThundering()?"雷雨":mc.level.isRaining()?"雨":"晴");o.addProperty("giftBridge",!mc.getSingleplayerServer().isPublished());o.addProperty("held",item(mc.player.getMainHandItem()));
        ItemStack held=mc.player.getMainHandItem();if(held.isDamageableItem())o.addProperty("durability",1.0-(double)held.getDamageValue()/held.getMaxDamage());else o.add("durability",JsonNull.INSTANCE);
        JsonArray nearby=new JsonArray();mc.level.getEntities(mc.player,mc.player.getBoundingBox().inflate(12),e->e instanceof net.minecraft.world.entity.LivingEntity&&e.isAlive()&&mc.player.hasLineOfSight(e)).stream().sorted(Comparator.comparingDouble(e->e.distanceToSqr(mc.player))).limit(6).forEach(e->{JsonObject entity=new JsonObject();entity.addProperty("id",e.getUUID().toString());entity.addProperty("type",BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());entity.addProperty("name",e.getName().getString());entity.addProperty("distance",e.distanceTo(mc.player));entity.addProperty("hostile",e instanceof net.minecraft.world.entity.monster.Enemy);nearby.add(entity);});o.add("nearby",nearby);
        o.addProperty("screen",mc.screen!=null);o.addProperty("combat",hurt||mc.player.hurtTime>0||mc.player.getLastHurtByMob()!=null&&mc.player.tickCount-mc.player.getLastHurtByMobTimestamp()<160);
        o.addProperty("dead",!mc.player.isAlive());o.addProperty("active",System.currentTimeMillis()-lastActivity<90000);
        JsonObject position=new JsonObject();position.addProperty("x",mc.player.getX());position.addProperty("y",mc.player.getY());position.addProperty("z",mc.player.getZ());o.add("position",position);
        String target="";if(mc.hitResult instanceof BlockHitResult hit){var block=mc.level.getBlockState(hit.getBlockPos()).getBlock();target=BuiltInRegistries.BLOCK.getKey(block)+" "+block.getName().getString();}else if(mc.hitResult instanceof EntityHitResult hit)target=BuiltInRegistries.ENTITY_TYPE.getKey(hit.getEntity().getType())+" "+hit.getEntity().getName().getString();o.addProperty("target",target);
        JsonArray inventory=new JsonArray();for(int i=0;i<mc.player.getInventory().getContainerSize();i++){ItemStack stack=mc.player.getInventory().getItem(i);if(stack.isEmpty())continue;JsonObject entry=new JsonObject();entry.addProperty("id",BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());entry.addProperty("name",stack.getHoverName().getString());entry.addProperty("count",stack.getCount());inventory.add(entry);}o.add("inventory",inventory);
        JsonArray events=new JsonArray();if(!lastDimension.isEmpty()&&!lastDimension.equals(dimension))events.add("进入了新维度 "+dimension);if(hurt)events.add("玩家刚刚受伤");
        String nowInventory=inventory.toString();if(!lastInventory.isEmpty()&&!lastInventory.equals(nowInventory))events.add("背包物品发生变化");lastInventory=nowInventory;o.add("events",events);
        JsonObject progress=QuestProgress.read(mc);o.addProperty("questProgressKnown",progress.get("known").getAsBoolean());o.add("unlockedQuests",progress.getAsJsonArray("quests"));o.add("visibleQuests",progress.getAsJsonArray("visible"));o.add("startableQuests",progress.getAsJsonArray("quests"));o.add("completedQuests",progress.getAsJsonArray("completed"));o.add("questCompletedKnown",progress.get("completedKnown"));
        JsonObject achievements=progressObserver.snapshot();if(achievements.has("recipeFingerprint")){long fingerprint=achievements.get("recipeFingerprint").getAsLong();if(recipeFingerprint!=0&&recipeFingerprint!=fingerprint){exporter=new KnowledgeExporter(this);}recipeFingerprint=fingerprint;}for(var entry:achievements.entrySet())o.add(entry.getKey(),entry.getValue());
        if(achievements.has("advancements")){int count=achievements.getAsJsonArray("advancements").size();if(lastAdvancements>=0&&count>lastAdvancements)expression.trigger("proud",System.currentTimeMillis());lastAdvancements=count;}
        return o;
    }
    public static String item(ItemStack stack){return stack.isEmpty()?"空手":BuiltInRegistries.ITEM.getKey(stack.getItem())+" "+stack.getHoverName().getString()+" ×"+stack.getCount();}
    public void cancelReply(){invalidateGift();voice.stop();connection.cancel();mc.gui.setOverlayMessage(Component.literal("已停止回复和语音"),false);}
    public void openChat(){if(mc.player!=null&&mc.getSingleplayerServer()!=null)mc.setScreen(new CompanionScreen(this));}
    public void request(String action,JsonObject args,Consumer<JsonObject> callback){
        if(!extended){JsonObject error=new JsonObject();error.addProperty("error","请更新本地服务至 0.6 后使用这个功能。");callback.accept(error);return;}
        if(!connection.status.equals("陪在你身边")){JsonObject error=new JsonObject();error.addProperty("error","伙伴未连接，请稍后重试。");callback.accept(error);return;}
        String id=UUID.randomUUID().toString();args.addProperty("action",action);args.addProperty("requestId",id);callbacks.put(id,callback);connection.command("journey",args);
    }
    public String saveAppearance(JsonObject appearance,String chatter,Consumer<JsonObject> callback){return saveAppearance(appearance,chatter,null,callback);}
    public String saveAppearance(JsonObject appearance,String chatter,JsonObject personality,Consumer<JsonObject> callback){
        if(!connection.status.equals("陪在你身边")){JsonObject error=new JsonObject();error.addProperty("error","伙伴未连接，请稍后重试。");callback.accept(error);return "";}
        String id=UUID.randomUUID().toString();JsonObject args=new JsonObject();args.add("appearance",appearance);if(personality!=null)args.add("personality",personality.deepCopy());args.addProperty("chatter",chatter);args.addProperty("roleId",roleId);args.addProperty("requestId",id);callbacks.put(id,callback);connection.command("appearance",args);return id;
    }
    public void cancelRequest(String id){callbacks.remove(id);}
    public void capture(boolean journal){if(mc.player==null||mc.getSingleplayerServer()==null)return;captureJournal=journal;expression.trigger(journal?"happy":"curious",System.currentTimeMillis());if(mc.screen instanceof CompanionScreen||mc.screen instanceof JourneyScreen||mc.screen instanceof PhotoScreen)mc.setScreen(null);captureAt=tick+2;}
}
