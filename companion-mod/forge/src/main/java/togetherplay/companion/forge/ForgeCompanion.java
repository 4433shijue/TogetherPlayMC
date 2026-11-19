package togetherplay.companion.forge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLEnvironment;
import net.minecraftforge.api.distmarker.Dist;
@Mod("together_companion")
public final class ForgeCompanion {
    public ForgeCompanion(){if(FMLEnvironment.dist==Dist.CLIENT)ClientHooks.register();}
}
