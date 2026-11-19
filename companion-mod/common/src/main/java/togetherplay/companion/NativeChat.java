package togetherplay.companion;

import java.util.LinkedHashSet;
import net.minecraft.network.chat.Component;

/** Local chat components and stable event deduplication; never sends a server packet. */
public final class NativeChat {
    private String scope="";
    private final LinkedHashSet<String> seen=new LinkedHashSet<>();
    public void scope(String value){if(!scope.equals(value)){scope=value;seen.clear();}}
    public void reset(){scope="";seen.clear();}
    public boolean accept(String id){if(id.isEmpty())return true;if(!seen.add(id))return false;while(seen.size()>400)seen.remove(seen.iterator().next());return true;}
    public static boolean route(String text,boolean singleplayer,boolean enabled){return singleplayer&&enabled&&text!=null&&!text.isBlank()&&!text.stripLeading().startsWith("/");}
    public static String clean(String text){return text.replaceAll("(?i)§[0-9a-fk-or]","").replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]","");}
    public static int color(String hex,int fallback){try{return hex!=null&&hex.matches("#[a-fA-F0-9]{6}")?Integer.parseInt(hex.substring(1),16):fallback;}catch(Exception e){return fallback;}}
    public static Component message(String name,String text,String nameColor,String textColor){
        return Component.empty().append(Component.literal("["+clean(name)+"] ").withStyle(s->s.withColor(color(nameColor,0x88C9B0))))
            .append(Component.literal(clean(text)).withStyle(s->s.withColor(color(textColor,0xB8E8D2))));
    }
}
