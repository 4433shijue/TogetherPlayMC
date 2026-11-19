package togetherplay.companion;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import java.awt.image.BufferedImage;
import java.awt.RenderingHints;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;

public final class GamePhoto {
    public static byte[] capture(Minecraft mc)throws Exception{
        try(var image=Screenshot.takeScreenshot(mc.getMainRenderTarget())){
            double scale=Math.min(1,1600.0/Math.max(image.getWidth(),image.getHeight()));int w=Math.max(1,(int)(image.getWidth()*scale)),h=Math.max(1,(int)(image.getHeight()*scale));
            BufferedImage raw=new BufferedImage(image.getWidth(),image.getHeight(),BufferedImage.TYPE_INT_RGB);
            for(int y=0;y<image.getHeight();y++)for(int x=0;x<image.getWidth();x++){int p=image.getPixelRGBA(x,y);raw.setRGB(x,y,((p&255)<<16)|(p&0xFF00)|((p>>16)&255));}
            BufferedImage resized=new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB);var graphics=resized.createGraphics();graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);graphics.drawImage(raw,0,0,w,h,null);graphics.dispose();
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();ImageIO.write(resized,"jpg",bytes);return bytes.toByteArray();
        }
    }
}
