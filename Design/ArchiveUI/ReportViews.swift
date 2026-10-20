import SwiftUI
import AVKit

struct ReportScene:View {
    let report:AnalysisReport
    @Environment(AppStore.self) private var store
    @Environment(\.authenReduceMotion) private var reduced
    @State private var arrived=false
    @State private var pull:CGFloat=0
    var body:some View {
        GeometryReader { geo in
            VStack(spacing:0) {
                HStack(alignment:.center) {
                    Image(report.verdict == .unclear ? "character-curious-bust":"character-presenting-bust").resizable().scaledToFit().frame(width:130,height:160).offset(y:18)
                    VStack(alignment:.leading,spacing:3) {
                        Text(report.verdict.title).font(.custom("Songti SC Bold",size:43)).foregroundStyle(report.verdict == .supported ? Atelier.ink:Atelier.red).rotationEffect(.degrees(-7)).minimumScaleFactor(0.8).lineLimit(1)
                        HandUnderline().stroke(Atelier.red,style:StrokeStyle(lineWidth:3.5,lineCap:.round)).frame(height:12)
                        Text(report.summary).font(.system(size:12)).foregroundStyle(Atelier.muted).padding(.top,13)
                    }.padding(.trailing,18)
                }.frame(height:166).padding(.horizontal,18)
                ScrollView(showsIndicators:false) {
                    ReportPaper(report:report).padding(24)
                        .rotationEffect(.degrees(reduced ? 0:-3+Double(pull)*0.025))
                        .offset(y:pull).scaleEffect(arrived ? 1:0.85)
                        .opacity(arrived ? 1:0)
                        .gesture(DragGesture(minimumDistance:12).onChanged{v in pull=max(-50,min(55,v.translation.height))}.onEnded{v in if v.translation.height < -35 {store.showDetail=true};withAnimation(Atelier.spring){pull=0}})
                        .onTapGesture {Atelier.tap();store.showDetail=true}
                        .accessibilityElement(children:.combine).accessibilityLabel("核验报告，"+report.verdict.title+"。点击查看依据").accessibilityAddTraits(.isButton).accessibilityIdentifier("核验报告")
                }
                HStack(spacing:14) {
                    Button("再查一份"){store.home()}.font(.system(size:14)).foregroundStyle(Atelier.muted).frame(width:76)
                    RedButton(title:"看依据",icon:"arrow.up.right"){store.showDetail=true}
                }.padding(.horizontal,27).padding(.top,8).padding(.bottom,24)
            }
        }.onAppear {withAnimation(reduced ? .linear(duration:0.15):.spring(response:0.75,dampingFraction:0.62)){arrived=true}}
    }
}

struct ReportPaper:View {
    let report:AnalysisReport
    var body:some View {
        VStack(alignment:.leading,spacing:18) {
            HStack(alignment:.firstTextBaseline){Text("AUTHEN").font(.custom("Didot",size:28));Spacer();Text(report.isSample ? "示例":report.analysisLabel ?? "本机初查").font(.system(size:10)).padding(.horizontal,8).padding(.vertical,4).overlay(Capsule().stroke(Atelier.ink,lineWidth:0.6))}
            Rectangle().fill(Atelier.gold).frame(height:0.7)
            HStack(alignment:.top,spacing:13) {
                if let data=report.preview,let image=UIImage(data:data){Image(uiImage:image).resizable().scaledToFill().frame(width:76,height:90).clipped()}
                VStack(alignment:.leading,spacing:8){Text(report.title).font(.system(size:11)).foregroundStyle(Atelier.muted);Text(report.originalText.isEmpty ? "这份素材里，还需要更多信息。":String(report.originalText.prefix(74))).font(.system(size:14)).lineSpacing(4).lineLimit(4)}
            }
            ForEach(report.evidence.prefix(3)) {item in
                HStack(alignment:.top,spacing:10) {
                    Circle().fill(Atelier.red).frame(width:6,height:6).padding(.top,7)
                    VStack(alignment:.leading,spacing:7){Text("“"+item.quote+"”").font(.system(size:17,weight:.medium)).foregroundStyle(Atelier.red).lineLimit(2);Text(item.finding).font(.system(size:12)).foregroundStyle(Atelier.muted)}
                }
            }
            Rectangle().fill(Atelier.gold.opacity(0.6)).frame(height:0.6)
            HStack {Text(report.createdAt,format:.dateTime.month().day()).font(.system(size:10)).foregroundStyle(Atelier.muted);Spacer();Image(systemName:report.verdict.symbol).font(.system(size:29,weight:.ultraLight)).foregroundStyle(Atelier.red).rotationEffect(.degrees(-12))}
        }.padding(22).paperCard()
    }
}

struct ReportDetail:View {
    let report:AnalysisReport
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var selected=0
    @State private var source:Evidence?
    @State private var zoom=false
    @State private var exporting=false
    @State private var shareURL:URL?
    @State private var exportError:String?
    @State private var player:AVPlayer?
    var current:Evidence {report.evidence[min(selected,max(0,report.evidence.count-1))]}
    var imageData:Data? {
        if let idx=current.imageIndex,report.images.indices.contains(idx) {return report.images[idx]}
        return report.preview
    }
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    HStack {Text(report.verdict.title).font(.custom("Songti SC Bold",size:36)).foregroundStyle(Atelier.red);Spacer();if report.isSample {Text("示例").font(.system(size:12)).foregroundStyle(Atelier.muted)}}
                    if let imageData,let image=UIImage(data:imageData) {
                        AnnotatedImage(image:image,box:current.box).frame(maxWidth:.infinity).onTapGesture{zoom=true}.accessibilityLabel("原图，点击放大").accessibilityIdentifier("证据原图")
                    } else {
                        Text(report.originalText).font(.system(size:16)).lineSpacing(8).frame(maxWidth:.infinity,alignment:.leading).padding(20).paperCard()
                    }
                    if let name=report.videoFileName {
                        let url=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent(name)
                        VideoPlayer(player:player).frame(height:215).clipShape(RoundedRectangle(cornerRadius:10)).onAppear{player=AVPlayer(url:url)}.onDisappear{player?.pause()}
                    }
                    if report.evidence.count>1 {
                        ScrollView(.horizontal,showsIndicators:false) {
                            HStack(spacing:10) {ForEach(Array(report.evidence.enumerated()),id:\.element.id){idx,item in
                                Button {selected=idx;Atelier.tap();if let sec=item.seconds {player?.seek(to:CMTime(seconds:sec,preferredTimescale:600))}} label:{Text("\(idx+1) · "+String(item.quote.prefix(9))).font(.system(size:13)).padding(.horizontal,15).padding(.vertical,11).background(selected==idx ? Atelier.red:Atelier.white,in:Capsule()).foregroundStyle(selected==idx ? Atelier.white:Atelier.ink)}.accessibilityIdentifier("疑点\(idx+1)")
                            }}
                        }
                    }
                    VStack(alignment:.leading,spacing:17) {
                        Text("这句话").font(.system(size:13)).foregroundStyle(Atelier.muted)
                        Text("“"+current.quote+"”").font(.custom("Songti SC",size:26)).foregroundStyle(Atelier.red)
                        Text(current.finding).font(.system(size:18,weight:.medium))
                        Text(current.explanation).font(.system(size:15)).lineSpacing(6)
                        if let sec=current.seconds {Text("视频 \(Int(sec/60)):\(String(format:"%02d",Int(sec)%60))").font(.system(size:12)).foregroundStyle(Atelier.muted)}
                        Button {source=current} label:{HStack{Image(systemName:"link");Text("查看出处");Spacer();Image(systemName:"arrow.up.right")}.font(.system(size:14)).foregroundStyle(Atelier.ink).padding(14).overlay(RoundedRectangle(cornerRadius:8).stroke(Atelier.gold.opacity(0.6),lineWidth:0.7))}.accessibilityIdentifier("查看出处")
                    }.padding(23).paperCard().rotationEffect(.degrees(-0.8))
                    VStack(alignment:.leading,spacing:10){Text("接下来").font(.system(size:18,weight:.medium));Text(report.nextStep).font(.system(size:15)).lineSpacing(6)}.padding(.horizontal,4)
                    DisclosureGroup("这次查了什么") {Text(report.scope).font(.system(size:12)).foregroundStyle(Atelier.muted).lineSpacing(5).padding(.top,8)}.font(.system(size:13))
                    HStack(spacing:12) {
                        if let shareURL {ShareLink(item:shareURL){Label("分享报告",systemImage:"square.and.arrow.up").font(.system(size:14)).padding(17).background(Atelier.white,in:Capsule())}.accessibilityIdentifier("分享报告")}
                        else {Button {exportReport()} label:{Label(exporting ? "正在保存":"保存报告",systemImage:"square.and.arrow.up").font(.system(size:14)).padding(17).background(Atelier.white,in:Capsule())}.disabled(exporting).accessibilityIdentifier("保存报告")}
                        RedButton(title:"补充资料"){dismiss();store.prepareSupplement(report)}
                    }
                    if let exportError{Text(exportError).font(.system(size:12)).foregroundStyle(Atelier.red)}
                }.padding(23).padding(.bottom,22)
            }.background(Atelier.paper).navigationTitle("看依据").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.topBarTrailing){Button("完成"){dismiss()}}}
                .sheet(item:$source){item in SourceSheet(item:item)}
                .fullScreenCover(isPresented:$zoom){if let imageData,let image=UIImage(data:imageData){ImageZoom(image:image)}}
        }
    }
    private func exportReport() {exporting=true;defer{exporting=false};do {shareURL=try ReportExporter.pdf(report)}catch{exportError="报告没能保存，再试一次。"}}
}

struct AnnotatedImage:View {
    let image:UIImage
    let box:[Double]?
    var body:some View {
        Image(uiImage:image).resizable().scaledToFit().overlay {
            GeometryReader {g in
                if let b=box,b.count==4 {
                    RoundedRectangle(cornerRadius:8).stroke(Atelier.red,style:StrokeStyle(lineWidth:2.5,lineCap:.round))
                        .frame(width:max(20,b[2]*g.size.width),height:max(18,b[3]*g.size.height))
                        .position(x:(b[0]+b[2]/2)*g.size.width,y:(b[1]+b[3]/2)*g.size.height)
                }
            }
        }.clipShape(RoundedRectangle(cornerRadius:8))
    }
}

struct SourceSheet:View {
    let item:Evidence
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        VStack(alignment:.leading,spacing:23) {
            Text("查到的资料").font(.custom("Songti SC",size:29)).padding(.top,28)
            Text(item.sourceTitle).font(.system(size:18,weight:.medium))
            Text(item.sourceExcerpt ?? item.explanation).font(.system(size:16)).lineSpacing(7)
            if let s=item.sourceURL,let url=URL(string:s),["http","https"].contains(url.scheme ?? "") {Link(destination:url){Label("打开原网页",systemImage:"arrow.up.right").font(.system(size:16)).foregroundStyle(Atelier.red)}}
            Spacer(minLength:5)
            RedButton(title:"知道了"){dismiss()}
        }.padding(28).presentationDetents([.medium,.large]).presentationBackground(Atelier.paper)
    }
}

struct ImageZoom:View {
    let image:UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale:CGFloat=1
    @State private var previous:CGFloat=1
    @State private var offset=CGSize.zero
    var body:some View {
        ZStack(alignment:.topTrailing) {
            Color.black.ignoresSafeArea()
            Image(uiImage:image).resizable().scaledToFit().scaleEffect(scale).offset(offset)
                .frame(maxWidth:.infinity,maxHeight:.infinity)
                .gesture(MagnifyGesture().onChanged{v in scale=max(1,min(5,previous*v.magnification))}.onEnded{_ in previous=scale})
                .simultaneousGesture(DragGesture().onChanged{offset=$0.translation}.onEnded{_ in if scale<=1{withAnimation{offset = .zero}}})
                .onTapGesture(count:2){withAnimation{scale=scale>1 ? 1:2;previous=scale;offset = .zero}}
            Button{dismiss()}label:{Image(systemName:"xmark").foregroundStyle(.white).padding(20).background(.black.opacity(0.5),in:Circle())}.padding(18).accessibilityLabel("关闭原图")
        }
    }
}

enum ReportExporter {
    static func pdf(_ report:AnalysisReport)throws->URL {
        let url=FileManager.default.temporaryDirectory.appendingPathComponent("AUTHEN-\(report.id.uuidString.prefix(8)).pdf")
        let renderer=UIGraphicsPDFRenderer(bounds:CGRect(x:0,y:0,width:595,height:842))
        try renderer.writePDF(to:url){context in
            var y:CGFloat=0
            func page(){context.beginPage();UIColor(red:0.97,green:0.95,blue:0.92,alpha:1).setFill();context.cgContext.fill(CGRect(x:0,y:0,width:595,height:842));y=42}
            func write(_ text:String,_ size:CGFloat=13,_ bold:Bool=false){
                let attrs:[NSAttributedString.Key:Any]=[.font:bold ? UIFont.boldSystemFont(ofSize:size):UIFont.systemFont(ofSize:size),.foregroundColor:UIColor.black]
                let s=NSAttributedString(string:text,attributes:attrs)
                let h=s.boundingRect(with:CGSize(width:511,height:10000),options:[.usesLineFragmentOrigin,.usesFontLeading],context:nil).height+12
                if h>700 && text.count>1 {
                    let mid=text.index(text.startIndex,offsetBy:text.count/2)
                    write(String(text[..<mid]),size,bold);write(String(text[mid...]),size,bold);return
                }
                if y+h>790 {page()}
                s.draw(in:CGRect(x:42,y:y,width:511,height:h));y+=h
            }
            page();write("AUTHEN",32,true);write(report.isSample ? "核验报告 · 示例":"核验报告",12);write(report.verdict.title,24,true);write(report.summary,15)
            if let data=report.preview,let image=UIImage(data:data) {let ratio=min(180/image.size.width,180/image.size.height);image.draw(in:CGRect(x:42,y:y,width:image.size.width*ratio,height:image.size.height*ratio));y+=image.size.height*ratio+18}
            write("原文",15,true);write(report.originalText)
            for item in report.evidence {write("“\(item.quote)”",17,true);write(item.finding);write(item.explanation);write("来源："+item.sourceTitle,11);if let excerpt=item.sourceExcerpt {write(excerpt,11)};if let source=item.sourceURL {write(source,10)}}
            write("接下来",16,true);write(report.nextStep);write("检查范围",14,true);write(report.scope,11);write(report.createdAt.formatted(date:.numeric,time:.shortened),10)
        }
        return url
    }
}
