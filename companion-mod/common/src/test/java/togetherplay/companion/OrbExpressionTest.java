package togetherplay.companion;
import java.util.*;

public final class OrbExpressionTest {
    private static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
    private static List<String> points(String state,long now,boolean reduced){List<String> out=new ArrayList<>();OrbFace.paint(state,now,reduced,0x203F36,1,(x,y,c,a)->out.add(x+","+y+","+c+","+a));return out;}
    public static void run(){
        check(OrbFace.all().size()==14,"all fourteen faces must be packaged");
        for(var face:OrbFace.all()){
            check(!face.vertices().isEmpty()&&face.vertices().size()%3==0,"renderable face: "+face.id());
            check(face.vertices().stream().allMatch(p->Float.isFinite(p.x())&&Float.isFinite(p.y())&&Math.abs(p.x())<90&&Math.abs(p.y())<90),"face stays within the orb");
            check(points(face.id(),90,true).equals(points(face.id(),1000,true)),"reduced motion is stable: "+face.id());
        }
        check(!points("calm",90,false).equals(points("calm",1000,false)),"natural blinking changes only the visual geometry");
        check(OrbFace.ink(0x111111)!=OrbFace.ink(0xAADDCC),"dark colors retain a readable face");
        OrbExpression e=new OrbExpression();e.trigger("worried",1000);e.trigger("responding",1100);check(e.state(1200,true).equals("worried"),"damage feedback survives chat and model waiting");
        e.reset();e.ownerChat("小伴，你好可爱，摸摸", "小伴",1000);check(e.state(1200,true).equals("shy"),"direct affection causes a short shy reaction");e.trigger("shy",1600);check(e.state(5300,false).equals("calm"),"repeated cosmetic trigger does not loop indefinitely");
        e.reset();e.ownerChat("小伴，过来聊聊", "小伴",1000);check(e.state(1200,false).equals("wink"),"calling the name produces a wink");
        e.reset();e.trigger("happy",1000);check(e.frame(1000,false,false).mix()==0,"transition begins softly");check(e.frame(1220,false,false).mix()==1,"transition settles quickly");check(e.frame(1300,false,true).mix()==1,"reduced motion skips the transition");
        e.reset();check(e.state(1500,false).equals("calm"),"world changes clear old emotional events");
        System.out.println("Fourteen expressions, event priority, expiration and reduced motion passed.");
    }
}
