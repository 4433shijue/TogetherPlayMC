package togetherplay.companion;
import com.google.gson.*;import java.nio.file.*;import java.util.Comparator;
public final class PersonalityTest {
    private static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);}
    public static void run(){
        try{Path root=Files.createTempDirectory("together-personality-");try{
            CompanionConfig config=new CompanionConfig(root);check(config.personalityMode.equals("role"),"legacy default");
            JsonObject p=new JsonObject();p.addProperty("mode","custom");p.addProperty("preset","puppy");p.addProperty("custom","安静的小狗\n偶尔汪一下");config.personality(p);config.form="kitten";config.save();
            CompanionConfig reopened=new CompanionConfig(root);check(reopened.personality().equals(p),"personality persisted independently");check(reopened.form.equals("kitten"),"form retained");
            reopened.personality(null);check(reopened.personalityMode.equals("role")&&reopened.personalityCustom.isEmpty(),"legacy role resets previous style");
            check(OrbShape.choices("personalityModes").size()==3&&OrbShape.choices("personalityPresets").size()==7,"shared catalogue");
        }finally{try(var paths=Files.walk(root)){for(Path file:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
        }catch(Exception e){throw new AssertionError(e);}
        System.out.println("PersonalityTest: legacy defaults, independent settings, persistence and shared catalogue passed.");
    }
}
