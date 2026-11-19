package togetherplay.companion;
import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public final class DogEarTest {
    private static void equal(double actual,double expected,String label){if(!Double.isFinite(actual)||Math.abs(actual-expected)>1e-8)throw new AssertionError(label+": "+actual+" != "+expected);}
    public static void run(){
        try(var stream=DogEarTest.class.getResourceAsStream("/dog-ear-fixtures.json")){
            if(stream==null)throw new AssertionError("Missing browser parity fixtures");JsonObject data=JsonParser.parseReader(new InputStreamReader(stream,StandardCharsets.UTF_8)).getAsJsonObject();
            for(JsonElement row:data.getAsJsonArray("cases")){JsonObject c=row.getAsJsonObject();String id=c.get("id").getAsString();OrbShape.Mesh mesh=OrbShape.mesh(id);int vertex=c.get("vertex").getAsInt();double[] motion=OrbShape.earMotion(mesh.ear(),c.get("state").getAsString(),c.get("time").getAsLong(),c.get("reduced").getAsBoolean(),c.get("age").getAsLong(),c.get("lag").getAsDouble(),c.get("tipLag").getAsDouble(),c.get("turn").getAsDouble()),actual=new double[6];
                OrbShape.deformEar(mesh.vertices(),vertex*6,mesh.ear().weights(),vertex*4,motion,actual);for(int i=0;i<6;i++){equal(motion[i],c.getAsJsonArray("motion").get(i).getAsDouble(),id+" motion");equal(actual[i],c.getAsJsonArray("expected").get(i).getAsDouble(),id+" surface and normal");}
            }
            OrbEarSpring spring=new OrbEarSpring();for(JsonElement row:data.getAsJsonArray("steps")){JsonObject c=row.getAsJsonObject();var state=spring.step(c.get("lag").getAsDouble(),c.get("yaw").getAsDouble(),c.get("reduced").getAsBoolean());equal(state.tipLag(),c.get("tipLag").getAsDouble(),"spring lag");equal(state.turn(),c.get("turn").getAsDouble(),"spring turn");}
            System.out.println("DogEarTest: "+data.getAsJsonArray("cases").size()+" browser/native deformations and 150 spring steps passed.");
        }catch(IOException e){throw new AssertionError(e);}
    }
}
