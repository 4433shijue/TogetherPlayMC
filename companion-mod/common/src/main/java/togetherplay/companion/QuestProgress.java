package togetherplay.companion;

import com.google.gson.*;
import net.minecraft.client.Minecraft;
import java.lang.reflect.*;
import java.util.*;

/** Optional adapter. Unknown progress is never treated as permission to reveal locked quests. */
public final class QuestProgress {
    public static JsonObject read(Minecraft mc){
        JsonObject out=new JsonObject();out.addProperty("known",false);out.addProperty("completedKnown",false);out.add("quests",new JsonArray());out.add("visible",new JsonArray());out.add("completed",new JsonArray());
        try{
            Class<?> type=Class.forName("dev.ftb.mods.ftbquests.client.ClientQuestFile");Object file=type.getField("INSTANCE").get(null);if(file==null)return out;
            Object data=type.getField("selfTeamData").get(file);if(data==null)return out;
            Collection<?> chapters=(Collection<?>)type.getMethod("getAllChapters").invoke(file);JsonArray visible=new JsonArray(),startable=new JsonArray(),completed=new JsonArray();boolean completedKnown=true,visibleKnown=true,startableKnown=true;
            for(Object chapter:chapters){Collection<?> quests=(Collection<?>)chapter.getClass().getMethod("getQuests").invoke(chapter);for(Object quest:quests){
                Method visibleMethod=Arrays.stream(quest.getClass().getMethods()).filter(m->m.getName().equals("isVisible")&&m.getParameterCount()==1&&m.getParameterTypes()[0].isInstance(data)).findFirst().orElse(null);
                Method canStart=Arrays.stream(data.getClass().getMethods()).filter(m->m.getName().equals("canStartTasks")&&m.getParameterCount()==1&&m.getParameterTypes()[0].isInstance(quest)).findFirst().orElse(null);
                Method done=Arrays.stream(data.getClass().getMethods()).filter(m->m.getName().equals("isCompleted")&&m.getParameterCount()==1&&m.getParameterTypes()[0].isInstance(quest)).findFirst().orElse(null);
                String id=String.format("%016X",((Number)quest.getClass().getMethod("getId").invoke(quest)).longValue());
                if(visibleMethod!=null&&Boolean.TRUE.equals(visibleMethod.invoke(quest,data)))visible.add(id);
                if(canStart!=null&&Boolean.TRUE.equals(canStart.invoke(data,quest)))startable.add(id);
                if(done!=null&&Boolean.TRUE.equals(done.invoke(data,quest)))completed.add(id);
                if(visibleMethod==null)visibleKnown=false;if(canStart==null)startableKnown=false;
                if(done==null)completedKnown=false;
            }}
            out.addProperty("known",visibleKnown&&startableKnown);out.addProperty("visibleKnown",visibleKnown);out.addProperty("startableKnown",startableKnown);out.addProperty("completedKnown",completedKnown);out.add("quests",startable);out.add("visible",visible);out.add("completed",completed);
        }catch(ReflectiveOperationException|LinkageError ignored){}
        return out;
    }
}
