package togetherplay.companion;

import com.google.gson.JsonParser;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class CompanionBuild {
    private CompanionBuild() {}
    public static String version() {
        try (var stream=CompanionBuild.class.getResourceAsStream("/together-build.json")) {
            if(stream==null)return "unknown";
            return JsonParser.parseReader(new InputStreamReader(stream,StandardCharsets.UTF_8)).getAsJsonObject().get("version").getAsString();
        } catch(Exception error) { return "unknown"; }
    }
}
