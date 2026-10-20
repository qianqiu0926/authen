import SwiftUI

struct SettingsView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("playfulMotion") private var motion=true
    @AppStorage("haptics") private var haptics=true
    @AppStorage("sound") private var sound=false
    @AppStorage("videoSpeech") private var speech=true
    @State private var confirmDelete=false
    @AppStorage("deepseekEnabled") private var deepseekEnabled=true
    var body:some View {
        NavigationStack {
            Form {
                Section {
                    HStack{Image("character-curious-bust").resizable().scaledToFit().frame(width:75,height:90);VStack(alignment:.leading,spacing:7){Text("AUTHEN").font(.custom("Didot",size:31));Text("美妆内容，查个明白").font(.system(size:12)).foregroundStyle(Atelier.muted)}}
                }.listRowBackground(Atelier.white)
                Section("体验") {
                    Toggle("角色与纸张动效",isOn:$motion).accessibilityIdentifier("动效开关")
                    Toggle("轻触反馈",isOn:$haptics)
                    Toggle("轻声提示",isOn:$sound)
                }.listRowBackground(Atelier.white)
                Section {
                    Toggle("用 AI 帮我看内容",isOn:$deepseekEnabled)
                } footer:{Text("开启后，文字、图片和视频中的部分画面会发给 DeepSeek。声音会先转成文字。暂时不能判断图片修没修、声音是不是合成的。关闭后，只在手机里找常见夸大说法。")}
                Section {
                    Toggle("读取视频口播",isOn:$speech)
                } footer:{Text("开启后，也会看看视频里说了什么。转成文字时可能听错，可以回听原音。关闭后只看画面和字幕。")}
                Section("资料") {
                    HStack{Text("本机资料卡");Spacer();Text("\(store.reports.count)份").foregroundStyle(Atelier.muted)}
                    Button("删除所有资料卡和保存的文件",role:.destructive){confirmDelete=true}.accessibilityIdentifier("删除全部记录")
                    DisclosureGroup("能帮我看什么") {
                        Text("帮你找出笔记里对不上的数字、说得太满的功效，也会参考部分公开护肤资料。暂时不能鉴别商品真假、图片修没修或声音是不是合成的，也没有品牌内部资料。AI 用不了时，只在手机里找常见夸大说法。资料卡保存在本机；示例内容由团队编写。")
                            .font(.system(size:13)).lineSpacing(5)
                    }
                }.listRowBackground(Atelier.white)
                Section {Text("AUTHEN  /  01").font(.custom("Didot",size:16)).foregroundStyle(Atelier.muted).frame(maxWidth:.infinity)}.listRowBackground(Color.clear)
            }.scrollContentBackground(.hidden).background(Atelier.paper).navigationTitle("设置").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.topBarTrailing){Button("完成"){dismiss()}}}
                .confirmationDialog("删除所有资料卡和保存的图片、音视频？",isPresented:$confirmDelete,titleVisibility:.visible){Button("全部删除",role:.destructive){store.deleteAll()};Button("取消",role:.cancel){}}
        }.presentationDetents([.large])
    }
}
