package togetherplay.companion;

import com.google.gson.*;
import java.nio.file.*;
import java.net.URI;

public final class CompanionConfig {
    public String profileId="",endpoint="http://127.0.0.1:38885",token="",launcher="";
    public String color="#88C9B0",color2="#F3D69B",mode="solid";
    public String form="orb",ears="preset",accessory="none",coreColor="#FFE8AB",accentColor="#6F9C89",accessoryColor="#E79C8E",eyeColor="#203F36";
    public String dogBreed="golden",coatPattern="solid",muzzleColor="#F5DBAD",innerEarColor="#DBA9A0",noseColor="#483534",markingColor="#D8A15B",markingColor2="#F1D19A";
    public boolean softBody=true,autoEyeColor=true;
    public String chatColor="#B8E8D2",chatNameColor="#88C9B0";
    public String chatter="natural";
    public String personalityMode="role",personalityPreset="auto",personalityCustom="";
    public String guideLevel="hint";
    public boolean face=true,reducedMotion=false;
    public final Path file;
    private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
    public CompanionConfig(Path game){file=game.resolve("config/together-companion.json");reload();}
    private CompanionConfig(){file=null;}
    public static CompanionConfig preview(JsonObject a){CompanionConfig c=new CompanionConfig();c.appearance(a);return c;}
    public void reload(){try{if(!Files.exists(file))return;JsonObject j=JsonParser.parseString(Files.readString(file)).getAsJsonObject();profileId=get(j,"profileId",profileId);endpoint=get(j,"endpoint",endpoint);token=get(j,"token",token);launcher=get(j,"launcher",launcher);if(j.has("appearance"))appearance(j.getAsJsonObject("appearance"));chatter=get(j,"chatter",chatter);if(j.has("personality"))personality(j.getAsJsonObject("personality"));}catch(Exception e){System.err.println("[Together Companion] Configuration could not be read.");}}
    public static String get(JsonObject object,String key,String fallback){try{return object.has(key)?object.get(key).getAsString():fallback;}catch(Exception e){return fallback;}}
    public boolean paired(){try{URI u=URI.create(endpoint);return !profileId.isEmpty()&&token.matches("[a-f0-9]{64}")&&u.getScheme().equals("http")&&u.getHost().equals("127.0.0.1")&&u.getUserInfo()==null&&u.getPort()>0;}catch(Exception e){return false;}}
    public void appearance(JsonObject a){
        color=hex(a,"color",color);color2=hex(a,"color2",color2);mode=choice(a,"mode",mode,"solid","gradient");
        form=choice(a,"form",form,"orb","lantern","jelly","puppy","cloud","planet","kitten");ears=choice(a,"ears",ears,"preset","none","floppy","round","pointed");accessory=choice(a,"accessory",accessory,"none","scarf","hat","flower");
        dogBreed=choice(a,"dogBreed",dogBreed,"golden","shiba","corgi","husky","border","beagle","samoyed","poodle");coatPattern=choice(a,"coatPattern",coatPattern,"solid","cow","tabby","calico");
        muzzleColor=hex(a,"muzzleColor",muzzleColor);innerEarColor=hex(a,"innerEarColor",innerEarColor);noseColor=hex(a,"noseColor",noseColor);markingColor=hex(a,"markingColor",markingColor);markingColor2=hex(a,"markingColor2",markingColor2);
        coreColor=hex(a,"coreColor",coreColor);accentColor=hex(a,"accentColor",accentColor);accessoryColor=hex(a,"accessoryColor",accessoryColor);eyeColor=hex(a,"eyeColor",eyeColor);
        chatColor=hex(a,"chatColor",chatColor);chatNameColor=hex(a,"chatNameColor",chatNameColor);
        face=flag(a,"face",face);reducedMotion=flag(a,"reducedMotion",reducedMotion);softBody=flag(a,"softBody",softBody);autoEyeColor=flag(a,"autoEyeColor",autoEyeColor);
    }
    public void personality(JsonObject p){
        if(p==null)p=new JsonObject();
        personalityMode=choice(p,"mode","role","role","form","custom");
        personalityPreset=choice(p,"preset","auto","auto","orb","puppy","kitten","lantern","jelly","cloud","planet");
        personalityCustom=get(p,"custom","");if(personalityCustom.length()>2000)personalityCustom=personalityCustom.substring(0,2000);
    }
    public JsonObject personality(){JsonObject p=new JsonObject();p.addProperty("mode",personalityMode);p.addProperty("preset",personalityPreset);p.addProperty("custom",personalityCustom);return p;}
    private static String hex(JsonObject a,String k,String fallback){String s=get(a,k,fallback);return s.matches("#[a-fA-F0-9]{6}")?s.toUpperCase(java.util.Locale.ROOT):fallback;}
    private static String choice(JsonObject a,String k,String fallback,String... allowed){String s=get(a,k,fallback);return java.util.Arrays.asList(allowed).contains(s)?s:fallback;}
    private static boolean flag(JsonObject a,String k,boolean fallback){return a.has(k)&&a.get(k).isJsonPrimitive()&&a.getAsJsonPrimitive(k).isBoolean()?a.get(k).getAsBoolean():fallback;}
    public JsonObject appearance(){JsonObject a=new JsonObject();a.addProperty("mode",mode);a.addProperty("color",color);a.addProperty("color2",color2);a.addProperty("face",face);a.addProperty("reducedMotion",reducedMotion);a.addProperty("chatColor",chatColor);a.addProperty("chatNameColor",chatNameColor);a.addProperty("form",form);a.addProperty("ears",ears);a.addProperty("accessory",accessory);a.addProperty("coreColor",coreColor);a.addProperty("accentColor",accentColor);a.addProperty("accessoryColor",accessoryColor);a.addProperty("eyeColor",eyeColor);a.addProperty("softBody",softBody);a.addProperty("autoEyeColor",autoEyeColor);a.addProperty("dogBreed",dogBreed);a.addProperty("coatPattern",coatPattern);a.addProperty("muzzleColor",muzzleColor);a.addProperty("innerEarColor",innerEarColor);a.addProperty("noseColor",noseColor);a.addProperty("markingColor",markingColor);a.addProperty("markingColor2",markingColor2);return a;}
    public void save(){try{JsonObject j=Files.exists(file)?JsonParser.parseString(Files.readString(file)).getAsJsonObject():new JsonObject();j.add("appearance",appearance());j.addProperty("chatter",chatter);j.add("personality",personality());Files.createDirectories(file.getParent());Files.writeString(file,GSON.toJson(j));}catch(Exception e){System.err.println("[Together Companion] Appearance could not be saved.");}}
}
