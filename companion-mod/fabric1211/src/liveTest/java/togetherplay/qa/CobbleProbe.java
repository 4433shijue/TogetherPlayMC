package togetherplay.qa;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Blocks;
import togetherplay.companion.CompanionClient;
public final class CobbleProbe implements ClientModInitializer {
    private int ticks=0;private boolean sent=false;
    private double startX,startZ,orbX,orbZ,turnX,turnZ,playerTurnX,playerTurnZ;
    public void onInitializeClient(){
        if(!Boolean.getBoolean("together.liveTest"))return;
        ServerPlayConnectionEvents.JOIN.register((handler,sender,server)->{
            if(!server.isSingleplayer()||server.isPublished()||!server.getWorldData().getLevelName().equals("TogetherPlay · 独立练习场"))return;
            var p=handler.player;
            for(int x=-22;x<=22;x++)for(int z=-22;z<=22;z++)
                p.serverLevel().setBlockAndUpdate(new BlockPos(x,223,z),Blocks.STONE.defaultBlockState());
            p.connection.teleport(.5,224,.5,0,0);
        });
        ClientTickEvents.END_CLIENT_TICK.register(mc->{
            var c=CompanionClient.INSTANCE;
            if(c==null||mc.player==null||mc.getSingleplayerServer()==null||mc.getSingleplayerServer().isPublished()||!c.connection.status.equals("陪在你身边"))return;
            if(mc.screen!=null&&ticks==0)mc.setScreen(null);
            var orb=c.orb.interpolate(1);if(orb==null)return;ticks++;
            if(ticks==20){startX=mc.player.getX();startZ=mc.player.getZ();orbX=orb.x();orbZ=orb.z();mc.options.keyUp.setDown(true);}
            if(ticks==85)mc.options.keyUp.setDown(false);
            if(ticks==140)System.out.println("LIVE_FOLLOW player="+Math.hypot(mc.player.getX()-startX,mc.player.getZ()-startZ)+" orb="+Math.hypot(orb.x()-orbX,orb.z()-orbZ)+" distance="+Math.hypot(orb.x()-mc.player.getX(),orb.z()-mc.player.getZ()));
            if(ticks==145){
                turnX=orb.x();turnZ=orb.z();playerTurnX=mc.player.getX();playerTurnZ=mc.player.getZ();
                mc.player.setYRot((float)Math.toDegrees(Math.atan2(-(turnX-playerTurnX),turnZ-playerTurnZ)));
            }
            if(ticks==175)System.out.println("LIVE_TURN orb="+Math.hypot(orb.x()-turnX,orb.z()-turnZ)+" player="+Math.hypot(mc.player.getX()-playerTurnX,mc.player.getZ()-playerTurnZ));
            if(ticks>=180&&!sent&&mc.player.isAlive()&&c.journeyState.has("giftMode")&&c.journeyState.get("giftMode").getAsString().equals("role")){
                sent=true;mc.player.connection.sendChat("请送我三个精灵球");System.out.println("LIVE_NATIVE_CHAT_SENT");
            }
        });
    }
}
