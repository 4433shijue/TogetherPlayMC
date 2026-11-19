package togetherplay.companion;

/** Visual feedback only. Never changes navigation or issues model requests. */
public final class OrbExpression {
    private String state="calm";
    private long until=0,changed=0,started=0;
    private String shown="calm",previous="calm";
    public record Frame(String from,String to,float mix) {}
    public void reset(){state=shown=previous="calm";until=changed=started=0;}
    public void trigger(String next,long now){
        if(!OrbFace.known(next)||next.equals("calm")||next.equals("thinking"))return;
        if(now<until&&(state.equals(next)||OrbFace.get(state).priority()>OrbFace.get(next).priority()))return;
        state=next;started=now;until=now+OrbFace.get(next).duration();
    }
    public long age(long now){return Math.max(0,now-started);}
    public String state(long now,boolean thinking){if(now<until&&OrbFace.get(state).priority()>=3)return state;if(thinking)return "thinking";return now<until?state:"calm";}
    public Frame frame(long now,boolean thinking,boolean reduced){String next=state(now,thinking);if(!next.equals(shown)){previous=shown;shown=next;changed=now;}float t=reduced?1:Math.min(1,Math.max(0,(now-changed)/220f));return new Frame(previous,shown,t*t*(3-2*t));}
    public void ownerChat(String text,String name,long now){
        if(text.matches("(?s).*(?:你(?:真|好|很|太)?可爱|好乖|喜欢你|抱抱|摸摸|贴贴|乖小球).*")&&!text.matches("(?s).*(?:不可爱|不喜欢你).*"))trigger("shy",now);
        else if(!name.isBlank()&&text.contains(name)||text.matches("(?s).*(?:你好|早安|晚安|嗨嗨).*"))trigger("wink",now);
    }
    public static double bob(String state,long now,boolean reduced){return reduced?0:Math.sin(now*.002)*OrbFace.get(state).bob();}
}
