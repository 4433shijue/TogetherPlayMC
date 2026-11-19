package togetherplay.companion;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.GameRenderer;
import java.util.*;

public final class OrbPreview {
    private record Vertex(double x,double y,double z,int rgb,int alpha) {}
    private record Triangle(Vertex a,Vertex b,Vertex c,double depth) {}
    public static void draw(GuiGraphics g,double cx,double cy,double radius,CompanionConfig c,String state,long now){draw(g,cx,cy,radius,c,state,now,0,1);}
    public static void draw(GuiGraphics g,double cx,double cy,double radius,CompanionConfig c,String state,long now,double angle,double light){
        double cos=Math.cos(angle),sin=Math.sin(angle),motion=c.reducedMotion?0:Math.sin(now*.003)*.018;
        List<List<Vertex>> groups=List.of(new ArrayList<>(),new ArrayList<>(),new ArrayList<>());
        OrbShape.Lighting lighting=new OrbShape.Lighting(light,-.36*cos-.58*sin,.73,-.36*sin+.58*cos,-sin,0,cos);
        for(int i=0;i<2;i++){List<Vertex> target=groups.get(i);OrbShape.paint(c,state,now,new OrbShape.Motion(motion,motion*.5,now*.00026),lighting,i==1,(x,y,z,rgb,alpha)->target.add(new Vertex(x*cos+z*sin,y,-x*sin+z*cos,rgb,alpha)));}
        if(c.face){double[] d=OrbShape.deformation(c,state,now,motion);OrbFace.paintPet(c,state,now,light,1,0,0,now%6000,(x,y,rgb,alpha)->{double[] p=OrbShape.facePoint(c,x,y,d);groups.get(2).add(new Vertex(p[0]*cos+p[2]*sin,p[1],-p[0]*sin+p[2]*cos,rgb,alpha));});}
        // Real depth keeps curved whiskers, mouth strokes and outlines above fur.
        // Preserve face drawing order so the outline cannot cover its own ink.
        g.flush();RenderSystem.enableDepthTest();RenderSystem.disableCull();RenderSystem.setShader(GameRenderer::getPositionColorShader);var matrix=g.pose().last().pose();
        for(int group=0;group<3;group++){
            List<Vertex> vertices=groups.get(group);if(vertices.isEmpty())continue;
            RenderSystem.depthMask(group==0);if(group==0)RenderSystem.disableBlend();else{RenderSystem.enableBlend();RenderSystem.defaultBlendFunc();}
            if(group==1){List<Triangle> triangles=new ArrayList<>();for(int i=0;i<vertices.size();i+=3){Vertex a=vertices.get(i),b=vertices.get(i+1),e=vertices.get(i+2);triangles.add(new Triangle(a,b,e,(a.z+b.z+e.z)/3));}triangles.sort(Comparator.comparingDouble(Triangle::depth));vertices=new ArrayList<>();for(Triangle t:triangles){vertices.add(t.a);vertices.add(t.b);vertices.add(t.c);}}
            BufferBuilder b=Tesselator.getInstance().getBuilder();b.begin(VertexFormat.Mode.TRIANGLES,DefaultVertexFormat.POSITION_COLOR);
            for(Vertex v:vertices)b.vertex(matrix,(float)(cx+v.x*radius),(float)(cy-v.y*radius),(float)(150+v.z*radius)).color(v.rgb>>16&255,v.rgb>>8&255,v.rgb&255,v.alpha).endVertex();
            BufferUploader.drawWithShader(b.end());
        }
        RenderSystem.depthMask(true);RenderSystem.enableDepthTest();RenderSystem.enableCull();RenderSystem.disableBlend();
    }
}
