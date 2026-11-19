package togetherplay.companion;

/** Scroll offset is measured up from the newest message. */
public final class ChatViewport {
    private int offset,maximum,content,viewport;
    public void update(int contentHeight,int viewportHeight,int appendedHeight){
        boolean reading=offset>0;
        content=Math.max(0,contentHeight);viewport=Math.max(1,viewportHeight);
        maximum=Math.max(0,content-viewport);
        offset=clamp(reading?offset+Math.max(0,appendedHeight):0);
    }
    private int clamp(int value){return Math.max(0,Math.min(maximum,value));}
    public void scroll(int pixels){offset=clamp(offset+pixels);}
    public void latest(){offset=0;}
    public void oldest(){offset=maximum;}
    public boolean readingHistory(){return offset>0;}
    public int maximum(){return maximum;}
    public int offset(){return offset;}
    public int origin(int top){return top-maximum+offset;}
    public int thumbHeight(){return maximum==0?viewport:Math.min(viewport,Math.max(18,viewport*viewport/Math.max(1,content)));}
    public int thumbTop(int top){return top+(maximum==0?0:(int)Math.round((viewport-thumbHeight())*(1.0-offset/(double)maximum)));}
    public void dragThumb(double y,int top){int travel=viewport-thumbHeight();offset=travel<=0?0:clamp((int)Math.round(maximum*(1-(y-top)/travel)));}
}
