package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.*;
import net.minecraft.stats.Stats;
import net.minecraft.tags.*;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.*;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.*;
import java.util.*;

// Runs on the integrated server. Only a plain item stack can cross this boundary.
final class OrbGift {
    static final TagKey<Item> ALLOW=tag("giftable"), DENY=tag("never_gift");
    private static TagKey<Item> tag(String path){return TagKey.create(Registries.ITEM,GameVersion.id("together_companion",path));}
    private static final Set<String> restricted=Set.of("air","bedrock","end_portal_frame","reinforced_deepslate","budding_amethyst","spawner","suspicious_sand","suspicious_gravel","barrier","light","structure_void","debug_stick","knowledge_book","command_block_minecart","petrified_oak_slab","bundle","player_head","frogspawn","infested_stone","infested_cobblestone","infested_stone_bricks","infested_mossy_stone_bricks","infested_cracked_stone_bricks","infested_chiseled_stone_bricks","infested_deepslate");
    static String drop(ServerPlayer player,Vec3 origin,JsonObject gift){
        ServerLevel level=player.serverLevel();
        if(player.server.isPublished()||!player.isAlive()||player.isSpectator()||player.isRemoved()||origin.distanceToSqr(player.position())>64||!level.dimension().location().toString().equals(gift.get("dimension").getAsString()))return "unsafe";
        ResourceLocation id=ResourceLocation.tryParse(gift.get("itemId").getAsString());
        Item item=id==null?null:BuiltInRegistries.ITEM.getOptional(id).orElse(null);
        if(item==null||item instanceof SpawnEggItem||item instanceof GameMasterBlockItem||item==Items.AIR||!item.isEnabled(level.enabledFeatures())||id.getNamespace().equals("minecraft")&&restricted.contains(id.getPath()))return "unavailable";
        ItemStack stack=new ItemStack(item);if(stack.is(DENY))return "unavailable";
        int count=gift.get("count").getAsInt();if(count<1||count>Math.min(64,stack.getMaxStackSize()))return "invalid";
        boolean obtained=player.getInventory().contains(stack)||player.getStats().getValue(Stats.ITEM_PICKED_UP.get(item))>0||player.getStats().getValue(Stats.ITEM_CRAFTED.get(item))>0;
        boolean source=obtained||stack.is(ALLOW),learned=false;
        if(!obtained)for(var entry:GameVersion.recipes(level.getRecipeManager())){var r=entry.recipe();
            if(r.getResultItem(level.registryAccess()).getItem()!=item)continue;
            source=true;
            // Modded machines can impose additional stage requirements not visible in a recipe.
            if(id.getNamespace().equals("minecraft")&&r.getType()==net.minecraft.world.item.crafting.RecipeType.CRAFTING&&entry.learned().test(player))learned=true;
            if(learned||!gift.get("mode").getAsString().equals("progress"))break;
        }
        if(gift.get("mode").getAsString().equals("progress")&&!obtained&&!learned)return "progress";
        if(!source){
            var index=GiftLoot.index(level);
            if(!index.isDone())return "indexing";
            if(!index.getNow(Set.of()).contains(id.toString()))return "unavailable";
        }
        int room=0;for(ItemStack slot:player.getInventory().items){if(slot.isEmpty()){room+=stack.getMaxStackSize();break;}if(GameVersion.same(slot,stack))room+=stack.getMaxStackSize()-slot.getCount();}
        if(room<count)return "full";
        Vec3 dest=player.position();if(!safePath(level,origin,dest))return "unsafe";
        stack.setCount(count);ItemEntity entity=new ItemEntity(level,origin.x,origin.y,origin.z,stack);
        double ticks=Math.max(6,Math.sqrt(Math.max(.1,origin.y-dest.y)/.02)+3);
        entity.setDeltaMovement((dest.x-origin.x)/ticks,.035,(dest.z-origin.z)/ticks);
        entity.setPickUpDelay(8);entity.setTarget(player.getUUID());
        return level.addFreshEntity(entity)?"dropped":"unsafe";
    }
    private static boolean safePath(ServerLevel level,Vec3 from,Vec3 to){
        if(!level.getWorldBorder().isWithinBounds(BlockPos.containing(from))||!level.getWorldBorder().isWithinBounds(BlockPos.containing(to)))return false;
        int steps=Math.max(1,(int)Math.ceil(from.distanceTo(to)*4));
        for(int i=0;i<=steps;i++){
            Vec3 pos=from.lerp(to.add(0,.15,0),(double)i/steps);
            if(!level.noCollision(new AABB(pos.x-.13,pos.y,pos.z-.13,pos.x+.13,pos.y+.25,pos.z+.13)))return false;
            BlockPos p=BlockPos.containing(pos);boolean floor=false;
            for(int d=0;d<=4;d++,p=p.below()){
                BlockState b=level.getBlockState(p);
                if(!level.hasChunkAt(p)||!b.getFluidState().isEmpty()||b.is(BlockTags.FIRE)||b.is(Blocks.CACTUS)||b.is(Blocks.MAGMA_BLOCK)||b.is(Blocks.CAMPFIRE)||b.is(Blocks.SOUL_CAMPFIRE)||b.is(Blocks.POWDER_SNOW)||b.is(Blocks.HOPPER)||b.is(Blocks.NETHER_PORTAL)||b.is(Blocks.END_PORTAL))return false;
                if(b.isFaceSturdy(level,p,Direction.UP)){floor=true;break;}
            }
            if(!floor)return false;
        }
        return true;
    }
}
