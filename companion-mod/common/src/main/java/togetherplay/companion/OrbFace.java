package togetherplay.companion;

import com.google.gson.*;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.GameRenderer;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Shared vector faces, in a 200-unit circle. No fonts, textures or model calls. */
public final class OrbFace {
    public record Vertex(float x,float y,int color,float opacity,String group,float ax,float ay) {}
    public record Face(String id,String label,String cue,boolean blink,float tilt,long duration,int priority,double bob,boolean slowBlink,List<Vertex> vertices) {}
    public interface Sink { void vertex(float x,float y,int rgb,int alpha); }
    private static final Map<String,Face> FACES=load();
    public static List<Face> all(){return FACES.values().stream().filter(f->!f.id.contains("/")).toList();}
    public static boolean known(String state){return FACES.containsKey(state);}
    public static Face get(String state){return FACES.getOrDefault(state,FACES.get("calm"));}
    private static Map<String,Face> load(){
        try(var stream=OrbFace.class.getResourceAsStream("/assets/together_companion/orb-faces.json")){
            if(stream==null)throw new IOException("Missing companion face library");
            JsonArray data=JsonParser.parseReader(new InputStreamReader(stream,StandardCharsets.UTF_8)).getAsJsonArray();Map<String,Face> faces=new LinkedHashMap<>();
            JsonArray expanded=new JsonArray();for(JsonElement row:data){JsonObject f=row.getAsJsonObject();expanded.add(f);if(f.has("variants"))for(var e:f.getAsJsonObject("variants").entrySet()){JsonObject copy=f.deepCopy();for(var field:e.getValue().getAsJsonObject().entrySet())copy.add(field.getKey(),field.getValue());copy.addProperty("id",f.get("id").getAsString()+"/"+e.getKey());expanded.add(copy);}}
            for(JsonElement row:expanded){JsonObject f=row.getAsJsonObject();List<Vertex> points=new ArrayList<>();
                for(JsonElement element:f.getAsJsonArray("parts")){JsonObject part=element.getAsJsonObject();String group=part.get("group").getAsString(),color=part.get("color").getAsString();int rgb=color.equals("ink")?-1:color.equals("outline")?-2:color.equals("nose")?-3:Integer.parseInt(color.substring(1),16);int start=points.size();float opacity=part.get("opacity").getAsFloat();
                    if(part.get("type").getAsString().equals("ellipse"))ellipse(points,num(part,"x"),num(part,"y"),num(part,"rx"),num(part,"ry"),rgb,opacity,group);
                    else{JsonArray path=part.getAsJsonArray("points");float radius=num(part,"width")/2;
                        for(int i=1;i<path.size();i++){JsonArray a=path.get(i-1).getAsJsonArray(),b=path.get(i).getAsJsonArray();float ax=a.get(0).getAsFloat(),ay=a.get(1).getAsFloat(),bx=b.get(0).getAsFloat(),by=b.get(1).getAsFloat();double length=Math.hypot(bx-ax,by-ay);if(length<.001)continue;float dx=(float)(-(by-ay)*radius/length),dy=(float)((bx-ax)*radius/length);
                            triangle(points,ax+dx,ay+dy,bx+dx,by+dy,bx-dx,by-dy,rgb,opacity,group);triangle(points,ax+dx,ay+dy,bx-dx,by-dy,ax-dx,ay-dy,rgb,opacity,group);
                        }
                        for(JsonElement point:path){JsonArray p=point.getAsJsonArray();ellipse(points,p.get(0).getAsFloat(),p.get(1).getAsFloat(),radius,radius,rgb,opacity,group);}
                    }
                    if(part.has("anchor")){JsonArray a=part.getAsJsonArray("anchor");for(int i=start;i<points.size();i++){Vertex v=points.get(i);points.set(i,new Vertex(v.x,v.y,v.color,v.opacity,v.group,a.get(0).getAsFloat(),a.get(1).getAsFloat()));}}
                }
                String id=f.get("id").getAsString();faces.put(id,new Face(id,f.get("label").getAsString(),f.get("cue").getAsString(),f.get("blink").getAsBoolean(),num(f,"tilt"),f.get("duration").getAsLong(),f.get("priority").getAsInt(),f.get("bob").getAsDouble(),f.has("slowBlink")&&f.get("slowBlink").getAsBoolean(),List.copyOf(points)));
            }return Collections.unmodifiableMap(faces);
        }catch(Exception e){throw new IllegalStateException("Cannot load companion faces",e);}
    }
    private static float num(JsonObject o,String key){return o.get(key).getAsFloat();}
    private static void triangle(List<Vertex> out,float ax,float ay,float bx,float by,float cx,float cy,int rgb,float opacity,String group){out.add(new Vertex(ax,ay,rgb,opacity,group,ax,ay));out.add(new Vertex(bx,by,rgb,opacity,group,bx,by));out.add(new Vertex(cx,cy,rgb,opacity,group,cx,cy));}
    private static void ellipse(List<Vertex> out,float x,float y,float rx,float ry,int rgb,float opacity,String group){for(int i=0;i<16;i++){double a=i*Math.PI/8,b=(i+1)*Math.PI/8;triangle(out,x,y,x+(float)Math.cos(a)*rx,y+(float)Math.sin(a)*ry,x+(float)Math.cos(b)*rx,y+(float)Math.sin(b)*ry,rgb,opacity,group);}}
    public static int ink(int background){double l=((background>>16&255)*.2126+(background>>8&255)*.7152+(background&255)*.0722)/255;return l<.48?0xE8F3DA:0x203F36;}
    public static void paint(String state,long now,boolean reduced,int ink,float opacity,Sink sink){
        paint(state,now,reduced,ink,opacity,0,0,sink);
    }
    public static void paint(String state,long now,boolean reduced,int ink,float opacity,double gazeX,double gazeY,Sink sink){
        paintFace(get(state),state,now,reduced,opacity,gazeX,gazeY,now%6000,(x,y)->ink,0x483534,sink);
    }
    private interface Ink {int at(float x,float y);}
    public static void paintPet(CompanionConfig c,String state,long now,double light,float opacity,double gazeX,double gazeY,long age,Sink sink){
        Face face=FACES.getOrDefault(state+"/"+c.form,get(state));Map<Long,Integer> inks=new HashMap<>();
        paintFace(face,state,now,c.reducedMotion,opacity,gazeX,gazeY,age,(x,y)->inks.computeIfAbsent(((long)Float.floatToIntBits(x)<<32)|(Float.floatToIntBits(y)&0xffffffffL),key->OrbShape.inkAt(c,x,y,light)),Integer.parseInt(c.noseColor.substring(1),16),sink);
    }
    private static void paintFace(Face face,String state,long now,boolean reduced,float opacity,double gazeX,double gazeY,long age,Ink ink,int nose,Sink sink){
        if(opacity<=0)return;double phase=Math.floorMod(now,5700);float blink=!reduced&&face.slowBlink&&age>450&&age<1500?(float)Math.max(.1,Math.abs(age-975)/525.0):!reduced&&face.blink&&phase<180?(float)Math.max(.12,Math.abs(phase-90)/90):1;
        double angle=Math.toRadians(face.tilt),cos=Math.cos(angle),sin=Math.sin(angle);float mouth=state.equals("responding")&&!reduced?(float)(.78+.22*Math.sin(now*.012)):1;
        for(Vertex v:face.vertices){float x=v.x,y=v.y;if(v.group.equals("eyes")){x+=gazeX*100;y=(float)(19+(y-19)*blink+gazeY*100);}if(v.group.equals("mouth"))y=-19+(y+19)*mouth;
            float ax=v.ax,ay=v.ay;if(v.group.equals("eyes")){ax+=gazeX*100;ay=(float)(19+(ay-19)*blink+gazeY*100);}if(v.group.equals("mouth"))ay=-19+(ay+19)*mouth;int local=v.color==-1||v.color==-2?ink.at((float)(ax*cos-ay*sin),(float)(ax*sin+ay*cos)):0;int rgb=v.color==-1?local:v.color==-2?(local==0xE8F3DA?0x203F36:0xE8F3DA):v.color==-3?nose:v.color;
            sink.vertex((float)(x*cos-y*sin),(float)(x*sin+y*cos),rgb,Math.round(255*v.opacity*opacity));}
    }
    public static void preview(GuiGraphics g,int cx,int cy,int radius,String state,long now,boolean reduced,int background){
        g.flush();RenderSystem.enableBlend();RenderSystem.defaultBlendFunc();RenderSystem.disableCull();RenderSystem.setShader(GameRenderer::getPositionColorShader);BufferBuilder b=Tesselator.getInstance().getBuilder();b.begin(VertexFormat.Mode.TRIANGLES,DefaultVertexFormat.POSITION_COLOR);var matrix=g.pose().last().pose();
        paint(state,now,reduced,ink(background),1,(x,y,rgb,alpha)->b.vertex(matrix,cx+x*radius/100,cy-y*radius/100,.1f).color(rgb>>16&255,rgb>>8&255,rgb&255,alpha).endVertex());
        BufferUploader.drawWithShader(b.end());RenderSystem.enableCull();RenderSystem.disableBlend();
    }
}
