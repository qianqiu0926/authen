import SwiftUI
import UIKit
import AudioToolbox

private struct AuthenReduceMotionKey:EnvironmentKey {static let defaultValue=false}
extension EnvironmentValues {
    var authenReduceMotion:Bool {
        get {self[AuthenReduceMotionKey.self]}
        set {self[AuthenReduceMotionKey.self]=newValue}
    }
}

enum Atelier {
    static let paper = Color(hex: 0xF7F2EB)
    static let ink = Color(hex: 0x191817)
    static let red = Color(hex: 0xB52B32)
    static let gold = Color(hex: 0xBDA486)
    static let muted = Color(hex: 0x756861)
    static let white = Color(hex: 0xFFFCF7)
    static let spring = Animation.spring(response: 0.45, dampingFraction: 0.67)
    static func tap() {
        if UserDefaults.standard.bool(forKey:"sound") {AudioServicesPlaySystemSound(1104)}
        guard UserDefaults.standard.object(forKey: "haptics") as? Bool != false else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255)/255, green: Double((hex >> 8) & 255)/255, blue: Double(hex & 255)/255)
    }
}

struct PaperBackground: View {
    var body: some View {
        GeometryReader { geo in
            Atelier.paper
            Canvas { context, size in
                var line = Path()
                line.move(to: CGPoint(x: -15, y: size.height * 0.36))
                line.addCurve(to: CGPoint(x: size.width * 0.9, y: size.height * 0.13), control1: CGPoint(x: size.width * 1.3,y: 0), control2: CGPoint(x: size.width * 0.25,y: size.height*0.62))
                context.stroke(line, with: .color(Atelier.gold.opacity(0.5)), style: StrokeStyle(lineWidth: 0.8))
                var second = Path()
                second.move(to: CGPoint(x: size.width*0.65,y:size.height))
                second.addCurve(to: CGPoint(x:size.width+40,y:size.height*0.65),control1: CGPoint(x:size.width*0.1,y:size.height*0.66),control2: CGPoint(x:size.width*0.96,y:size.height*0.92))
                context.stroke(second, with: .color(Atelier.gold.opacity(0.32)), style: StrokeStyle(lineWidth: 0.65))
                for i in 0..<160 {
                    let x = CGFloat((i*73+19)%997)/997*size.width
                    let y = CGFloat((i*139+37)%991)/991*size.height
                    context.fill(Path(ellipseIn: CGRect(x:x,y:y,width:1,height:1)), with: .color(Atelier.ink.opacity(0.04)))
                }
            }.allowsHitTesting(false)
        }.ignoresSafeArea()
    }
}

struct RedButton: View {
    let title: String
    var icon: String? = nil
    var action: () -> Void
    var body: some View {
        Button { Atelier.tap(); action() } label: {
            HStack(spacing: 10) {
                Text(title).font(.system(size: 17,weight:.medium))
                if let icon { Image(systemName: icon).font(.system(size: 15,weight:.medium)) }
            }
            .frame(maxWidth:.infinity).frame(height:54)
            .foregroundStyle(Atelier.white)
            .background(Atelier.red, in: Capsule())
            .overlay(Capsule().strokeBorder(Atelier.gold.opacity(0.8),lineWidth:1.2).padding(3))
        }.buttonStyle(PressButtonStyle()).accessibilityIdentifier(title)
    }
}

struct PressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.965 : 1)
            .animation(.spring(response:0.25,dampingFraction:0.65),value:configuration.isPressed)
    }
}

struct RoundButton: View {
    let icon: String
    let label: String
    var action: ()->Void
    var body: some View {
        Button { Atelier.tap(); action() } label: {
            Image(systemName:icon).font(.system(size:19,weight:.light)).foregroundStyle(Atelier.ink)
                .frame(width:46,height:46).background(Atelier.white.opacity(0.55),in:Circle())
        }.buttonStyle(PressButtonStyle()).accessibilityLabel(label).accessibilityIdentifier(label)
    }
}

struct HandUnderline: Shape {
    func path(in r: CGRect)->Path {
        var p=Path();p.move(to:CGPoint(x:2,y:r.height*0.7))
        p.addQuadCurve(to:CGPoint(x:r.width-3,y:r.height*0.2),control:CGPoint(x:r.width*0.45,y:r.height*0.9))
        p.move(to:CGPoint(x:r.width*0.14,y:r.height));p.addLine(to:CGPoint(x:r.width*0.93,y:r.height*0.58));return p
    }
}

struct PaperShape: Shape {
    func path(in rect: CGRect)->Path {
        var p=Path();p.move(to:CGPoint(x:0,y:2));p.addLine(to:CGPoint(x:rect.width,y:0))
        p.addLine(to:CGPoint(x:rect.width,y:rect.height-5))
        for i in stride(from: Int(rect.width),through:0,by:-8) {
            p.addLine(to:CGPoint(x:CGFloat(i),y:rect.height-(i%3==0 ? 3 : 0)))
        }
        p.closeSubpath();return p
    }
}

extension View {
    func paperCard()->some View {
        self.background(Atelier.white,in:PaperShape()).shadow(color:Atelier.ink.opacity(0.09),radius:12,x:0,y:7)
    }
}

extension Atelier {
    static let blush=Color(hex:0xFBE5E0)
    static let mint=Color(hex:0xEAF0DB)
    static let line=Color(hex:0xE9DAD2)
}
extension View {
    func cuteCard()->some View {self.background(Atelier.white,in:RoundedRectangle(cornerRadius:22)).overlay(RoundedRectangle(cornerRadius:22).stroke(Atelier.line,lineWidth:1))}
}
extension InputKind {
    var cuteAsset:String{switch self{case .image:"image";case .video:"video";case .text:"notebook";case .link:"box";case .audio:"audio";case .comments:"social"}}
    var entryTitle:String{switch self{case .image:"图片 / 截图";case .text:"文章 / 文字";case .video:"视频";case .link:"分享链接";case .audio:"音频 / 口播";case .comments:"评论区"}}
}
struct CuteIcon:View {
    var name:String;var size:CGFloat=46
    var body:some View{
        Group{if UIImage(named:"icon-"+name) != nil {Image("icon-"+name).resizable().scaledToFit()}
        else{Image(name == "image" ? "compact":name == "box" ? "perfume":name == "notebook" ? "mascara":"lipstick").resizable().scaledToFit()}}
            .frame(width:size,height:size).accessibilityHidden(true)
    }
}
struct LeafPill:View {
    @Environment(AppStore.self) private var store
    var body:some View{Button{store.sheet = .wallet}label:{HStack(spacing:2){CuteIcon(name:"leaf",size:25);Text("\(store.social.leaves)").font(.system(size:13,weight:.bold,design:.rounded))}.padding(.horizontal,8).padding(.vertical,5).background(Atelier.mint,in:Capsule())}.accessibilityLabel("小叶子 \(store.social.leaves)")}
}
struct FeatureTile:View {
    let title:String;let subtitle:String;let icon:String;let color:Color;var action:()->Void
    var body:some View{Button(action:action){VStack(alignment:.leading,spacing:5){HStack{CuteIcon(name:icon,size:53);Spacer();Image(systemName:"arrow.up.right").font(.system(size:13))};Text(title).font(.system(size:14,weight:.bold));Text(subtitle).font(.system(size:11)).foregroundStyle(Atelier.muted)}.frame(maxWidth:.infinity,alignment:.leading).padding(15).background(color,in:RoundedRectangle(cornerRadius:24))}.buttonStyle(PressButtonStyle()).accessibilityIdentifier(title)}
}
struct SheetShell<Content:View>:View {
    var title:String;@ViewBuilder var content:()->Content
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{ScrollView{content().padding(22)}.background(Atelier.paper).navigationTitle(title).navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.topBarTrailing){Button("完成"){dismiss()}}}}}
}
struct TagPill:View {
    var text:String;var color:Color=Atelier.blush
    var body:some View{Text(text).font(.system(size:10,weight:.medium)).padding(.horizontal,9).padding(.vertical,5).background(color,in:Capsule())}
}
