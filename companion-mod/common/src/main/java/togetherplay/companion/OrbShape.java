package togetherplay.companion;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Shared indexed models. Geometry is generated at build time, never during play. */
public final class OrbShape {
    public record Part(String mesh,double x,double y,double z,double rx,double ry,double rz,String material,String surface,double rotation,double pitch,double yaw,double alpha,String motion,String fit) {}
    public record Front(int size,double min,double step,double[] z,Map<String,double[]> masks) {}
    public record Ear(double length,int delay,double lift,double flex,double side,double direction,double[] weights) {}
    public record Mesh(double[] vertices,int[] indices,Front front,Map<String,double[]> masks,Ear ear) {}
    public record Form(String id,String name,String description,double[] face,double softness,List<Part> parts,JsonObject palette,String material,JsonObject fittings,String earPreset) {}
    public record Pose(double x,double y,double z,double roll,double pitch,double yaw) {}
    public record Motion(double stretch,double lag,double phase,long eventAge,double tipLag,double turn) {
        public Motion(double stretch,double lag,double phase,long eventAge){this(stretch,lag,phase,eventAge,lag,0);}
        public Motion(double stretch,double lag,double phase){this(stretch,lag,phase,-1,lag,0);}
    }
    public record Lighting(double ambient,double lx,double ly,double lz,double vx,double vy,double vz) {}
    public interface Sink {void vertex(double x,double y,double z,int rgb,int alpha);}
    public static final Lighting STUDIO=new Lighting(1,-.36,.73,.58,0,0,1);
    private static final Map<String,Form> FORMS=new LinkedHashMap<>();
    private static final Map<String,Form> ANIMALS=new LinkedHashMap<>();
    private static JsonObject CATALOGUE;
    private static final Map<String,List<Part>> PARTS=new HashMap<>();
    private static final Map<String,Mesh> MESHES=new HashMap<>();
    private static final Map<String,List<Part>> FITTED=new HashMap<>();
    private static final ThreadLocal<double[]> WORK=ThreadLocal.withInitial(()->new double[6000]);
    static {
        try {
            JsonObject data=resource("orb-forms.json");CATALOGUE=data;
            for(JsonElement e:data.getAsJsonArray("forms")){Form f=readForm(e.getAsJsonObject());FORMS.put(f.id,f);}
            for(var e:data.getAsJsonObject("animals").entrySet())ANIMALS.put(e.getKey(),readForm(e.getValue().getAsJsonObject()));
            for(var e:data.getAsJsonObject("parts").entrySet())PARTS.put(e.getKey(),parts(e.getValue().getAsJsonArray()));
            for(var e:resource("orb-meshes.json").getAsJsonObject("meshes").entrySet()){
                JsonObject mesh=e.getValue().getAsJsonObject();JsonArray rows=mesh.getAsJsonArray("indices");int[] indices=new int[rows.size()];for(int i=0;i<indices.length;i++)indices[i]=rows.get(i).getAsInt();
                Front front=null;if(mesh.has("front")){JsonObject f=mesh.getAsJsonObject("front");front=new Front(f.get("size").getAsInt(),n(f,"min",0),n(f,"step",1),numbers(f.getAsJsonArray("z")),masks(f));}
                Ear ear=null;if(mesh.has("ear")){JsonObject q=mesh.getAsJsonObject("ear");ear=new Ear(n(q,"length",1),(int)n(q,"delay",180),n(q,"lift",0),n(q,"flex",0),n(q,"side",1),n(q,"direction",1),numbers(q.getAsJsonArray("weights")));}
                MESHES.put(e.getKey(),new Mesh(numbers(mesh.getAsJsonArray("vertices")),indices,front,masks(mesh),ear));
            }
        }catch(Exception e){throw new IllegalStateException("Cannot load companion models",e);}
    }
    private static Form readForm(JsonObject f){return new Form(f.get("id").getAsString(),f.get("name").getAsString(),CompanionConfig.get(f,"description",""),numbers(f.getAsJsonArray("face")),n(f,"softness",0),parts(f.getAsJsonArray("parts")),f.getAsJsonObject("palette"),CompanionConfig.get(f,"material","matte"),f.getAsJsonObject("fittings"),CompanionConfig.get(f,"earPreset","none"));}
    private static Map<String,double[]> masks(JsonObject f){Map<String,double[]> out=new HashMap<>();if(f.has("masks"))for(var e:f.getAsJsonObject("masks").entrySet())out.put(e.getKey(),numbers(e.getValue().getAsJsonArray()));return out;}
    public static JsonArray choices(String key){return CATALOGUE.getAsJsonArray(key).deepCopy();}
    public static Form get(CompanionConfig c){return c.form.equals("puppy")?ANIMALS.getOrDefault(c.dogBreed,ANIMALS.get("golden")):get(c.form);}
    public static String pattern(CompanionConfig c){return c.form.equals("puppy")?c.dogBreed:c.form.equals("kitten")?"cat-"+c.coatPattern:"";}
    private static JsonObject resource(String name)throws IOException {
        try(var stream=OrbShape.class.getResourceAsStream("/assets/together_companion/"+name)){
            if(stream==null)throw new IOException("Missing "+name);return JsonParser.parseReader(new InputStreamReader(stream,StandardCharsets.UTF_8)).getAsJsonObject();
        }
    }
    private static double[] numbers(JsonArray a){double[] out=new double[a.size()];for(int i=0;i<out.length;i++)out[i]=a.get(i).getAsDouble();return out;}
    private static double n(JsonObject o,String k,double fallback){return o.has(k)?o.get(k).getAsDouble():fallback;}
    private static List<Part> parts(JsonArray rows){
        List<Part> out=new ArrayList<>();for(JsonElement e:rows){JsonObject p=e.getAsJsonObject();out.add(new Part(CompanionConfig.get(p,"mesh","sphere"),n(p,"x",0),n(p,"y",0),n(p,"z",0),n(p,"rx",1),n(p,"ry",1),n(p,"rz",1),CompanionConfig.get(p,"material","body"),CompanionConfig.get(p,"surface",""),n(p,"rotation",0),n(p,"pitch",0),n(p,"yaw",0),n(p,"alpha",1),CompanionConfig.get(p,"motion",""),CompanionConfig.get(p,"fit","")));}return List.copyOf(out);
    }
    public static List<Form> all(){return List.copyOf(FORMS.values());}
    public static Form get(String id){return ANIMALS.getOrDefault(id,FORMS.getOrDefault(id,FORMS.get("orb")));}
    public static Mesh mesh(String id){return MESHES.get(id);}
    public static List<Part> parts(CompanionConfig c){
        String key=c.form+":"+c.dogBreed+":"+c.ears+":"+c.accessory;return FITTED.computeIfAbsent(key,ignored->{
            Form f=get(c);List<Part> out=new ArrayList<>(f.parts);String ears=c.ears.equals("preset")?f.earPreset:c.ears;boolean pointed=ears.equals("pointed")||ears.matches("pet-(shiba|corgi|husky|border|samoyed|kitten)");
            for(Part p:PARTS.getOrDefault(ears,List.of()))out.add(fit(f,p,pointed));for(Part p:PARTS.getOrDefault(c.accessory,List.of()))out.add(fit(f,p,pointed));return List.copyOf(out);
        });
    }
    private static Part fit(Form f,Part p,boolean pointed){
        double x=p.x,y=p.y,z=p.z,rx=p.rx,ry=p.ry,rz=p.rz,pitch=p.pitch,yaw=p.yaw;
        double[] ear=numbers(f.fittings.getAsJsonArray("ears")),scarf=numbers(f.fittings.getAsJsonArray("scarf")),hat=numbers(f.fittings.getAsJsonArray("hat")),flower=numbers(f.fittings.getAsJsonArray("flower"));
        switch(p.fit){
            case "ear" -> {x=Math.signum(x)*ear[0];y=ear[1];z=ear[2];}
            case "pointedEar" -> {x=Math.signum(x)*(ear[0]>.7?ear[0]*.76:ear[0]);y=ear[1];z=ear[2];}
            case "roundEar" -> {x=Math.signum(x)*(ear[0]-.13);y=ear[1]+.23;}
            case "scarf" -> {rx=scarf[0];y=scarf[1];rz=scarf[2];}
            case "knot","ribbon" -> {x*=scarf[0]/.85;y+=scarf[1]+.57;z*=scarf[2]/.84;}
            case "hat" -> {rx=hat[0];rz=hat[0];y=hat[1];}
            case "brim" -> {rx=hat[0];rz=hat[0]*.94;y=hat[1]+.08;}
            case "pom" -> {x=hat[0]*.18;y=hat[1]+.63;}
            case "flower","flowerCenter" -> {
                x=flower[0];y=flower[1];z=height(f.id,x,y)+.045;
                double nx=-(height(f.id,x+.02,y)-height(f.id,x-.02,y))/.04,ny=-(height(f.id,x,y+.02)-height(f.id,x,y-.02))/.04;
                yaw=Math.toDegrees(Math.atan2(nx,1));pitch=-Math.toDegrees(Math.atan2(ny,Math.sqrt(nx*nx+1)));
                if(p.fit.equals("flowerCenter")){double length=Math.sqrt(nx*nx+ny*ny+1);x+=nx/length*.055;y+=ny/length*.055;z+=.055/length;}
            }
        }
        if(pointed&&(p.fit.equals("hat")||p.fit.equals("brim"))){rx=Math.min(rx,.46);rz=Math.min(rz,.48);}
        return new Part(p.mesh,x,y,z,rx,ry,rz,p.material,p.surface,p.rotation,pitch,yaw,p.alpha,p.motion,p.fit);
    }
    public static double height(String form,double x,double y){
        Front f=MESHES.get("body-"+get(form).id).front;double gx=clamp((x-f.min)/f.step,0,f.size-1.00001),gy=clamp((y-f.min)/f.step,0,f.size-1.00001);int ix=(int)gx,iy=(int)gy;double tx=gx-ix,ty=gy-iy;
        return (f.z[iy*f.size+ix]*(1-tx)+f.z[iy*f.size+ix+1]*tx)*(1-ty)+(f.z[(iy+1)*f.size+ix]*(1-tx)+f.z[(iy+1)*f.size+ix+1]*tx)*ty;
    }
    public static double[] deformation(CompanionConfig c,String state,long now,double motion){
        double amount=c.reducedMotion||!c.softBody?0:get(c).softness*(Math.sin(now*.0018)*.009+motion);
        double pose=!c.softBody?0:state.equals("sleepy")?-.06:state.equals("shy")?-.025:state.equals("proud")?.025:0;
        return new double[]{1-amount*.45-pose*.35,1+amount+pose,1-amount*.40};
    }
    public static Pose pose(Part p,String state,long now,boolean reduced,Motion motion){
        double x=p.x,y=p.y,z=p.z,roll=p.rotation,pitch=p.pitch,yaw=p.yaw;
        if(p.motion.equals("satellite")){double t=reduced?.6:motion.phase;x=Math.cos(t)*1.36;y=.32+Math.sin(t)*.24;z=Math.sin(t)*.90;}
        boolean quiet=List.of("worried","sad","sleepy").contains(state);long age=motion.eventAge<0?Math.floorMod(now,6000):motion.eventAge;boolean greet=state.equals("wink")&&age>=0&&age<1600&&!reduced;double beat=greet?Math.sin(Math.PI*Math.min(1,age/1600.0)):0;
        Ear ear=MESHES.get(p.mesh).ear;
        if(ear!=null){double[] m=earMotion(ear,state,now,reduced,age,motion.lag,motion.tipLag,motion.turn);pitch+=m[0];roll+=m[1];yaw+=m[2];}
        else if(p.motion.startsWith("ear")&&!reduced){double side=p.motion.contains("Left")?-1:1;boolean point=p.motion.endsWith("Point");if(state.equals("curious"))roll+=side*-8;if(quiet)pitch-=8;else{roll+=idle(now,13000,1600)*2;pitch+=motion.lag*48;}if(greet){pitch+=beat*(point?10:18);yaw+=side*beat*(p.mesh.contains("kitten")?22:5);}}
        if(p.motion.startsWith("tail")&&!reduced&&!quiet){double amount=p.motion.equals("tailPom")?9:p.motion.equals("tailCurl")?13:23;yaw+=greet?(age<1400?Math.sin(age/1400.0*Math.PI*4)*amount*Math.sin(Math.PI*age/1400.0):0):Math.sin(now*.007)*(state.equals("happy")?amount:idle(now,15000,1700)*4);}
        if(p.motion.startsWith("paw")){if(state.equals("sleepy")){y+=.12;z-=.09;}else if(!reduced&&!quiet)pitch+=idle(now+(p.motion.endsWith("Left")?0:2600),19000,1500)*6;}
        if(p.motion.equals("core")&&!reduced){x+=Math.sin(now*.0013)*.027;y+=Math.sin(now*.0017)*.023;}
        if(p.motion.startsWith("ribbon")&&!reduced)pitch+=motion.lag*(p.motion.equals("ribbonLeft")?45:32);
        return new Pose(x,y,z,Math.toRadians(roll),Math.toRadians(pitch),Math.toRadians(yaw));
    }
    private static double idle(long now,int period,int length){long p=Math.floorMod(now,period);return p<length?Math.sin(Math.PI*p/length)*Math.sin(Math.PI*2*p/length):0;}
    private static double earPulse(long age,int delay){return age<=delay||age>=1600?0:Math.pow(Math.sin(Math.PI*(age-delay)/(1600-delay)),2);}
    public static double[] earMotion(Ear ear,String state,long now,boolean reduced,long age,double lag,double tipLag,double turn){
        if(ear==null||reduced)return new double[6];boolean quiet=List.of("worried","sad","sleepy").contains(state);
        double root=quiet||!state.equals("wink")?0:earPulse(age,0),tip=quiet||!state.equals("wink")?0:earPulse(age,ear.delay),rest=quiet?0:idle(now,13000,1600),tail=quiet?0:idle(now-ear.delay+13000,13000,1600);
        return new double[]{quiet?-6:root*ear.lift*.4+clamp(lag,-.18,.18)*24,(state.equals("curious")?-ear.side*6:0)-ear.side*ear.direction*(root*ear.lift*.6+rest),quiet?0:ear.side*root*(ear.direction>0?7:3),quiet?0:clamp(turn,-.09,.09)*ear.length*.65,quiet?0:-ear.direction*tip*ear.flex*.15,quiet?0:ear.flex*(tip+.12*tail)+clamp(tipLag,-.18,.18)*.45};
    }
    public static void deformEar(double[] v,int at,double[] weights,int w,double[] motion,double[] out){
        double dx=motion[3],dy=motion[4],dz=motion[5],gx=weights[w+1],gy=weights[w+2],gz=weights[w+3],dot=(v[at+3]*dx+v[at+4]*dy+v[at+5]*dz)/(1+gx*dx+gy*dy+gz*dz);
        out[0]=v[at]+dx*weights[w];out[1]=v[at+1]+dy*weights[w];out[2]=v[at+2]+dz*weights[w];out[3]=v[at+3]-gx*dot;out[4]=v[at+4]-gy*dot;out[5]=v[at+5]-gz*dot;
        double length=Math.sqrt(out[3]*out[3]+out[4]*out[4]+out[5]*out[5]);if(length>0)for(int i=3;i<6;i++)out[i]/=length;
    }
    public static int ink(CompanionConfig c){return ink(c,1);}
    public static int ink(CompanionConfig c,double light){int rgb=OrbMotion.color(c.color,c.color2,c.mode.equals("gradient"),0);return c.autoEyeColor?OrbFace.ink(scale(rgb,(.38+.62*light)*.86)):Integer.parseInt(c.eyeColor.substring(1),16);}
    private static int[] maskColors(CompanionConfig c){return new int[]{Integer.parseInt(c.muzzleColor.substring(1),16),Integer.parseInt(c.markingColor.substring(1),16),Integer.parseInt(c.markingColor2.substring(1),16)};}
    private static int masked(int base,double[] weights,int at,int[] colors){double sum=weights[at]+weights[at+1]+weights[at+2];int out=0;for(int shift:new int[]{16,8,0}){double value=(base>>shift&255)*(1-sum);for(int k=0;k<3;k++)value+=(colors[k]>>shift&255)*weights[at+k];out|=(int)clamp(value,0,255)<<shift;}return out;}
    public static int inkAt(CompanionConfig c,double x,double y,double light){if(!c.autoEyeColor)return Integer.parseInt(c.eyeColor.substring(1),16);Form form=get(c);double px=form.face[0]+x*.01*form.face[3],py=form.face[1]+y*.01*form.face[3];Front f=MESHES.get("body-"+form.id).front;int base=OrbMotion.color(c.color,c.color2,c.mode.equals("gradient"),clamp(py,-1,1));double[] weights=f.masks.get(pattern(c));if(weights!=null){double gx=clamp((px-f.min)/f.step,0,f.size-1.00001),gy=clamp((py-f.min)/f.step,0,f.size-1.00001);int ix=(int)gx,iy=(int)gy;double tx=gx-ix,ty=gy-iy;double[] sample=new double[3];for(int k=0;k<3;k++)sample[k]=(weights[(iy*f.size+ix)*3+k]*(1-tx)+weights[(iy*f.size+ix+1)*3+k]*tx)*(1-ty)+(weights[((iy+1)*f.size+ix)*3+k]*(1-tx)+weights[((iy+1)*f.size+ix+1)*3+k]*tx)*ty;base=masked(base,sample,0,maskColors(c));}return OrbFace.ink(scale(base,(.38+.62*light)*.86));}
    public static double[] facePoint(CompanionConfig c,double x,double y,double[] deformation){double[] face=get(c).face;double px=face[0]+x*.01*face[3],py=face[1]+y*.01*face[3];return new double[]{px*deformation[0],py*deformation[1],(height(get(c).id,px,py)+.029)*deformation[2]};}
    public static void paint(CompanionConfig c,String state,long now,double motion,boolean transparent,Sink sink){paint(c,state,now,new Motion(motion,motion*.5,now*.00026),STUDIO,transparent,sink);}
    public static void paint(CompanionConfig c,String state,long now,Motion motion,Lighting light,boolean transparent,Sink sink){
        Form form=get(c);double[] d=deformation(c,state,now,motion.stretch);double[] scratch=WORK.get();int[] coatColors=maskColors(c);
        for(Part p:parts(c)){
            if((p.alpha<1)!=transparent)continue;Mesh mesh=MESHES.get(p.mesh);Pose pose=pose(p,state,now,c.reducedMotion,motion);
            if(scratch.length<mesh.vertices.length){scratch=new double[mesh.vertices.length];WORK.set(scratch);}
            double cr=Math.cos(pose.roll),sr=Math.sin(pose.roll),cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch),cy=Math.cos(pose.yaw),sy=Math.sin(pose.yaw);
            boolean body=p.mesh.startsWith("body-");String material=!p.surface.isEmpty()?p.surface:p.material.equals("body")?form.material:p.material.equals("core")?"glow":form.material.equals("plush")?"plush":"matte";
            int base=Integer.parseInt((p.material.equals("core")?c.coreColor:p.material.equals("accessory")?c.accessoryColor:p.material.equals("body")?c.color:p.material.equals("innerEar")?c.innerEarColor:c.accentColor).substring(1),16);
            double[] weights=mesh.masks.get(pattern(c));
            long age=motion.eventAge<0?Math.floorMod(now,6000):motion.eventAge;double[] earMove=earMotion(mesh.ear,state,now,c.reducedMotion,age,motion.lag,motion.tipLag,motion.turn),deformed=new double[6];
            for(int i=0;i<mesh.vertices.length;i+=6){
                double[] v=mesh.vertices;int at=i;if(mesh.ear!=null){deformEar(v,i,mesh.ear.weights,i/6*4,earMove,deformed);v=deformed;at=0;}double x=v[at]*p.rx,y=v[at+1]*p.ry,z=v[at+2]*p.rz,nx=v[at+3]/p.rx,ny=v[at+4]/p.ry,nz=v[at+5]/p.rz;
                double t=x*cr-y*sr;y=x*sr+y*cr;x=t;t=y*cp-z*sp;z=y*sp+z*cp;y=t;t=x*cy+z*sy;z=-x*sy+z*cy;x=t;
                t=nx*cr-ny*sr;ny=nx*sr+ny*cr;nx=t;t=ny*cp-nz*sp;nz=ny*sp+nz*cp;ny=t;t=nx*cy+nz*sy;nz=-nx*sy+nz*cy;nx=t;
                if(body){x*=d[0];y*=d[1];z*=d[2];nx/=d[0];ny/=d[1];nz/=d[2];}
                x+=pose.x*d[0];y+=pose.y*d[1];z+=pose.z*d[2];double len=Math.sqrt(nx*nx+ny*ny+nz*nz);if(len>1e-9){nx/=len;ny/=len;nz/=len;}
                int rgb=p.material.equals("body")?OrbMotion.color(c.color,c.color2,c.mode.equals("gradient"),clamp(y,-1,1)):base;
                if(weights!=null)rgb=masked(rgb,weights,i/2,coatColors);
                int n=i/6*5;scratch[n]=x;scratch[n+1]=y;scratch[n+2]=z;scratch[n+3]=shade(rgb,material,x,y,z,nx,ny,nz,now,c.reducedMotion,light);scratch[n+4]=nx*light.vx+ny*light.vy+nz*light.vz;
            }
            int alpha=(int)(p.alpha*255);for(int i=0;i<mesh.indices.length;i+=3){int a=mesh.indices[i]*5,b=mesh.indices[i+1]*5,e=mesh.indices[i+2]*5;if(transparent&&scratch[a+4]+scratch[b+4]+scratch[e+4]<0)continue;for(int j=0;j<3;j++){int v=mesh.indices[i+j]*5;sink.vertex(scratch[v],scratch[v+1],scratch[v+2],(int)scratch[v+3],alpha);}}
        }
    }
    private static int shade(int color,String material,double x,double y,double z,double nx,double ny,double nz,long now,boolean reduced,Lighting light){
        if(material.equals("glow"))return scale(color,reduced?1:.94+.06*Math.sin(now*.0018));
        double diffuse=clamp(nx*light.lx+ny*light.ly+nz*light.lz,0,1),shade=(.38+.62*clamp(light.ambient,0,1))*(.78+.22*diffuse),shine=0;
        if(material.equals("cloud"))shade=(.44+.56*light.ambient)*(.88+.12*diffuse);
        if(material.equals("plush")||material.equals("cloth")){double grain=Math.sin(Math.floor(x*19)*12.9898+Math.floor(y*19)*78.233+Math.floor(z*19)*37.719);shade*=1+grain*(material.equals("cloth")?.025:.015);}
        if(material.equals("jelly")||material.equals("ceramic")||material.equals("glass")||material.equals("satin")){
            double hx=light.lx+light.vx,hy=light.ly+light.vy,hz=light.lz+light.vz,length=Math.sqrt(hx*hx+hy*hy+hz*hz);double half=length>0?clamp((nx*hx+ny*hy+nz*hz)/length,0,1):0;
            shine=Math.pow(half,material.equals("jelly")?44:30)*(material.equals("jelly")?.37:material.equals("glass")?.20:.11)*(.4+.6*light.ambient);
        }
        return channel(color,16,shade,shine)<<16|channel(color,8,shade,shine)<<8|channel(color,0,shade,shine);
    }
    private static int channel(int color,int shift,double shade,double shine){return (int)clamp((color>>shift&255)*shade+255*shine,0,255);}
    private static int scale(int color,double scale){return channel(color,16,scale,0)<<16|channel(color,8,scale,0)<<8|channel(color,0,scale,0);}
    private static double clamp(double v,double min,double max){return Math.max(min,Math.min(max,v));}
}
