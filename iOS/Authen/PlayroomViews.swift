import SwiftUI
import SceneKit

struct PlayroomView:View {
    @Environment(AppStore.self) private var store
    @State private var mode="知识消消乐"
    @State private var selected:Int?
    @State private var matched:Set<Int>=[]
    @State private var feedback="点一个问题，再点对应的小建议"
    @State private var round=0
    @State private var answered:Bool?
    @State private var correct=0
    @State private var finished=false
    let tiles=["敏感肌也能放心冲？","先看看敏感肌的试用反馈","笔记写 10%，瓶身写 2%","先看是不是同一款","这张试色图是 AI 画的？","点开原帖，找找制作说明"]
    let order=[0,3,4,1,2,5]
    var body:some View {
        ScrollView(showsIndicators:false){
            VStack(alignment:.leading,spacing:20){
                HStack{VStack(alignment:.leading,spacing:6){Text("真假游乐场").font(.system(size:24,weight:.bold));Text("首次完成每个挑战，可得 10 片小叶子").font(.system(size:12)).foregroundStyle(Atelier.muted)};Spacer();CuteIcon(name:"game",size:65)}
                Picker("玩法",selection:$mode){Text("知识消消乐").tag("知识消消乐");Text("来源小侦探").tag("来源小侦探")}.pickerStyle(.segmented)
                if mode == "知识消消乐" {matchingGame}else{originGame}
                HStack{CuteIcon(name:"leaf",size:34);Text("已有 \(store.social.leaves) 片小叶子").font(.system(size:14,weight:.medium));Spacer();Button("去装扮 ›"){store.sheet = .room}.font(.system(size:13))}.padding(17).background(Atelier.mint,in:RoundedRectangle(cornerRadius:20))
            }.padding(.horizontal,22).padding(.top,16).padding(.bottom,30)
        }
    }
    private var matchingGame:some View {
        VStack(alignment:.leading,spacing:18){
            HStack{Text("已配对 \(matched.count/2) / 3").font(.system(size:14,weight:.semibold));Spacer();TagPill(text:"+10 小叶子",color:Atelier.mint)}
            LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:12){ForEach(order,id:\.self){i in
                Button{match(i)}label:{VStack(spacing:12){Image(systemName:matched.contains(i) ? "checkmark.seal.fill":i%2==0 ? "quote.bubble":"heart.text.clipboard").font(.system(size:22));Text(tiles[i]).font(.system(size:14,weight:.semibold)).multilineTextAlignment(.center)}.frame(maxWidth:.infinity).frame(height:120).padding(8).background(matched.contains(i) ? Atelier.mint:selected == i ? Atelier.blush:Atelier.white,in:RoundedRectangle(cornerRadius:20)).overlay(RoundedRectangle(cornerRadius:20).stroke(selected == i ? Atelier.red:Atelier.line,lineWidth:selected == i ? 2:1))}.buttonStyle(PressButtonStyle()).disabled(matched.contains(i)).accessibilityIdentifier("配对-\(i)")
            }}
            Text(feedback).font(.system(size:13,weight:.medium)).foregroundStyle(Atelier.red).frame(minHeight:40,alignment:.topLeading).accessibilityIdentifier("游戏反馈")
            if matched.count==6{RedButton(title:"再玩一次"){matched=[];selected=nil;feedback="点一个问题，再点对应的小建议"}}
        }
    }
    private func match(_ i:Int){
        if selected == i {selected=nil;return};guard let first=selected else{selected=i;return};selected=nil
        if first/2 == i/2 {withAnimation{matched.insert(first);matched.insert(i)};Atelier.tap();feedback="配对成功！";if matched.count==6{let earned=store.earn(10,reason:"知识消消乐通关",key:"matching-v1");feedback=earned ? "全部配对成功，10 片小叶子已收好！":"全部配对成功！这一关的奖励已经领过啦。"}}
        else{feedback="还没配上，再选一条小建议试试"}
    }
    private var originGame:some View {
        VStack(alignment:.leading,spacing:16){
            if finished{
                CuteIcon(name:"leaf",size:80).frame(maxWidth:.infinity);Text("答对 \(correct) / 2 题").font(.system(size:26,weight:.bold));Text("像实拍，也可能是 AI 画的。想知道图片怎么来的，可以点开原帖找制作说明。用了 AI，也不代表在骗人。").font(.system(size:14)).lineSpacing(5);Text("这一关的小叶子奖励已领取").font(.system(size:12)).foregroundStyle(Atelier.muted)
            }else{
                Text("第 \(round+1) / 2 张 · 实拍还是 AI 画的？").font(.system(size:14,weight:.semibold))
                Image(round == 0 ? "game-photo":"compact").resizable().scaledToFit().frame(maxWidth:.infinity).frame(height:255).padding(20).background(Atelier.white,in:RoundedRectangle(cornerRadius:24))
                HStack{Button("实拍照片"){answer(false)}.buttonStyle(GameChoice());Button("AI 画的"){answer(true)}.buttonStyle(GameChoice())}.disabled(answered != nil)
                if let answered{
                    Text(answered ? "答对啦":"这张没猜中，看看答案吧").font(.system(size:17,weight:.bold)).foregroundStyle(Atelier.red)
                    Text(round == 0 ? "原图页面写着：这是 stux 拍的照片。我们没看过拍摄过程，目前只能按页面介绍作答。":"这张图是我们用 AI 画的，制作过程有记录。只看画面，很难猜准吧？") .font(.system(size:13)).lineSpacing(4)
                    if round == 0{Link("看看原图介绍 ↗",destination:URL(string:"https://commons.wikimedia.org/wiki/File:Cream_in_round_container.jpg")!).font(.system(size:12))}
                    RedButton(title:round == 0 ? "下一张":"收下小叶子"){if round == 0{round=1;self.answered=nil}else{finished=true;store.earn(10,reason:"来源小侦探完成",key:"origin-v1")}}
                }
            }
        }
    }
    private func answer(_ ai:Bool){guard answered == nil else{return};let good=ai == (round==1);answered=good;if good{correct+=1};Atelier.tap()}
}
struct GameChoice:ButtonStyle{func makeBody(configuration:Configuration)->some View{configuration.label.font(.system(size:14,weight:.semibold)).frame(maxWidth:.infinity).padding(16).background(Atelier.blush,in:Capsule()).opacity(configuration.isPressed ? 0.7:1)}}

struct LeafWalletView:View {
    @Environment(AppStore.self) private var store
    var body:some View{SheetShell(title:"我的小叶子"){VStack(alignment:.leading,spacing:20){
        HStack{VStack(alignment:.leading,spacing:7){Text("\(store.social.leaves)").font(.system(size:55,weight:.bold,design:.rounded)).foregroundStyle(Atelier.red);Text("片小叶子，可以用来装扮小屋").font(.system(size:13))};Spacer();CuteIcon(name:"leaf",size:105)}.padding(22).background(Atelier.mint,in:RoundedRectangle(cornerRadius:24))
        RedButton(title:"去玩一关",icon:"puzzlepiece.extension"){store.sheet = nil;store.tab = .play}
        Button{store.sheet = .room}label:{HStack{CuteIcon(name:"house",size:45);Text("挑选小屋装饰").font(.system(size:15,weight:.semibold));Spacer();Image(systemName:"arrow.up.right")}.padding(16).cuteCard()}
        VStack(alignment:.leading,spacing:8){Text("品牌兑换").font(.system(size:16,weight:.bold));Text("活动尚未开放").font(.system(size:13)).foregroundStyle(Atelier.muted)}.padding(18).frame(maxWidth:.infinity,alignment:.leading).cuteCard()
        Text("小叶子账本").font(.system(size:18,weight:.bold))
        if store.social.ledger.isEmpty{Text("完成挑战后，奖励会记在这里").font(.system(size:13)).foregroundStyle(Atelier.muted)}
        ForEach(store.social.ledger){entry in HStack{VStack(alignment:.leading,spacing:5){Text(entry.title).font(.system(size:14));Text(entry.date,format:.dateTime.month().day()).font(.system(size:11)).foregroundStyle(Atelier.muted)};Spacer();Text(entry.amount>0 ? "+\(entry.amount)":"\(entry.amount)").font(.system(size:20,weight:.bold,design:.rounded)).foregroundStyle(Atelier.red)}.padding(16).cuteCard()}
    }}}
}

