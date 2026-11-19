package togetherplay.companion;

/** Visual-only ear lag, advanced at the companion's existing 20 Hz tick. */
public final class OrbEarSpring {
    public record State(double tipLag,double turn) {}
    private double lag,turn;
    public State step(double inputLag,double yawStep,boolean reduced){
        if(reduced)reset();else{lag+=(clamp(inputLag,-.18,.18)-lag)*.25;turn+=(clamp(yawStep,-.085,.085)-turn)*.22;}
        return new State(lag,turn);
    }
    public void reset(){lag=turn=0;}
    private static double clamp(double x,double low,double high){return Math.max(low,Math.min(high,x));}
}
