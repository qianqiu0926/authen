import SwiftUI

@main struct AuthenApp:App {
    @State private var store=AppStore()
    var body:some Scene {WindowGroup{RootView().environment(store).preferredColorScheme(.light).tint(Atelier.red)}}
}

struct RootView:View {
    @Environment(AppStore.self) private var store
    @AppStorage("playfulMotion") private var motion=true
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var petLeft=false
    @State private var petY:CGFloat=0
    @GestureState private var petDrag:CGSize = .zero
    var body:some View {
        @Bindable var store=store
        GeometryReader { geo in
            ZStack(alignment:.bottomTrailing) {
                Atelier.paper.ignoresSafeArea()
                VStack(spacing:0) {
                    Group {switch store.tab {case .toolbox:ToolboxView();case .feed:FeedView();case .play:PlayroomView();case .profile:ProfileView()}}
                        .frame(maxWidth:.infinity,maxHeight:.infinity)
                    if store.busy || store.unreadCard || store.error != nil {activityBar}
                    tabBar
                }
                Button {store.sheet = .helper} label:{
                    Image("character-curious-bust").resizable().scaledToFill().frame(width:55,height:62,alignment:.top).clipped()
                        .background(Color(hex:0xFFE0DA),in:RoundedRectangle(cornerRadius:25))
                        .overlay(RoundedRectangle(cornerRadius:25).stroke(.white,lineWidth:3))
                        .shadow(color:Atelier.red.opacity(0.18),radius:8,y:4)
                }.buttonStyle(.plain).accessibilityLabel("红眼镜助手")
                    .offset(x:petLeft ? -geo.size.width+74:0,y:petY)
                    .offset(petDrag).padding(.trailing,10).padding(.bottom,92)
                    .simultaneousGesture(DragGesture(minimumDistance:12).updating($petDrag){v,s,_ in s=v.translation}.onEnded{v in
                        withAnimation(Atelier.spring){petLeft=v.location.x+v.translation.width < -40;petY=max(-geo.size.height+230,min(0,petY+v.translation.height))}
                    })
            }.foregroundStyle(Atelier.ink)
        }
        .environment(\.authenReduceMotion,reduced || !motion)
        .sheet(item:$store.sheet){sheet in
            Group {
                if let kind=sheet.input{IntakeSheet(kind:kind)}
                else {switch sheet {
                case .settings:SettingsView()
                case .samples:SamplesSheet()
                case .card:if let record=store.report{KnowledgeCardView(record:record)}
                case .compose:ComposeView()
                case .post:PostDetailView()
                case .room:DressingRoomView()
                case .wallet:LeafWalletView()
                case .helper:HelperView()
                default:EmptyView()
                }}
            }.environment(store).presentationDragIndicator(.visible).presentationCornerRadius(30).presentationBackground(Atelier.paper)
        }
        .overlay(alignment:.top){if let notice=store.notice {Text(notice).font(.system(size:13,weight:.medium)).padding(.horizontal,18).padding(.vertical,12).background(Atelier.ink,in:Capsule()).foregroundStyle(.white).padding(.top,8).task(id:notice){try? await Task.sleep(for:.seconds(3));store.notice=nil}}}
    }
    private var tabBar:some View {
        HStack(spacing:0){ForEach(MainTab.allCases,id:\.self){tab in
            Button{store.tab=tab;Atelier.tap()}label:{
                VStack(spacing:0){CuteIcon(name:tab == .toolbox ? "box":tab == .feed ? "social":tab == .play ? "game":"notebook",size:34);Text(tab.rawValue).font(.system(size:12,weight:store.tab == tab ? .bold:.medium))}
                    .foregroundStyle(store.tab == tab ? Atelier.red:Atelier.muted).frame(maxWidth:.infinity).padding(.top,7).padding(.bottom,3)
                    .background(store.tab == tab ? Atelier.blush.opacity(0.5):Color.clear,in:RoundedRectangle(cornerRadius:18))
            }.buttonStyle(.plain).accessibilityIdentifier("导航-"+tab.rawValue)
        }}.padding(.horizontal,16).padding(.top,7).background(Atelier.white).overlay(alignment:.top){Rectangle().fill(Atelier.line).frame(height:1)}
    }
    private var activityBar:some View {
        HStack(spacing:10){
            if store.busy{ProgressView().tint(Atelier.red);Text(store.stage).font(.system(size:13));Spacer();Button("取消"){store.cancel()}}
            else if let error=store.error{Text(error).font(.system(size:12)).lineLimit(2);Spacer();Button("重试"){store.begin()};Button{store.error=nil}label:{Image(systemName:"xmark")}}
            else{Image(systemName:"checkmark.circle.fill");Text("资料卡好了").font(.system(size:13));Spacer();Button("打开"){if let r=store.report{store.open(r)}}}
        }.font(.system(size:13,weight:.medium)).padding(14).background(Atelier.blush)
    }
}

struct ToolboxView:View {
    @Environment(AppStore.self) private var store
    var body:some View {
        ScrollView(showsIndicators:false){VStack(alignment:.leading,spacing:22){
            HStack(alignment:.center){VStack(alignment:.leading,spacing:3){Text("AUTHEN CLUB").font(.system(size:10,weight:.bold,design:.rounded)).tracking(2.5).foregroundStyle(Atelier.red);Text("百宝箱").font(.system(size:29,weight:.bold,design:.rounded))};Spacer();LeafPill();Button{store.sheet = .settings}label:{Image(systemName:"slider.horizontal.3").font(.system(size:18)).frame(width:40,height:40).background(.white,in:Circle())}.accessibilityLabel("设置")}
            hero
            VStack(alignment:.leading,spacing:14){
                HStack{Text("想查什么？").font(.system(size:19,weight:.bold));Spacer();Button("试一份示例 ›"){store.sheet = .samples}.font(.system(size:12)).accessibilityIdentifier("试一份示例")}
                LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:10),count:3),spacing:10){
                    ForEach(InputKind.allCases){kind in Button{store.sheet=AppSheet(rawValue:kind.rawValue)}label:{
                        VStack(spacing:2){CuteIcon(name:kind.cuteAsset,size:45);Text(kind.entryTitle).font(.system(size:13,weight:.semibold))}.frame(maxWidth:.infinity).frame(height:84).background(Atelier.white,in:RoundedRectangle(cornerRadius:20)).overlay(RoundedRectangle(cornerRadius:20).stroke(Atelier.line,lineWidth:1))
                    }.buttonStyle(PressButtonStyle()).accessibilityIdentifier("输入"+kind.title)}
                }
            }
            DiscoverySection()
        }.padding(.horizontal,22).padding(.top,12).padding(.bottom,28)}
    }
    private var hero:some View {
        ZStack(alignment:.trailing){
            RoundedRectangle(cornerRadius:28).fill(Atelier.blush)
            Circle().fill(Color(hex:0xF7C9C3)).frame(width:158,height:158).offset(x:23,y:-12)
            Image("character-presenting-bust").resizable().scaledToFit().frame(width:149,height:163).offset(x:17,y:12)
            VStack(alignment:.leading,spacing:8){
                Text("种草之前\n多看一眼。").font(.system(size:24,weight:.bold,design:.rounded)).lineSpacing(3).fixedSize(horizontal:false,vertical:true)
                Text("成分 · 功效 · 图片 · 评论").font(.system(size:11)).foregroundStyle(Atelier.red)
                Button{store.sheet = .text}label:{HStack(spacing:6){Image(systemName:"magnifyingglass");Text("把疑问给我");Image(systemName:"arrow.up.right")}.font(.system(size:12,weight:.semibold)).padding(.horizontal,13).padding(.vertical,11).background(Atelier.red,in:Capsule()).foregroundStyle(.white)}.accessibilityIdentifier("把疑问给我")
            }.frame(maxWidth:.infinity,alignment:.leading).padding(21)
        }.frame(height:178).clipShape(RoundedRectangle(cornerRadius:28)).overlay(alignment:.topTrailing){Text("YOUR BEAUTY BUDDY").font(.system(size:7,weight:.bold)).tracking(1).rotationEffect(.degrees(7)).padding(15)}
    }
}

struct SamplesSheet:View {
    @Environment(AppStore.self) private var store
    var body:some View{SheetShell(title:"先试一份"){VStack(spacing:15){
        Text("下面是我们编写的示例，可以点开试试").font(.system(size:12)).foregroundStyle(Atelier.muted).frame(maxWidth:.infinity,alignment:.leading)
        ForEach([("flagged","7天变白、100%无刺激？","说得这么好，靠谱吗？","image"),("supported","甘油能帮助保湿吗？","看看成分表怎么写","notebook"),("unclear","图片太糊，还能判断吗？","看不清，就先不下结论","video")],id:\.0){item in
            Button{store.sample(item.0)}label:{HStack(spacing:15){CuteIcon(name:item.3,size:60);VStack(alignment:.leading,spacing:7){Text(item.1).font(.system(size:16,weight:.semibold));Text(item.2).font(.system(size:12)).foregroundStyle(Atelier.muted)};Spacer();Image(systemName:"arrow.right")}.padding(16).cuteCard()}.buttonStyle(.plain).accessibilityIdentifier("示例-"+item.0)
        }
    }}}
}

struct HelperView:View {
    @Environment(AppStore.self) private var store
    var body:some View{SheetShell(title:"红眼镜在这里"){VStack(spacing:18){Image("character-curious-bust").resizable().scaledToFit().frame(height:160);Text("给我文字、截图或链接\n一起看看哪里值得留意").font(.system(size:17,weight:.medium)).multilineTextAlignment(.center);HStack{ForEach([InputKind.text,.image,.link]){kind in Button{store.sheet=AppSheet(rawValue:kind.rawValue)}label:{VStack{CuteIcon(name:kind.cuteAsset,size:48);Text(kind.title)}.frame(maxWidth:.infinity).padding(12).cuteCard()}}};Text("可以把我拖到屏幕另一边").font(.system(size:12)).foregroundStyle(Atelier.muted)}}.presentationDetents([.height(470)])}
}
