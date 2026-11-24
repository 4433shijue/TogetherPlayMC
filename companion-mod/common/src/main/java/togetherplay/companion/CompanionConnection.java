package togetherplay.companion;

import com.google.gson.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** All HTTP and process startup runs off the game thread. Events are marshalled back by the caller. */
public final class CompanionConnection {
    private final CompanionConfig config;
    private final Consumer<JsonObject> consumer;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"Together Companion IO");t.setDaemon(true);return t;});
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final Queue<JsonObject> commands=new ConcurrentLinkedQueue<>();
    private final Queue<JsonObject> documents=new ConcurrentLinkedQueue<>();
    private volatile JsonObject latest;
    private JsonObject sent;
    private volatile boolean urgent=false;
    private volatile String world="";
    private volatile long generation=0;
    private String connectedWorld="",clientId=UUID.randomUUID().toString();
    private volatile String session="";
    private final ExecutorService audioWorker=Executors.newFixedThreadPool(2,r->{Thread t=new Thread(r,"Together Voice IO");t.setDaemon(true);return t;});
    private String playSessionId=UUID.randomUUID().toString();
    private long seq=0,cursor=0,lastState=0,lastAttempt=0;
    private boolean launched=false;
    public volatile String status="尚未连接",name="小伴",draft="",progress="";
    public volatile boolean thinking=false,enabled=true;
    public CompanionConnection(CompanionConfig config,Consumer<JsonObject> consumer){this.config=config;this.consumer=consumer;worker.scheduleWithFixedDelay(this::poll,1,500,TimeUnit.MILLISECONDS);}
    public void world(String next){if(!world.equals(next)){generation++;draft="";progress="";thinking=false;world=next;playSessionId=UUID.randomUUID().toString();latest=null;documents.clear();commands.clear();}}
    public void observe(JsonObject state){latest=state;if(state.has("events")&&!state.getAsJsonArray("events").isEmpty())urgent=true;}
    public void documents(JsonObject batch){if(documents.size()<500)documents.add(batch);}
    public boolean canQueueDocuments(){return documents.size()<20;}
    public void command(String route,JsonObject payload){if(commands.size()>20)return;payload.addProperty("route",route);commands.add(payload);}
    public void send(String text){JsonObject b=new JsonObject();b.addProperty("text",text);command("chat",b);}
    public void send(String text,String mediaId){JsonObject b=new JsonObject();b.addProperty("text",text);b.addProperty("mediaId",mediaId);command("chat",b);}
    boolean ownsSession(String id){return !id.isEmpty()&&id.equals(session);}
    public void cancel(){command("cancel",new JsonObject());}
    public void voice(String route,JsonObject data,Consumer<JsonObject> callback){
        long current=generation;String owner=session;
        if(owner.isEmpty()){JsonObject error=new JsonObject();error.addProperty("error","伙伴未连接。");callback.accept(error);return;}
        data.addProperty("sessionId",owner);
        audioWorker.execute(()->{JsonObject result;try{result=call("voice/"+route,data);}catch(Exception e){result=new JsonObject();result.addProperty("error",e.getMessage()==null?"语音没有完成。":e.getMessage());}if(current==generation&&owner.equals(session))callback.accept(result);});
    }
    public void appearance(){JsonObject b=new JsonObject();b.add("appearance",config.appearance());b.addProperty("chatter",config.chatter);b.addProperty("guideLevel",config.guideLevel);command("appearance",b);}
    private JsonObject call(String route,JsonObject data)throws Exception{
        URI uri=URI.create(config.endpoint+"/companion/v1/"+route);
        HttpRequest.Builder b=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(route.startsWith("voice/")?45:route.equals("documents")?20:4)).header("Authorization","Bearer "+config.token);
        if(data==null)b.GET();else b.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(data.toString()));
        HttpResponse<String> response=http.send(b.build(),HttpResponse.BodyHandlers.ofString());
        if(response.body().length()>(route.startsWith("voice/")?6_000_000:2_000_000))throw new IllegalStateException("服务响应过大");
        if(route.equals("health")&&response.statusCode()!=200)throw new IllegalStateException("端口上的服务版本不匹配，请关闭旧版控制台后重新启动");
        JsonObject json=JsonParser.parseString(response.body()).getAsJsonObject();
        if(response.statusCode()!=200&&response.statusCode()!=202){if(response.statusCode()==409&&CompanionConfig.get(json,"mode","").equals("legacy"))enabled=false;throw new IllegalStateException(CompanionConfig.get(json,"error","服务不可用"));}
        return json;
    }
    private void emit(JsonObject e,long current){if(current==generation)consumer.accept(e);}
    private void poll(){
        long current=generation;String target=world;
        try{
            if(!config.paired()){config.reload();status="请先在控制台安装伙伴配置";return;}
            if(target.isEmpty()){
                if(!session.isEmpty()){JsonObject b=new JsonObject();b.addProperty("sessionId",session);try{call("leave",b);}catch(Exception ignored){}session="";connectedWorld="";}
                status="等待进入单人世界";return;
            }
            if(!connectedWorld.equals(target)||session.isEmpty()){
                if(System.currentTimeMillis()-lastAttempt<3000)return;lastAttempt=System.currentTimeMillis();
                JsonObject health=call("health",null);
                if(!"TogetherPlayMC".equals(CompanionConfig.get(health,"app",""))||!health.has("protocol")||health.get("protocol").getAsInt()!=1)throw new IllegalStateException("本地服务版本不匹配，请更新并重新启动服务");
                enabled=CompanionConfig.get(health,"mode","companion").equals("companion");if(!enabled){status="当前是旧版操作模式";return;}
                JsonObject b=new JsonObject();b.addProperty("protocol",1);b.addProperty("buildVersion",CompanionBuild.version());b.addProperty("world",target);b.addProperty("clientId",clientId);b.addProperty("playSessionId",playSessionId);
                JsonObject result=call("handshake",b);if(current!=generation)return;
                session=result.get("sessionId").getAsString();cursor=result.get("cursor").getAsLong();seq=result.has("seq")?result.get("seq").getAsLong():0;connectedWorld=target;lastState=0;sent=null;documents.clear();
                JsonObject event=new JsonObject();event.addProperty("type","handshake");event.add("data",result);emit(event,current);
            }
            if((urgent||System.currentTimeMillis()-lastState>=2000)&&latest!=null){
                JsonObject snapshot=latest,delta=new JsonObject();
                for(var entry:snapshot.entrySet())if(sent==null||!entry.getValue().equals(sent.get(entry.getKey())))delta.add(entry.getKey(),entry.getValue());
                JsonObject b=new JsonObject();b.addProperty("sessionId",session);b.addProperty("seq",++seq);if(delta.size()>0)b.add("observation",delta);
                call("state",b);sent=snapshot;urgent=false;lastState=System.currentTimeMillis();
            }
            JsonObject command;while((command=commands.poll())!=null){String route=command.remove("route").getAsString();command.addProperty("sessionId",session);JsonObject event=new JsonObject();event.addProperty("type","command_result");event.addProperty("requestId",CompanionConfig.get(command,"requestId",""));try{event.add("data",call(route,command));}catch(Exception error){JsonObject result=new JsonObject();result.addProperty("error",error.getMessage()==null?"操作没有完成，请重新连接后再试。":error.getMessage());event.add("data",result);}emit(event,current);if(current!=generation)return;}
            for(int n=0;n<4;n++){JsonObject batch=documents.peek();if(batch==null)break;batch.addProperty("sessionId",session);call("documents",batch);documents.poll();if(current!=generation)return;}
            JsonObject updates=call("events?sessionId="+session+"&after="+cursor,null);if(current!=generation)return;cursor=updates.get("cursor").getAsLong();
            for(JsonElement e:updates.getAsJsonArray("events"))emit(e.getAsJsonObject(),current);
            JsonObject state=updates.getAsJsonObject("state");thinking=CompanionConfig.get(state,"generation","idle").equals("thinking");draft=CompanionConfig.get(state,"replyDraft","");progress=CompanionConfig.get(state,"generationLabel","");
            JsonObject stateEvent=new JsonObject();stateEvent.addProperty("type","state");stateEvent.add("data",state);emit(stateEvent,current);
            if(state.has("appearance"))config.appearance(state.getAsJsonObject("appearance"));config.chatter=CompanionConfig.get(state,"chatter",config.chatter);config.guideLevel=CompanionConfig.get(state,"guideLevel",config.guideLevel);
            status="陪在你身边";
        }catch(Exception e){
            draft="";progress="";thinking=false;status=e instanceof IllegalStateException?e.getMessage():"连接暂时断开，正在重连";session="";
            if(!launched&&(e instanceof java.net.ConnectException||e.getCause() instanceof java.net.ConnectException)){
                launched=true;try{Path file=Paths.get(config.launcher).toAbsolutePath().normalize();if(file.equals(config.file.getParent().resolve("together-companion-start.vbs").toAbsolutePath().normalize())&&Files.isRegularFile(file))new ProcessBuilder("wscript.exe","//B",file.toString()).start();}catch(Exception ignored){status="本地服务未启动，请打开控制台";}
            }
        }
    }
}
