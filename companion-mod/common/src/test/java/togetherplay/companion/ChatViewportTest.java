package togetherplay.companion;
public final class ChatViewportTest {
    private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    public static void main(String[] args){
        ChatViewport v=new ChatViewport();v.update(120,300,0);check(v.origin(86)==86,"short conversation begins below controls");
        v.update(1200,300,1080);check(v.origin(86)+1200==386,"overflow must expose the newest line above the input");
        v.scroll(120);int visibleMessageY=v.origin(86)+1000;check(v.readingHistory(),"wheel up reveals older messages");
        v.update(1440,300,240);check(v.origin(86)+1000==visibleMessageY,"incoming wrapped messages must preserve the reading position");
        v.update(1440,300,24);check(v.origin(86)+976==visibleMessageY,"appending while trimming the oldest row must keep the same message in place");
        v.latest();v.update(1800,300,360);check(v.origin(86)+1800==386,"latest follows new messages");
        v.oldest();check(v.origin(86)==86,"oldest line is reachable");
        v.dragThumb(86,86);check(v.offset()==v.maximum(),"drag to top");v.dragThumb(386-v.thumbHeight(),86);check(!v.readingHistory(),"drag to bottom");
        v.scroll(Integer.MAX_VALUE);v.update(24,600,0);check(v.offset()==0&&v.origin(86)==86,"resize and clear never leave stale blank space");
        v.update(12000,1,0);check(v.thumbHeight()==1,"tiny viewport stays bounded");
        System.out.println("ChatViewport: latest, history anchor, retention, wheel, drag and resize passed");
    }
}
