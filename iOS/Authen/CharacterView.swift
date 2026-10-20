import SwiftUI

struct CharacterView: View {
    var pose: String="idle"
    var interactive=true
    var onGlasses: (() -> Void)?
    var onInvite: (() -> Void)?
    @Environment(\.authenReduceMotion) private var reduceMotion
    @State private var gaze=CGPoint.zero
    @State private var drag=CGSize.zero
    @State private var pinch: CGFloat=1
    @State private var blink=false
    @State private var wink=false
    @State private var idle=false
    private var asset:String { pose == "idle" ? "character-gaze" : "character-\(pose)-bust" }
    var body: some View {
        GeometryReader { g in
            ZStack(alignment:.topLeading) {
                Image(asset).resizable().scaledToFit()
                if pose == "idle" {
                    let w=g.size.width
                    let h=w*940/770
                    pupil(x:238/770*w,y:154/940*h,width:w*0.009,height:w*0.012,angle:8)
                    pupil(x:295/770*w,y:138/940*h,width:w*0.009,height:w*0.013,angle:-16)
                    Color.clear.frame(width:w*0.27,height:h*0.12)
                        .contentShape(Rectangle()).position(x:w*0.34,y:h*0.17)
                        .onTapGesture { wink=true;Atelier.tap();onGlasses?();Task {try? await Task.sleep(for:.milliseconds(550));wink=false} }
                        .accessibilityLabel("扶一下眼镜").accessibilityIdentifier("角色眼镜").accessibilityAddTraits(.isButton)
                }
            }
            .frame(width:g.size.width,height:g.size.height,alignment:.top)
            .rotation3DEffect(.degrees(reduceMotion ? 0 : gaze.x*5),axis:(x:0,y:1,z:0),perspective:0.35)
            .rotationEffect(.degrees(reduceMotion ? 0 : gaze.x*2.5 + Double(drag.width)*0.025),anchor:.bottom)
            .scaleEffect(x:reduceMotion ? 1 : min(1.13,max(0.88,pinch+drag.width/900)),y:reduceMotion ? 1 : min(1.15,max(0.86,pinch+drag.height/700)),anchor:.bottom)
            .offset(y:reduceMotion ? 0 : (idle ? -3 : 1))
            .contentShape(Rectangle())
            .gesture(interactive ? DragGesture(minimumDistance:3).onChanged { value in
                drag=value.translation
                gaze=CGPoint(x:max(-1,min(1,(value.location.x/g.size.width-0.5)*2)),y:max(-1,min(1,(value.location.y/g.size.height-0.3)*2)))
            }.onEnded { value in
                Atelier.tap()
                if value.startLocation.x > g.size.width*0.55 && value.translation.width > 65 {onInvite?()}
                withAnimation(Atelier.spring) {drag = .zero;gaze = .zero}
            } : nil)
            .simultaneousGesture(MagnifyGesture().onChanged { value in if interactive {pinch=min(1.17,max(0.84,value.magnification))} }.onEnded { _ in withAnimation(Atelier.spring) {pinch=1};Atelier.tap() })
            .onContinuousHover { phase in
                guard interactive else{return}
                withAnimation(.easeOut(duration:0.18)) {
                    switch phase {case .active(let p):gaze=CGPoint(x:max(-1,min(1,(p.x/g.size.width-0.5)*2)),y:max(-1,min(1,(p.y/g.size.height-0.25)*2)));case .ended:gaze = .zero}
                }
            }
            .accessibilityElement(children:.contain)
            .accessibilityLabel("AUTHEN时尚顾问，可拖动和双指捏合，向右拉手可选图片")
            .accessibilityIdentifier("互动角色")
        }
        .task {
            if !reduceMotion {withAnimation(.easeInOut(duration:3).repeatForever(autoreverses:true)){idle=true}}
            while !Task.isCancelled {
                try? await Task.sleep(for:.seconds(4.1))
                if Task.isCancelled {break}
                blink=true;try? await Task.sleep(for:.milliseconds(130));blink=false
            }
        }
    }
    private func pupil(x:CGFloat,y:CGFloat,width:CGFloat,height:CGFloat,angle:Double)->some View {
        ZStack {
            Ellipse().fill(Atelier.ink).frame(width:width,height:(blink || wink) ? 1 : height)
            if !blink && !wink {Circle().fill(.white).frame(width:1.2,height:1.2).offset(x:0.5,y:-1.4)}
        }.rotationEffect(.degrees(angle)).position(x:x+gaze.x*1.7,y:y+gaze.y*0.9)
            .animation(.easeInOut(duration:0.11),value:blink).allowsHitTesting(false)
    }
}
