package togetherplay.companion;

/** Pure movement model: no entity, navigation AI or world writes. */
public final class OrbMotion {
    public record Point(double x,double y,double z) {
        public Point add(double a,double b,double c){return new Point(x+a,y+b,z+c);}
        public double distance(Point p){return Math.sqrt((x-p.x)*(x-p.x)+(y-p.y)*(y-p.y)+(z-p.z)*(z-p.z));}
        public Point mix(Point p,double t){return new Point(x+(p.x-x)*t,y+(p.y-y)*t,z+(p.z-z)*t);}
    }
    public interface Space { boolean clear(Point p,double radius); }
    public Point position,previous;
    private Point previousPlayer;
    private String dimension="";
    private double blockedSeconds;
    private boolean catchingUp=false,yielding=false;
    private double bearingX=.5,bearingZ=Math.sqrt(.75);
    public void reset(){position=null;previous=null;previousPlayer=null;blockedSeconds=0;dimension="";catchingUp=false;yielding=false;}
    public void tick(Point player,double yaw,String nextDimension,double seconds,double follow,Space space){
        boolean teleport=position==null||!dimension.equals(nextDimension)||!space.clear(position,.35)||position.distance(player)>12||previousPlayer!=null&&previousPlayer.distance(player)>8||blockedSeconds>=3;
        previous=position;dimension=nextDimension;previousPlayer=player;
        if(teleport){
            // Look direction is used only when appearing: arrive within sight, to one side.
            double rad=Math.toRadians(yaw);
            bearingX=Math.cos(rad)*.5-Math.sin(rad)*Math.sqrt(.75);
            bearingZ=Math.sin(rad)*.5+Math.cos(rad)*Math.sqrt(.75);
            position=findSpace(player,player.add(bearingX*follow,1.35,bearingZ*follow),space);
            previous=position;blockedSeconds=0;catchingUp=false;yielding=false;return;
        }
        // Stay at a world position while nearby. Turning to look at the companion must never move it.
        double dx=position.x-player.x,dz=position.z-player.z,horizontal=Math.hypot(dx,dz);
        if(horizontal>.01){bearingX=dx/horizontal;bearingZ=dz/horizontal;}
        if(horizontal>follow+.65)catchingUp=true;
        else if(horizontal<=follow)catchingUp=false;
        if(horizontal<.9)yielding=true;
        else if(horizontal>=1.3)yielding=false;
        double radius=catchingUp?follow-.2:yielding?1.4:horizontal;
        Point target=new Point(player.x+bearingX*radius,player.y+1.35,player.z+bearingZ*radius);
        double distance=position.distance(target),fraction=Math.min(1,Math.max(.06,seconds*3));
        Point next=position.mix(target,Math.min(fraction,Math.max(.02,seconds*6)/Math.max(distance,.001)));
        if(sweep(position,next,space)){position=next;blockedSeconds=0;}
        else {
            Point[] slides={new Point(next.x,position.y,position.z),new Point(position.x,next.y,position.z),new Point(position.x,position.y,next.z),position.add(0,seconds*1.5,0)};
            boolean moved=false;for(Point slide:slides)if(position.distance(slide)>.002&&sweep(position,slide,space)){position=slide;moved=true;break;}
            blockedSeconds+=seconds;
            if(!moved&&blockedSeconds>=3){position=findSpace(player,target,space);previous=position;blockedSeconds=0;}
        }
    }
    private boolean sweep(Point from,Point to,Space space){int n=Math.max(1,(int)Math.ceil(from.distance(to)/.12));for(int i=1;i<=n;i++)if(!space.clear(from.mix(to,(double)i/n),.35))return false;return true;}
    private Point findSpace(Point player,Point target,Space space){
        if(space.clear(target,.35))return target;
        for(double height:new double[]{1.35,2.1,.65})for(double radius:new double[]{2,3,4})for(int i=0;i<16;i++){
            double angle=i*Math.PI/8;Point p=player.add(Math.cos(angle)*radius,height,Math.sin(angle)*radius);if(space.clear(p,.35))return p;
        }
        return null;
    }
    public Point interpolate(float partial){return position==null?null:previous==null?position:previous.mix(position,partial);}
    public static int color(String top,String bottom,boolean gradient,double y){
        int a=Integer.parseInt(top.substring(1),16),b=gradient?Integer.parseInt(bottom.substring(1),16):a;
        double t=Math.max(0,Math.min(1,(y+1)/2));int result=0;
        for(int shift:new int[]{16,8,0})result|=((int)Math.round(((b>>shift)&255)*(1-t)+((a>>shift)&255)*t))<<shift;
        return result;
    }
}
