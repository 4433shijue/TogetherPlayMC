package togetherplay.companion;
public final class OrbMotionTest {
    private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    private static void followWithoutDodging(){
        OrbMotion a=new OrbMotion(),b=new OrbMotion();OrbMotion.Point player=new OrbMotion.Point(0,64,0);
        a.tick(player,0,"world",.05,3,(p,r)->true);b.tick(player,0,"world",.05,3,(p,r)->true);
        check(a.position.z()>player.z()&&a.position.x()>player.x(),"appear beside the player within forward view");
        OrbMotion.Point resting=a.position;
        for(int i=0;i<240;i++){
            a.tick(player,i*9,"world",.05,3,(p,r)->true);
            check(a.position.distance(resting)<1e-9,"turning around must not make the companion orbit or hide");
        }
        // Same walk, different viewing directions: movement must be exactly the same.
        for(int i=1;i<=160;i++){
            OrbMotion.Point walking=player.add(0,0,-i*.15);
            a.tick(walking,i*11,"world",.05,3,(p,r)->true);b.tick(walking,0,"world",.05,3,(p,r)->true);
            check(a.position.distance(b.position)<1e-8,"walking while looking back must not move the companion away");
            check(a.position.distance(walking)<6,"keep up with a moving player");
        }
        player=player.add(0,0,-24);
        for(int i=0;i<160;i++)a.tick(player,180,"world",.05,3,(p,r)->true);
        resting=a.position;
        for(int i=0;i<180;i++)a.tick(player,i*13,"world",.05,3,(p,r)->true);
        check(a.position.distance(resting)<1e-9,"settle nearby after walking, regardless of camera rotation");
        OrbMotion.Point nearby=player.add(.1,0,.1);a.tick(nearby,90,"world",.05,3,(p,r)->true);
        check(a.position.distance(resting)<1e-9,"small nearby movements must not cause constant repositioning");
        OrbMotion.Point approaching=new OrbMotion.Point(a.position.x(),player.y(),a.position.z());
        for(int i=0;i<80;i++)a.tick(approaching,0,"world",.05,3,(p,r)->true);
        check(a.position.distance(approaching)>1.5,"give a little space when the player walks into the orb");
    }
    public static void main(String[] args){
        OrbShapeTest.run();
        DogEarTest.run();
        PersonalityTest.run();
        OrbExpressionTest.run();
        OrbExpression e=new OrbExpression();e.trigger("happy",1000);check(e.state(2000,false).equals("happy"),"event expression appears");check(e.state(5001,false).equals("calm"),"event expression expires");check(e.state(6000,true).equals("thinking"),"model waiting takes precedence");check(OrbExpression.bob("happy",2000,true)==0,"reduced motion stops bobbing");
        followWithoutDodging();
        OrbMotion model=new OrbMotion();OrbMotion.Point player=new OrbMotion.Point(0,64,0);
        model.tick(player,0,"overworld",.05,3,(p,r)->true);check(model.position!=null,"spawn");check(model.position.distance(player)<4,"near player");
        OrbMotion.Point old=model.position;model.tick(new OrbMotion.Point(100,64,100),0,"overworld",.05,3,(p,r)->true);check(model.position.distance(new OrbMotion.Point(100,64,100))<4,"teleport catchup");
        model.tick(player,0,"nether",.05,3,(p,r)->false);check(model.position==null,"hide without space");
        model.tick(player,0,"nether",.05,3,(p,r)->true);check(model.position!=null,"recover when space appears");
        model.tick(player,0,"nether",.05,3,(p,r)->false);check(model.position==null,"newly loaded solid blocks must hide the orb immediately");
        for(int i=0;i<100;i++){final int t=i;model.tick(player.add(t*.04,0,0),0,"nether",.05,3,(p,r)->p.x()+r<2||p.x()-r>3);if(model.position!=null)check(model.position.x()+.35<2||model.position.x()-.35>3,"never overlap wall");}
        check(OrbMotion.color("#FF0000","#0000FF",true,1)==0xFF0000,"gradient top");check(OrbMotion.color("#FF0000","#0000FF",true,-1)==0x0000FF,"gradient bottom");check(OrbMotion.color("#88C9B0","#000000",false,-1)==0x88C9B0,"solid");
        System.out.println("Orb movement and appearance scenarios passed.");
    }
}
