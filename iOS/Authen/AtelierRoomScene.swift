import SceneKit
import UIKit

/// A real dollhouse scene: each furniture group keeps its own transform for editing.
enum AtelierRoomScene {
    static let ivory=UIColor(hex:0xF5EADB), gold=UIColor(hex:0xBA8B51), walnut=UIColor(hex:0x916649)
    static func accent(_ style:String)->UIColor{UIColor(hex:style=="奶油白" ? 0xCDB89C:style=="玫瑰粉" ? 0xC9788C:0x963746)}
    static func material(_ color:UIColor,metal:CGFloat=0,rough:CGFloat=0.65,texture:UIImage?=nil)->SCNMaterial {
        let m=SCNMaterial();m.diffuse.contents=texture ?? color;m.lightingModel = .physicallyBased;m.roughness.contents=rough;m.metalness.contents=metal
        return m
    }
    @discardableResult static func node(_ g:SCNGeometry,_ mat:SCNMaterial,_ p:SCNNode,_ x:Float=0,_ y:Float=0,_ z:Float=0)->SCNNode{
        g.materials=[mat];let n=SCNNode(geometry:g);n.position=SCNVector3(x,y,z);p.addChildNode(n);return n
    }
    @discardableResult static func box(_ w:CGFloat,_ h:CGFloat,_ d:CGFloat,_ m:SCNMaterial,_ p:SCNNode,_ x:Float=0,_ y:Float=0,_ z:Float=0,_ r:CGFloat=0.025)->SCNNode{
        let shape=SCNBox(width:w,height:h,length:d,chamferRadius:min(r,min(w,min(h,d))/2));shape.chamferSegmentCount=4
        return node(shape,m,p,x,y,z)
    }
    @discardableResult static func cylinder(_ radius:CGFloat,_ height:CGFloat,_ m:SCNMaterial,_ p:SCNNode,_ x:Float=0,_ y:Float=0,_ z:Float=0)->SCNNode{
        let shape=SCNCylinder(radius:radius,height:height);shape.radialSegmentCount=48;return node(shape,m,p,x,y,z)
    }
    @discardableResult static func sphere(_ radius:CGFloat,_ m:SCNMaterial,_ p:SCNNode,_ x:Float=0,_ y:Float=0,_ z:Float=0,_ scale:SCNVector3=SCNVector3(1,1,1))->SCNNode{
        let s=SCNSphere(radius:radius);s.segmentCount=28;let n=node(s,m,p,x,y,z);n.scale=scale;return n
    }
    static func rod(_ from:SCNVector3,_ to:SCNVector3,radius:CGFloat,mat:SCNMaterial,parent:SCNNode){
        let a=SIMD3<Float>(from.x,from.y,from.z),b=SIMD3<Float>(to.x,to.y,to.z),delta=b-a
        let n=cylinder(radius,CGFloat(simd_length(delta)),mat,parent);n.simdPosition=(a+b)/2;n.simdOrientation=simd_quatf(from:SIMD3<Float>(0,1,0),to:simd_normalize(delta))
    }
    static func make(_ layout:RoomLayout)->SCNScene {
        let scene=SCNScene();scene.background.contents=UIColor(hex:0xEEDFD5)
        scene.lightingEnvironment.contents=environmentTexture();scene.lightingEnvironment.intensity=0.75
        let root=scene.rootNode, cream=material(ivory), trim=material(UIColor(hex:0xFFF6E9)), blush=material(UIColor(hex:0xEBD7CD)), brass=material(gold,metal:0.6,rough:0.28)
        let floor=material(walnut,rough:0.7,texture:woodTexture())
        box(6.72,0.25,5.52,material(UIColor(hex:0xD0BCA9)),root,0,-0.20,0,0.08)
        box(6.6,0.1,5.4,floor,root,0,-0.035,0,0.02)
        // Wide oak boards, individually bevelled; seams produce real contact shadows.
        for row in 0..<14{for col in 0..<5{
            let x:Float = -2.64+Float(col)*1.32,z:Float = -2.5+Float(row)*0.385
            let board=box(1.307,0.028,0.375,floor,root,x,0.027,z,0.006)
            board.geometry?.firstMaterial=floor.copy() as? SCNMaterial
            board.geometry?.firstMaterial?.diffuse.contentsTransform=SCNMatrix4MakeTranslation(Float(col)*0.17,Float(row)*0.21,0)
        }}
        box(6.68,3.65,0.16,blush,root,0,1.81,-2.74,0.025)
        box(0.16,3.65,5.5,cream,root,-3.34,1.81,0,0.025)
        for y:Float in [0.12,1.02,3.57]{
            box(6.6,0.10,0.10,trim,root,0,y,-2.63,0.012)
            box(0.10,0.10,5.4,trim,root,-3.23,y,0,0.012)
        }
        // Panelled lower walls.
        for x:Float in [-2.7,-1.8,-0.9,0,0.9,1.8,2.7]{panel(root:root,x:x,y:0.56,z:-2.64,w:0.7,h:0.65,mat:trim)}
        for z:Float in [-2.1,-1.05,0,1.05,2.1]{let n=SCNNode();root.addChildNode(n);n.position=SCNVector3(-3.24,0.56,z);n.eulerAngles.y = .pi/2;panel(root:n,x:0,y:0,z:0,w:0.82,h:0.65,mat:trim)}
        // Window with sill, mullions, curtain folds and an outdoor sky.
        let window=SCNNode();root.addChildNode(window);window.position=SCNVector3(-3.22,2.22,-0.55);window.eulerAngles.y = .pi/2
        let sky=material(UIColor(hex:0xC3D9CE),rough:1,texture:windowTexture());sky.emission.contents=UIColor(white:0.10,alpha:1)
        box(1.85,1.9,0.025,sky,window,0,0,-0.025,0.025)
        for x:Float in [-0.96,0,0.96]{box(0.075,2,0.10,trim,window,x,0,0.05)}
        for y:Float in [-0.98,0,0.98]{box(2,0.075,0.10,trim,window,0,y,0.05)}
        box(2.18,0.10,0.32,trim,window,0,-1.02,0.07)
        rod(SCNVector3(-1.28,1.15,0.2),SCNVector3(1.28,1.15,0.2),radius:0.025,mat:brass,parent:window)
        let curtain=material(UIColor(hex:0xF4DED5),rough:1,texture:fabricTexture(UIColor(hex:0xF0D5CA)))
        for side:Float in [-1,1]{for i in 0..<5{let x=side*(0.77+Float(i)*0.105);let n=cylinder(0.083,2.18,curtain,window,x,-0.05,0.15+Float(i%2)*0.03);n.scale.z=0.6};box(0.50,0.05,0.13,brass,window,side*0.98,-0.25,0.21)}
        // Small framed print above the reading corner.
        let art=SCNNode();root.addChildNode(art);art.position=SCNVector3(-2.45,2.18,-2.62)
        box(0.86,1.05,0.07,brass,art);box(0.75,0.94,0.025,material(ivory,texture:artTexture()),art,0,0,0.05)
        for p in layout.pieces{root.addChildNode(furniture(p,style:layout.style))}
        // A broad key light gives shadows; ambient occlusion grounds furniture feet.
        let light=SCNNode();light.light=SCNLight();light.light?.type = .directional;light.light?.color=UIColor(hex:0xFFF0DA);light.light?.intensity=1050
        light.light?.castsShadow=true;light.light?.shadowMode = .deferred;light.light?.shadowColor=UIColor(red:0.26,green:0.16,blue:0.14,alpha:0.25)
        light.light?.shadowRadius=5;light.light?.shadowSampleCount=16;light.light?.shadowMapSize=CGSize(width:2048,height:2048);light.light?.orthographicScale=10;light.light?.zNear=0.1;light.light?.zFar=30
        light.position=SCNVector3(-3,8,5);light.look(at:SCNVector3(0,0,0));root.addChildNode(light)
        let fill=SCNNode();fill.light=SCNLight();fill.light?.type = .ambient;fill.light?.color=UIColor(hex:0xFFF3EB);fill.light?.intensity=300;root.addChildNode(fill)
        let camera=SCNNode();camera.name="camera";camera.camera=SCNCamera();camera.camera?.usesOrthographicProjection=true;camera.camera?.orthographicScale=4.60
        camera.camera?.zNear=0.1;camera.camera?.zFar=60;camera.camera?.wantsHDR=true;camera.camera?.exposureOffset=0.15
        camera.camera?.averageGray=0.40;camera.camera?.whitePoint=1.0
        camera.camera?.screenSpaceAmbientOcclusionIntensity=1.1;camera.camera?.screenSpaceAmbientOcclusionRadius=0.25;camera.camera?.screenSpaceAmbientOcclusionBias=0.02
        camera.position=SCNVector3(sin(0.64)*cos(0.60)*13,1.15+sin(0.60)*13,cos(0.64)*cos(0.60)*13);camera.look(at:SCNVector3(0,1.15,0));root.addChildNode(camera)
        return scene
    }
    static func panel(root:SCNNode,x:Float,y:Float,z:Float,w:CGFloat,h:CGFloat,mat:SCNMaterial){
        for sign:Float in [-1,1]{box(w,0.022,0.024,mat,root,x,y+sign*Float(h)/2,z);box(0.022,h,0.024,mat,root,x+sign*Float(w)/2,y,z)}
    }
    static func furniture(_ p:RoomPiece,style:String)->SCNNode {
        let root=SCNNode();root.name="piece:"+p.id;root.position=SCNVector3(p.x,0,p.z);root.eulerAngles.y=p.angle * .pi/180;root.isHidden = !p.visible
        let cream=material(ivory), brass=material(gold,metal:0.65,rough:0.30), wood=material(walnut,rough:0.5), red=material(accent(style),rough:0.45), soft=material(accent(style),rough:0.95,texture:fabricTexture(accent(style))), pale=material(UIColor(hex:0xEAD5C1),rough:1,texture:fabricTexture(UIColor(hex:0xEAD5C1)))
        switch p.kind {
        case "vanity":
            for x:Float in [-0.88,0.88]{for z:Float in [-0.28,0.28]{cylinder(0.035,0.83,brass,root,x,0.44,z)}}
            box(2.10,0.30,0.76,cream,root,0,0.90,0,0.06)
            box(2.18,0.075,0.84,material(UIColor(hex:0xFFF7EC),rough:0.24,texture:marbleTexture()),root,0,1.08,0,0.035)
            for x:Float in [-0.69,0,0.69]{box(0.65,0.23,0.035,cream,root,x,0.9,0.39);cylinder(0.025,0.13,brass,root,x,0.91,0.426).eulerAngles.z = .pi/2}
            // Tall arched mirror and a narrow bevel frame.
            let arch=UIBezierPath();arch.flatness=0.003;arch.move(to:CGPoint(x:-0.52,y:0));arch.addLine(to:CGPoint(x:-0.52,y:0.78));arch.addArc(withCenter:CGPoint(x:0,y:0.78),radius:0.52,startAngle:.pi,endAngle:0,clockwise:false);arch.addLine(to:CGPoint(x:0.52,y:0));arch.close()
            let frame=SCNShape(path:arch,extrusionDepth:0.06);frame.chamferRadius=0.018;frame.path?.flatness=0.003;node(frame,brass,root,0,1.12,-0.30)
            let mirror=SCNShape(path:arch,extrusionDepth:0.008);let reflective=material(UIColor(hex:0xBFCDD0),metal:0.65,rough:0.10,texture:mirrorTexture());let m=node(mirror,reflective,root,0,1.16,-0.257);m.scale=SCNVector3(0.91,0.94,1)
            for x:Float in [-0.58,0.58]{for y:Float in [1.35,1.7,2.05]{let lamp=material(UIColor(hex:0xFFF2CE),rough:0.4);lamp.emission.contents=UIColor(hex:0x66513B);sphere(0.052,lamp,root,x,y,-0.20)}}
            perfume(root,-0.82,1.14,-0.08,UIColor(hex:0xD69D94));perfume(root,-0.66,1.14,0.10,UIColor(hex:0xC4AB73))
            cylinder(0.16,0.025,brass,root,0.73,1.13,0.03)
            for i in 0..<3{lipstick(root,Float(i)*0.10+0.60,1.15,0.03,red)}
        case "shelf":
            box(1.18,2.35,0.64,cream,root,0,1.27,0,0.06)
            // Inset open shelves, not a solid featureless cuboid.
            box(1.02,1.55,0.05,red,root,0,1.60,0.35,0.02)
            for y:Float in [0.8,1.35,1.91,2.4]{box(1.15,0.055,0.72,cream,root,0,y,0.10)}
            for x:Float in [-0.56,0.56]{box(0.07,1.63,0.72,cream,root,x,1.61,0.1)}
            box(1.03,0.53,0.075,pale,root,0,0.47,0.365)
            for x:Float in [-0.26,0.26]{sphere(0.035,brass,root,x,0.48,0.42)}
            for x:Float in [-0.45,0.45]{cylinder(0.035,0.19,brass,root,x,0.10,0.20);cylinder(0.035,0.19,brass,root,x,0.10,-0.20)}
            perfume(root,-0.30,1.95,0.41,UIColor(hex:0xD6B282));perfume(root,0.18,1.95,0.40,UIColor(hex:0xC18B9A));perfume(root,0.36,1.95,0.40,UIColor(hex:0xABBCAE))
            for i in 0..<4{let n=box(0.075,0.32+CGFloat(i%2)*0.07,0.26,i%2==0 ? cream:pale,root,-0.34+Float(i)*0.09,1.55,0.40);n.eulerAngles.z=Float(i==0 ? 0.12:0)}
            cylinder(0.12,0.18,red,root,0.30,1.47,0.40)
            box(0.65,0.20,0.38,pale,root,0,0.93,0.32,0.03);box(0.17,0.04,0.02,brass,root,0,0.95,0.52)
        case "sofa":
            for x:Float in [-0.65,0.65]{for z:Float in [-0.28,0.28]{cylinder(0.04,0.23,wood,root,x,0.14,z)}}
            box(1.75,0.30,0.83,soft,root,0,0.40,0,0.13)
            box(1.6,0.65,0.24,soft,root,0,0.79,-0.33,0.12)
            for x:Float in [-0.77,0.77]{box(0.23,0.52,0.83,soft,root,x,0.66,0,0.115)}
            for x:Float in [-0.36,0.36]{box(0.68,0.17,0.65,soft,root,x,0.59,0.04,0.075)}
            for x:Float in [-0.4,0.4]{let n=box(0.43,0.44,0.15,pale,root,x,0.88,-0.16,0.07);n.eulerAngles.z=x<0 ? 0.18:-0.18;n.eulerAngles.x = -0.18; sphere(0.025,cream,root,x,0.88,-0.065)}
            for x:Float in [-0.5,0,0.5]{sphere(0.018,red,root,x,0.89,-0.195)}
        case "stool":
            cylinder(0.24,0.09,brass,root,0,0.10,0);cylinder(0.255,0.43,soft,root,0,0.32,0)
            cylinder(0.32,0.16,soft,root,0,0.60,0)
            node(SCNTorus(ringRadius:0.30,pipeRadius:0.012),pale,root,0,0.65,0)
            for i in 0..<16{let a=Float(i) * .pi/8;cylinder(0.011,0.35,red,root,sin(a)*0.256,0.32,cos(a)*0.256)}
        case "rug":
            // Soft scalloped edge and woven center.
            let rug=material(UIColor(hex:0xDABAA7),rough:1,texture:fabricTexture(UIColor(hex:0xE4CAB6)))
            let base=cylinder(1.58,0.035,rug,root,0,0.066,0);base.scale.z=0.73
            for i in 0..<30{let a=Float(i)*2 * .pi/30;let petal=cylinder(0.22,0.034,rug,root,cos(a)*1.55,0.065,sin(a)*1.10);petal.scale.z=0.76}
            let center=cylinder(1.43,0.010,material(ivory,texture:fabricTexture(ivory)),root,0,0.089,0);center.scale.z=0.73
            for rad:CGFloat in [1.34,1.38]{let ring=node(SCNTorus(ringRadius:rad,pipeRadius:0.009),pale,root,0,0.098,0);ring.scale.z=0.73}
        case "table":
            for i in 0..<3{let a=Float(i)*2 * .pi/3;rod(SCNVector3(cos(a)*0.33,0.06,sin(a)*0.33),SCNVector3(cos(a)*0.22,0.56,sin(a)*0.22),radius:0.035,mat:wood,parent:root)}
            cylinder(0.49,0.07,material(ivory,rough:0.27,texture:marbleTexture()),root,0,0.59,0)
            box(0.31,0.035,0.23,red,root,-0.08,0.65,0.03);box(0.28,0.025,0.21,cream,root,-0.05,0.68,0.02)
            cylinder(0.06,0.09,cream,root,0.22,0.68,0.05);let handle=node(SCNTorus(ringRadius:0.035,pipeRadius:0.012),cream,root,0.28,0.69,0.05);handle.eulerAngles.x = .pi/2
            cylinder(0.051,0.005,material(UIColor(hex:0x795142)),root,0.22,0.727,0.05)
        case "plant":
            let pot=SCNCone(topRadius:0.22,bottomRadius:0.16,height:0.40);pot.radialSegmentCount=48;node(pot,cream,root,0,0.23,0)
            cylinder(0.195,0.015,material(UIColor(hex:0x685044)),root,0,0.431,0)
            let stem=material(UIColor(hex:0x647150)),leaf=material(UIColor(hex:0x7E926A),rough:0.65)
            for i in 0..<9{
                let a=Float(i)*2.4,h:Float=0.72+Float(i%4)*0.22,x=sin(a)*0.26,z=cos(a)*0.26
                rod(SCNVector3(0,0.4,0),SCNVector3(x,h,z),radius:0.012,mat:stem,parent:root)
                let n=sphere(0.20,leaf,root,x,h,z,SCNVector3(0.50,1.4,0.12));n.eulerAngles=SCNVector3(cos(a)*0.5,a,sin(a)*0.6)
                rod(SCNVector3(x,h-0.17,z),SCNVector3(x,h+0.17,z),radius:0.004,mat:stem,parent:root)
            }
        case "lamp":
            cylinder(0.27,0.055,brass,root,0,0.07,0);cylinder(0.023,1.85,brass,root,0,1.02,0)
            let shade=SCNCone(topRadius:0.18,bottomRadius:0.32,height:0.40);shade.radialSegmentCount=64;node(shade,pale,root,0,1.91,0)
            for i in 0..<36{let a=Float(i)*2 * .pi/36;rod(SCNVector3(cos(a)*0.18,2.11,sin(a)*0.18),SCNVector3(cos(a)*0.32,1.71,sin(a)*0.32),radius:0.005,mat:cream,parent:root)}
            node(SCNTorus(ringRadius:0.32,pipeRadius:0.012),brass,root,0,1.71,0)
        case "lipstick":
            cylinder(0.25,0.65,cream,root,0,0.38,0);cylinder(0.27,0.035,brass,root,0,0.72,0)
            for i in 0..<3{lipstick(root,Float(i-1)*0.12,0.75,0,red)}
        default:break
        }
        return root
    }
    static func lipstick(_ p:SCNNode,_ x:Float,_ y:Float,_ z:Float,_ red:SCNMaterial){let dark=material(UIColor(hex:0x342D2A),rough:0.3);box(0.065,0.12,0.065,dark,p,x,y+0.06,z,0.008);cylinder(0.022,0.10,material(gold,metal:0.7,rough:0.25),p,x,y+0.16,z);let tip=cylinder(0.020,0.075,red,p,x,y+0.23,z);tip.eulerAngles.z=0.07}
    static func perfume(_ p:SCNNode,_ x:Float,_ y:Float,_ z:Float,_ color:UIColor){box(0.16,0.21,0.105,material(color,metal:0.10,rough:0.18),p,x,y+0.105,z,0.025);box(0.10,0.055,0.075,material(gold,metal:0.6,rough:0.25),p,x,y+0.24,z,0.009);box(0.09,0.07,0.006,material(ivory),p,x,y+0.11,z+0.055,0.005)}
    private static var textures:[String:UIImage]=[:]
    static func cached(_ key:String,_ size:CGSize=CGSize(width:512,height:512),_ draw:(CGContext)->Void)->UIImage{if let image=textures[key]{return image};let format=UIGraphicsImageRendererFormat();format.scale=1;let image=UIGraphicsImageRenderer(size:size,format:format).image{draw($0.cgContext)};textures[key]=image;return image}
    static func woodTexture()->UIImage{cached("wood"){c in
        UIColor(hex:0xC3A184).setFill();c.fill(CGRect(x:0,y:0,width:512,height:512))
        for i in 0..<240{let y=CGFloat((i*173)%512),a=CGFloat(i%5+1)*0.009;c.setStrokeColor(UIColor(red:0.35,green:0.23,blue:0.15,alpha:a).cgColor);c.setLineWidth(CGFloat(i%3)+0.4);c.move(to:CGPoint(x:0,y:y));c.addCurve(to:CGPoint(x:512,y:y+CGFloat(i%13-6)),control1:CGPoint(x:130,y:y-6),control2:CGPoint(x:310,y:y+4));c.strokePath()}
    }}
    static func fabricTexture(_ color:UIColor)->UIImage{cached("fabric-"+color.description){c in
        color.setFill();c.fill(CGRect(x:0,y:0,width:512,height:512))
        for i in stride(from:0,to:512,by:3){c.setStrokeColor(UIColor(white:i%2==0 ? 1:0,alpha:0.055).cgColor);c.setLineWidth(1);c.move(to:CGPoint(x:i,y:0));c.addLine(to:CGPoint(x:i,y:512));c.move(to:CGPoint(x:0,y:i));c.addLine(to:CGPoint(x:512,y:i));c.strokePath()}
    }}
    static func marbleTexture()->UIImage{cached("marble"){c in
        ivory.setFill();c.fill(CGRect(x:0,y:0,width:512,height:512))
        for i in 0..<12{c.setStrokeColor(UIColor(hex:0xB8A69C).withAlphaComponent(0.14).cgColor);c.setLineWidth(CGFloat(i%3)+0.3);c.move(to:CGPoint(x:i*72-200,y:0));c.addCurve(to:CGPoint(x:i*72+100,y:512),control1:CGPoint(x:i*60+60,y:160),control2:CGPoint(x:i*70-100,y:300));c.strokePath()}
    }}
    static func mirrorTexture()->UIImage{cached("mirror"){c in
        let colors=[UIColor(hex:0x899FA5).cgColor,UIColor(hex:0xE1DFD4).cgColor,UIColor(hex:0xB2C6C8).cgColor] as CFArray
        c.drawLinearGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:colors,locations:[0,0.55,1])!,start:CGPoint(x:0,y:0),end:CGPoint(x:512,y:512),options:[])
        c.setFillColor(UIColor.white.withAlphaComponent(0.26).cgColor);c.move(to:CGPoint(x:0,y:70));c.addLine(to:CGPoint(x:512,y:390));c.addLine(to:CGPoint(x:512,y:430));c.addLine(to:CGPoint(x:0,y:110));c.fillPath()
    }}
    static func windowTexture()->UIImage{cached("window"){c in
        c.drawLinearGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:[UIColor(hex:0xBED9DD).cgColor,UIColor(hex:0xF7ECDD).cgColor] as CFArray,locations:[0,1])!,start:.zero,end:CGPoint(x:0,y:512),options:[])
        for i in 0..<20{c.setFillColor(UIColor(hex:i%2==0 ? 0xB5C6AD:0x94B39B).cgColor);c.fillEllipse(in:CGRect(x:i*35-60,y:330+(i%4)*28,width:130,height:200))}
    }}
    static func artTexture()->UIImage{cached("art"){c in
        ivory.setFill();c.fill(CGRect(x:0,y:0,width:512,height:512));UIColor(hex:0xA44A54).setFill();c.fillEllipse(in:CGRect(x:95,y:100,width:320,height:320));ivory.setFill();c.fillEllipse(in:CGRect(x:190,y:185,width:130,height:130))
        ("BEAUTY" as NSString).draw(at:CGPoint(x:139,y:34),withAttributes:[.font:UIFont.systemFont(ofSize:35,weight:.medium),.foregroundColor:UIColor(hex:0x7D4C40)])
        ("little rituals, every day" as NSString).draw(at:CGPoint(x:112,y:450),withAttributes:[.font:UIFont.italicSystemFont(ofSize:26),.foregroundColor:UIColor(hex:0x7D4C40)])
    }}
    static func environmentTexture()->UIImage{cached("env",CGSize(width:1024,height:512)){c in
        c.drawLinearGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:[UIColor.white.cgColor,UIColor(hex:0xD4BAA6).cgColor] as CFArray,locations:[0,1])!,start:.zero,end:CGPoint(x:0,y:512),options:[])
        UIColor.white.setFill();c.fill(CGRect(x:200,y:80,width:160,height:260))
    }}
}
extension UIColor {convenience init(hex:UInt32){self.init(red:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:1)}}
