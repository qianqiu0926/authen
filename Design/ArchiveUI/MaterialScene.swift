import SwiftUI

struct MaterialScene:View {
    let checking:Bool
    @Environment(AppStore.self) private var store
    @Environment(\.authenReduceMotion) private var reduced
    @State private var offset=CGSize.zero
    @State private var fed=false
    var body:some View {
        GeometryReader { geo in
            VStack(spacing:0) {
                HStack(alignment:.bottom) {
                    VStack(alignment:.leading,spacing:5) {
                        Text(checking ? store.stage:"把疑问，\n放进来。").font(.custom("Songti SC",size:checking ? 28:34)).lineSpacing(4)
                        if let m=store.material,m.sample != nil {Text("示例素材").font(.system(size:11)).foregroundStyle(Atelier.muted)}
                    }
                    Spacer()
                    Image(checking ? "character-reading-bust":"character-curious-bust").resizable().scaledToFit().frame(width:125,height:155).rotationEffect(.degrees(4))
                }.padding(.horizontal,29).frame(height:150)
                machineStage(width:geo.size.width,height:max(280,geo.size.height-275))
                if let error=store.error {Text(error).font(.system(size:13)).foregroundStyle(Atelier.red).padding(.horizontal,30).padding(.bottom,9)}
                if checking {
                    HStack(spacing:12) {
                        ForEach(["看看内容","找找疑点","整理好了"],id:\.self) { s in
                            HStack(spacing:4) {Circle().fill(store.stage==s ? Atelier.red:Atelier.gold.opacity(0.4)).frame(width:5,height:5);Text(s).font(.system(size:11)).foregroundStyle(store.stage==s ? Atelier.ink:Atelier.muted)}
                        }
                    }.frame(height:54).padding(.bottom,24)
                } else {
                    HStack(spacing:14) {
                        Button("换一份"){store.sheet=AppSheet(rawValue:store.material?.kind.rawValue ?? "image")}.font(.system(size:14)).foregroundStyle(Atelier.muted).frame(width:70)
                        RedButton(title:store.error == nil ? "放进去":"重试",icon:"arrow.down"){store.begin()}
                    }.padding(.horizontal,29).padding(.bottom,24)
                }
            }.frame(width:geo.size.width,height:geo.size.height)
        }
        .onChange(of:checking,initial:true) {_,value in
            if value {withAnimation(reduced ? .linear(duration:0.1):.easeIn(duration:1.1)){fed=true;offset = .zero}}
            else {fed=false;offset = .zero}
        }
    }
    private func machineStage(width:CGFloat,height:CGFloat)->some View {
        let machineWidth=min(width*0.82,height*0.61)
        let machineHeight=machineWidth*1.02
        let top=max(78,height-machineHeight-12)
        let slot=top+machineHeight*0.13
        let cardW=machineWidth*0.46
        return ZStack(alignment:.topLeading) {
            Image("shredder").resizable().scaledToFit().frame(width:machineWidth,height:machineHeight).position(x:width/2,y:top+machineHeight/2)
            if let material=store.material {
                MaterialCard(material:material).frame(width:cardW,height:cardW*1.28)
                    .rotationEffect(.degrees(checking ? 0:-6+Double(offset.width)*0.025))
                    .scaleEffect(checking && reduced ? 0.8:1)
                    .position(x:width/2+offset.width,y:fed ? slot+cardW*0.8:slot-cardW*0.7+offset.height)
                    .opacity(fed && reduced ? 0:1)
                    .mask(Rectangle().frame(width:width,height:slot+4).position(x:width/2,y:(slot+4)/2))
                    .gesture(DragGesture().onChanged{v in if !checking {offset=v.translation}}.onEnded{v in
                        if !checking && v.translation.height>45 && abs(v.translation.width)<machineWidth*0.35 {store.begin()}
                        else {withAnimation(Atelier.spring){offset = .zero}}
                    })
                    .accessibilityLabel("将素材拖入碎纸机").accessibilityIdentifier("待核验素材")
                    .accessibilityAction(named:Text("放进去")){store.begin()}
            }
            Text("AUTHEN").font(.custom("Didot",size:machineWidth*0.065)).tracking(1.7)
                .position(x:width/2,y:top+machineHeight*0.30).allowsHitTesting(false)
            if checking && !reduced {
                PaperRibbons().frame(width:machineWidth*0.67,height:machineHeight*0.47)
                    .position(x:width/2,y:top+machineHeight*0.69).allowsHitTesting(false)
            }
            if !checking {
                HStack(spacing:6){Image(systemName:"arrow.down").font(.system(size:11));Text("拖进来").font(.system(size:12))}
                    .foregroundStyle(Atelier.red).position(x:width*0.83,y:slot-24).rotationEffect(.degrees(-8)).allowsHitTesting(false)
            }
        }.frame(width:width,height:height)
    }
}

struct MaterialCard:View {
    let material:Material
    var body:some View {
        VStack(alignment:.leading,spacing:6) {
            HStack{Circle().fill(Atelier.red).frame(width:5,height:5);Text(material.sample == nil ? material.kind.title:"示例").font(.system(size:8));Spacer()}
            if let image=material.preview {Image(uiImage:image).resizable().scaledToFit()}
            else {
                Image(systemName:material.kind == .video ? "play.rectangle":material.kind == .link ? "link":"text.alignleft").font(.system(size:24,weight:.light)).padding(.top,8)
                Text(material.kind == .link ? material.link:material.text.isEmpty ? "这段视频":material.text).font(.system(size:10)).lineLimit(5).padding(.top,3)
            }
            Spacer(minLength:0)
        }.padding(10).paperCard()
    }
}

struct PaperRibbons:View {
    var body:some View {
        TimelineView(.animation(minimumInterval:1/30)) { timeline in
            Canvas {context,size in
                let t=timeline.date.timeIntervalSinceReferenceDate
                for i in 0..<8 {
                    let x=CGFloat(i)/8*size.width
                    let y=CGFloat((t*0.65+Double(i)*0.12).truncatingRemainder(dividingBy:1))*size.height
                    var p=Path();p.move(to:CGPoint(x:x,y:-8))
                    p.addCurve(to:CGPoint(x:x+sin(t*2+Double(i))*12,y:y+10),control1:CGPoint(x:x-8,y:y*0.35),control2:CGPoint(x:x+16,y:y*0.85))
                    context.stroke(p,with:.color(i%3==0 ? Atelier.red.opacity(0.8):Atelier.white),style:StrokeStyle(lineWidth:10,lineCap:.round))
                }
            }
        }.clipped()
    }
}
