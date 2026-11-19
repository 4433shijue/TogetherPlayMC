package togetherplay.companion;

/** Visual motion never writes to OrbMotion or the player/camera. */
public final class OrbBody {
    public record Frame(double yaw,double lean,double roll,double gazeX,double gazeY,double stretch,double lag,double phase,double earLag,double earTurn) {
        public Frame(double yaw,double lean,double roll,double gazeX,double gazeY,double stretch,double lag,double phase){this(yaw,lean,roll,gazeX,gazeY,stretch,lag,phase,0,0);}
    }
    private double earLag,earTurn;
    private final OrbEarSpring ears=new OrbEarSpring();
    private OrbMotion.Point previous;private double speed,settle,velocity,yaw,lean,roll,gazeX,gazeY,phase=.6,orbitRate=.26;private boolean initialized;private long attendUntil,attendAfter;
    private Frame before=new Frame(0,0,0,0,0,0,0,.6),current=before;
    public void reset(){previous=null;ears.reset();earLag=earTurn=0;speed=settle=velocity=yaw=lean=roll=gazeX=gazeY=0;initialized=false;phase=.6;orbitRate=.26;attendUntil=attendAfter=0;before=current=new Frame(0,0,0,0,0,0,0,.6);}
    public void attend(long now){attend(now,0);}
    public void attend(long now,int delay){attendAfter=now+delay;attendUntil=now+5500;}
    public void tick(OrbMotion.Point point,boolean reduced){tick(point,point==null?null:point.add(0,0,3),reduced,"calm",0);}
    public void tick(OrbMotion.Point point,OrbMotion.Point owner,boolean reduced,String expression,long now){
        if(point==null||owner==null){reset();return;}before=current;
        double dx=previous==null?0:point.x()-previous.x(),dy=previous==null?0:point.y()-previous.y(),dz=previous==null?0:point.z()-previous.z(),next=Math.sqrt(dx*dx+dy*dy+dz*dz)/.05;
        if(next>20){ears.reset();earLag=earTurn=0;speed=settle=velocity=0;initialized=false;next=0;dx=dz=0;}
        double ownerYaw=Math.atan2(owner.x()-point.x(),owner.z()-point.z());boolean attentive=now<attendUntil||expression.equals("thinking")||expression.equals("responding");
        double target=next>.18&&!attentive?Math.atan2(dx,dz):ownerYaw;
        if(now<attendAfter)target=yaw;
        if(!initialized){yaw=target;initialized=true;before=new Frame(yaw,0,0,0,0,0,0,phase);}
        if(reduced){ears.reset();earLag=earTurn=0;speed=settle=velocity=lean=roll=gazeX=gazeY=0;yaw=target;previous=point;phase=.6;before=current=new Frame(yaw,0,0,0,0,0,0,.6);return;}
        if(speed>.15&&next<speed*.65)velocity-=Math.min(.8,(speed-next)*.18);
        speed=next;velocity+=(-settle*70-velocity*9)*.05;settle=clamp(settle+velocity*.05,-.12,.12);previous=point;
        // Gaze follows the owner sooner than the body's bounded turn.
        if(now>=attendAfter){gazeX+=(clamp(wrap(ownerYaw-yaw)*.075,-.085,.085)-gazeX)*.48;
        gazeY+=(clamp((owner.y()-point.y())/Math.max(.8,owner.distance(point))*.065,-.045,.045)-gazeY)*.48;}
        double yawStep=clamp(wrap(target-yaw)*.16,-.085,.085);yaw+=yawStep;lean+=(Math.min(.13,speed*.026)-lean)*.22;
        OrbEarSpring.State earState=ears.step(settle-velocity*.045,yawStep,false);earLag=earState.tipLag();earTurn=earState.turn();
        double targetRoll=expression.equals("wink")?-.075:expression.equals("curious")?-.055:expression.equals("shy")?.04:0;roll+=(targetRoll-roll)*.13;
        double rate=expression.equals("responding")?0:expression.equals("thinking")?.55:.26;orbitRate+=(rate-orbitRate)*.12;phase+=orbitRate*.05;
        current=new Frame(yaw,lean,roll,gazeX,gazeY,stretch(),settle-velocity*.045,phase,earLag,earTurn);
    }
    public double stretch(){return clamp(speed*.012+settle,-.12,.10);}
    public Frame frame(double partial){double t=clamp(partial,0,1);return new Frame(before.yaw+wrap(current.yaw-before.yaw)*t,mix(before.lean,current.lean,t),mix(before.roll,current.roll,t),mix(before.gazeX,current.gazeX,t),mix(before.gazeY,current.gazeY,t),mix(before.stretch,current.stretch,t),mix(before.lag,current.lag,t),mix(before.phase,current.phase,t),mix(before.earLag,current.earLag,t),mix(before.earTurn,current.earTurn,t));}
    private static double mix(double a,double b,double t){return a+(b-a)*t;}
    private static double wrap(double v){return Math.atan2(Math.sin(v),Math.cos(v));}
    private static double clamp(double v,double min,double max){return Math.max(min,Math.min(max,v));}
}
