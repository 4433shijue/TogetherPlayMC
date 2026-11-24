package togetherplay.companion;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.*;
import net.minecraft.client.Camera;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.*;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import net.minecraft.core.BlockPos;

public final class OrbRenderer {
    public static void render(PoseStack poses,Camera camera,float partial){
        CompanionClient c=CompanionClient.INSTANCE;if(c==null||!c.connection.enabled||c.mc.player==null||c.mc.getSingleplayerServer()==null)return;
        OrbMotion.Point p=c.orb.interpolate(partial);if(p==null)return;
        Vec3 eye=camera.getPosition();if(eye.distanceTo(new Vec3(p.x(),p.y(),p.z()))<.7)return;
        long now=System.currentTimeMillis();String state=c.config.face?c.expression.state(now,c.connection.thinking):"calm";
        double bob=OrbExpression.bob(state,now,c.config.reducedMotion),radius=radius(c.config);
        if(!c.mc.level.noCollision(new net.minecraft.world.phys.AABB(p.x()-radius,p.y()+bob-radius,p.z()-radius,p.x()+radius,p.y()+bob+radius,p.z()+radius)))bob=0;
        OrbBody.Frame frame=c.body.frame(partial);Quaternionf rotation=new Quaternionf().rotateY((float)frame.yaw()).rotateX((float)frame.lean()).rotateZ((float)frame.roll());
        Quaternionf inverse=new Quaternionf(rotation).conjugate();Vec3 view=eye.subtract(p.x(),p.y()+bob,p.z()).normalize();
        Vector3f localView=inverse.transform(new Vector3f((float)view.x,(float)view.y,(float)view.z)),sun=inverse.transform(new Vector3f(-.36f,.73f,.58f).normalize());
        double ambient=Math.max(.08,Math.min(1,c.mc.level.getMaxLocalRawBrightness(BlockPos.containing(p.x(),p.y(),p.z()))/15.0));
        OrbShape.Lighting lighting=new OrbShape.Lighting(ambient,sun.x,sun.y,sun.z,localView.x,localView.y,localView.z);
        poses.pushPose();poses.translate(p.x()-eye.x,p.y()-eye.y+bob,p.z()-eye.z);poses.mulPose(rotation);
        RenderSystem.enableDepthTest();RenderSystem.disableCull();RenderSystem.setShader(GameRenderer::getPositionColorShader);
        double stretch=frame.stretch();OrbShape.Motion motion=new OrbShape.Motion(stretch,frame.lag(),frame.phase(),c.expression.age(now),frame.earLag(),frame.earTurn());Matrix4f matrix=poses.last().pose();
        for(boolean translucent:new boolean[]{false,true}){
            RenderSystem.depthMask(!translucent);if(translucent){RenderSystem.enableBlend();RenderSystem.defaultBlendFunc();}else RenderSystem.disableBlend();
            BufferBuilder b=GameVersion.triangles();
            OrbShape.paint(c.config,state,now,motion,lighting,translucent,(x,y,z,rgb,alpha)->vertex(b,matrix,x*.3,y*.3,z*.3,rgb,alpha));
            GameVersion.draw(b);
        }
        if(c.config.face){
            RenderSystem.enableBlend();RenderSystem.defaultBlendFunc();RenderSystem.depthMask(false);
            BufferBuilder b=GameVersion.triangles();
            double[] deformation=OrbShape.deformation(c.config,state,now,stretch);int ink=OrbShape.ink(c.config,ambient);
            OrbFace.Sink sink=(x,y,rgb,alpha)->{double[] point=OrbShape.facePoint(c.config,x,y,deformation);vertex(b,matrix,point[0]*.3,point[1]*.3,point[2]*.3,rgb,alpha);};
            OrbExpression.Frame expression=c.expression.frame(now,c.connection.thinking,c.config.reducedMotion);
            OrbFace.paintPet(c.config,expression.from(),now,ambient,1-expression.mix(),frame.gazeX(),frame.gazeY(),c.expression.age(now),sink);OrbFace.paintPet(c.config,expression.to(),now,ambient,expression.mix(),frame.gazeX(),frame.gazeY(),c.expression.age(now),sink);
            GameVersion.draw(b);
        }
        RenderSystem.depthMask(true);RenderSystem.enableCull();RenderSystem.disableBlend();
        if(c.mc.screen==null&&now<c.bubbleUntil&&!c.bubble.isEmpty()){
            poses.mulPose(inverse);poses.translate(0,.65,0);poses.mulPose(camera.rotation());poses.scale(-.016f,-.016f,.016f);
            var lines=c.mc.font.split(Component.literal(c.bubble),220);var buffers=c.mc.renderBuffers().bufferSource();
            for(int i=0;i<Math.min(4,lines.size());i++){var line=lines.get(i);c.mc.font.drawInBatch(line,-c.mc.font.width(line)/2f,i*11,0xFFFFFF,true,poses.last().pose(),buffers,Font.DisplayMode.NORMAL,0xA0202828,15728880);}buffers.endBatch();
        }
        poses.popPose();
    }
    public static double radius(CompanionConfig c){return c.form.equals("orb")&&(c.ears.equals("preset")||c.ears.equals("none"))&&c.accessory.equals("none")?.35:.62;}
    private static void vertex(BufferBuilder b,Matrix4f m,double x,double y,double z,int rgb,int alpha){
        GameVersion.vertex(b,m,(float)x,(float)y,(float)z,rgb>>16&255,rgb>>8&255,rgb&255,alpha);
    }
}
