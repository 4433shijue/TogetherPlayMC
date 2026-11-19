package togetherplay.companion;

import com.google.gson.*;
import java.util.*;

public final class OrbShapeTest {
    private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    public static void run(){
        check(OrbShape.all().size()==7,"all seven shared shapes load");
        for(OrbShape.Form form:OrbShape.all())for(String ears:List.of("preset","none","floppy","round","pointed"))for(String accessory:List.of("none","scarf","hat","flower")){
            JsonObject json=form.palette().deepCopy();json.addProperty("form",form.id());json.addProperty("ears",ears);json.addProperty("accessory",accessory);json.addProperty("eyeColor","#123456");json.addProperty("autoEyeColor",false);
            CompanionConfig c=CompanionConfig.preview(json);check(OrbShape.ink(c)==0x123456,"custom eye color survives");check(CompanionConfig.preview(c.appearance()).appearance().equals(c.appearance()),"native settings roundtrip");
            if(ears.equals("pointed"))for(var part:OrbShape.parts(c))if(part.fit().equals("pointedEar"))check(OrbShape.height(OrbShape.get(c).id(),part.x(),part.y())>part.z(),"pointed ears meet body");
            for(String state:List.of("calm","sleepy","curious","responding")){int[] count={0};for(boolean transparent:new boolean[]{false,true})OrbShape.paint(c,state,12345,.1,transparent,(x,y,z,rgb,alpha)->{check(Double.isFinite(x+y+z),"finite vertex");check(Math.sqrt(x*x+y*y+z*z)*.3<.62,"model fits collision envelope: "+form.id());check(alpha>=0&&alpha<=255,"valid alpha");count[0]++;});check(count[0]>1000&&count[0]<26000&&count[0]%3==0,"bounded complete mesh");}
            c.reducedMotion=true;List<String> first=new ArrayList<>(),last=new ArrayList<>();OrbShape.paint(c,"calm",100,.1,false,(x,y,z,rgb,a)->first.add(x+","+y+","+z+","+rgb));OrbShape.paint(c,"calm",99999,-.1,false,(x,y,z,rgb,a)->last.add(x+","+y+","+z+","+rgb));check(first.equals(last),"reduced motion freezes every part");
        }
        List<JsonObject> animals=new ArrayList<>();for(JsonElement e:OrbShape.choices("dogBreeds")){JsonObject b=e.getAsJsonObject(),a=b.getAsJsonObject("palette").deepCopy();a.addProperty("form","puppy");a.add("dogBreed",b.get("id"));animals.add(a);}for(JsonElement e:OrbShape.choices("catCoats")){JsonObject b=e.getAsJsonObject(),a=b.getAsJsonObject("palette").deepCopy();a.addProperty("form","kitten");a.add("coatPattern",b.get("pattern"));animals.add(a);}
        for(JsonObject a:animals)for(String ears:List.of("preset","none","floppy","round","pointed"))for(String accessory:List.of("none","scarf","hat","flower")){
            a.addProperty("ears",ears);a.addProperty("accessory",accessory);CompanionConfig c=CompanionConfig.preview(a);int[] count={0};OrbShape.paint(c,"wink",800,new OrbShape.Motion(.1,0,0,800),OrbShape.STUDIO,false,(x,y,z,rgb,alpha)->{check(Double.isFinite(x+y+z),"animal finite");check(Math.sqrt(x*x+y*y+z*z)*.3<.62,"animal envelope "+c.dogBreed);count[0]++;});check(count[0]<26000,"animal vertex budget "+count[0]);
            for(var face:OrbFace.all())OrbFace.paintPet(c,face.id(),800,.12,1,0,0,800,(x,y,rgb,alpha)->{double[] p=OrbShape.facePoint(c,x,y,new double[]{1,1,1});check(Double.isFinite(p[2])&&p[2]>.2,"animal curved face");});
            check(CompanionConfig.preview(c.appearance()).appearance().equals(c.appearance()),"animal config roundtrip");
        }
        JsonObject cow=OrbShape.choices("catCoats").get(1).getAsJsonObject().getAsJsonObject("palette").deepCopy();cow.addProperty("form","kitten");cow.addProperty("coatPattern","cow");CompanionConfig contrast=CompanionConfig.preview(cow);check(OrbShape.inkAt(contrast,-31,19,1)!=OrbShape.inkAt(contrast,31,19,1),"local eye patch contrast");
        JsonObject partial=new JsonObject();partial.addProperty("color","#123456");contrast.appearance(partial);check(contrast.coatPattern.equals("cow"),"partial legacy saves retain animal pattern");
        CompanionConfig old=CompanionConfig.preview(JsonParser.parseString("{\"color\":\"#123456\",\"face\":false}").getAsJsonObject());check(old.form.equals("orb")&&!old.face&&old.color.equals("#123456"),"legacy appearance preserved");
        OrbBody body=new OrbBody();for(int i=0;i<20;i++)body.tick(new OrbMotion.Point(i*.1,64,0),false);double moving=body.stretch();body.tick(new OrbMotion.Point(1.9,64,0),false);check(body.stretch()<moving,"stop produces settle response");for(int i=0;i<180;i++)body.tick(new OrbMotion.Point(1.9,64,0),false);check(Math.abs(body.stretch())<.0001,"settle decays");body.tick(new OrbMotion.Point(100,64,0),true);check(body.stretch()==0,"reduced motion resets spring");
        OrbBody turning=new OrbBody();OrbMotion.Point fixed=new OrbMotion.Point(0,64,0);turning.tick(fixed,fixed.add(0,0,3),false,"calm",100);
        turning.tick(fixed,fixed.add(3,0,0),false,"calm",150);OrbBody.Frame turn=turning.frame(1);check(turn.yaw()>0&&turn.yaw()<=.085,"body turns gradually");check(turn.gazeX()>0,"eyes look toward owner while body turns");
        for(int i=0;i<80;i++)turning.tick(fixed,fixed.add(3,0,0),false,"calm",200+i*50);check(Math.abs(turning.frame(1).yaw()-Math.PI/2)<.001,"body eventually faces owner");
        turning.tick(fixed,fixed.add(3,0,0),true,"calm",5000);check(turning.frame(1).phase()==.6&&turning.frame(1).lag()==0,"reduced motion freezes satellite and lag");
        for(OrbShape.Form f:OrbShape.all()){check(OrbShape.height(f.id(),0,0)>OrbShape.height(f.id(),.5,0),"face wraps around "+f.id());}
        OrbShape.Part satellite=OrbShape.get("planet").parts().stream().filter(p->p.motion().equals("satellite")).findFirst().orElseThrow();
        check(OrbShape.pose(satellite,"calm",100,false,new OrbShape.Motion(0,0,Math.PI/2)).z()>.8,"satellite front");check(OrbShape.pose(satellite,"calm",100,false,new OrbShape.Motion(0,0,Math.PI*1.5)).z()<-.8,"satellite behind");
        System.out.println("OrbShapeTest: shared meshes, fitted accessories, bounds, reduced motion, gaze and orbit passed");
    }
}
