package togetherplay.companion;
import java.nio.file.Files;
public final class NativeChatTest {
    private static void check(boolean ok,String reason){if(!ok)throw new AssertionError(reason);}
    public static void main(String[] args)throws Exception{
        check(NativeChat.route("你好",true,true),"singleplayer text routes to the companion");
        check(!NativeChat.route("/time query daytime",true,true)&&!NativeChat.route(" /help",true,true),"commands remain Minecraft commands");
        check(!NativeChat.route("你好",false,true)&&!NativeChat.route("你好",true,false)&&!NativeChat.route(" ",true,true),"multiplayer, legacy mode and blank input are untouched");
        NativeChat chat=new NativeChat();chat.scope("A:r");check(chat.accept("1")&&!chat.accept("1"),"replayed event appears once");chat.scope("A:r");check(!chat.accept("1"),"same-world reconnect keeps the baseline");chat.scope("B:r");check(chat.accept("1"),"new world has a separate baseline");chat.scope("B:other");check(chat.accept("1"),"new role has a separate baseline");
        var message=NativeChat.message("小伴","你好§c呀\n第二行", "#123456","#aabbcc");
        check(message.getString().equals("[小伴] 你好呀\n第二行"),"literal message retains Chinese and newlines without embedded color overrides");
        check(message.getSiblings().get(0).getStyle().getColor().getValue()==0x123456,"name uses the selected color");
        check(message.getSiblings().get(1).getStyle().getColor().getValue()==0xaabbcc,"body uses the selected color");
        check(NativeChat.color("bad",0x88C9B0)==0x88C9B0,"invalid local color falls back safely");
        var dir=Files.createTempDirectory("together-chat-color-");try{CompanionConfig c=new CompanionConfig(dir);c.chatColor="#654321";c.chatNameColor="#ABCDEF";c.save();CompanionConfig reopened=new CompanionConfig(dir);check(reopened.chatColor.equals("#654321")&&reopened.chatNameColor.equals("#ABCDEF"),"colors persist locally");}finally{Files.deleteIfExists(dir.resolve("config/together-companion.json"));Files.deleteIfExists(dir.resolve("config"));Files.deleteIfExists(dir);}
        System.out.println("NativeChat: routing, duplicate suppression, colors, Chinese and persistence passed");
    }
}
