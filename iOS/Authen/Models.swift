import Foundation
import UIKit

enum InputKind: String, Codable, CaseIterable, Identifiable {
    case image, video, text, link, audio, comments
    var id: String { rawValue }
    var title: String { switch self { case .image: "图片"; case .video: "视频"; case .text: "文字"; case .link: "链接"; case .audio: "音频"; case .comments: "评论" } }
    var asset: String { switch self { case .image:"lipstick"; case .video:"compact"; case .text:"mascara"; case .link:"perfume"; case .audio:"icon-audio"; case .comments:"icon-social" } }
}

enum Verdict: String, Codable {
    case flagged, supported, unclear
    var title: String { switch self { case .flagged:"这几处要留意"; case .supported:"说法对得上"; case .unclear:"还看不出来" } }
    var symbol: String { switch self { case .flagged:"questionmark"; case .supported:"checkmark"; case .unclear:"ellipsis" } }
}

struct Material {
    var id=UUID()
    var kind: InputKind
    var text=""
    var images: [Data]=[]
    var videoURL: URL?
    var link: String=""
    var sample: String?
    var preview: UIImage? { images.first.flatMap(UIImage.init(data:)) }
    var title: String { sample != nil ? "美妆笔记 · 示例" : kind == .link ? "分享的内容" : "我的"+kind.title }
}

struct Evidence: Codable, Identifiable, Equatable {
    var id=UUID()
    var quote: String
    var finding: String
    var explanation: String
    var sourceTitle: String
    var sourceURL: String?
    var sourceExcerpt: String?
    var box: [Double]?
    var seconds: Double?
    var imageIndex: Int?
}

struct AnalysisReport: Codable, Identifiable {
    var id=UUID()
    var createdAt=Date()
    var kind: InputKind
    var title: String
    var verdict: Verdict
    var summary: String
    var originalText: String
    var evidence: [Evidence]
    var nextStep: String
    var scope: String
    var isSample: Bool
    var preview: Data?
    var sourceLink: String?
    var coveredFrames: [Double] = []
    var images: [Data] = []
    var videoFileName: String?
    var analysisLabel: String?
    var references: [CardReference]?
    var saved: Bool?
    var answerKind:String?
    var tips:[String]?
    var numbers: [CardNumber]?
}

struct RecognizedLine {
    var text: String
    var box: [Double]?
    var imageIndex: Int?
    var seconds: Double?
}

enum AppSheet: String, Identifiable {
    case image, video, text, link, audio, comments, samples, settings, card, compose, room, wallet, helper, post
    var id: String { rawValue }
    var input: InputKind? { InputKind(rawValue:rawValue) }
}

enum AuthenError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let s)=self { return s };return nil }
}

struct CardReference: Codable, Identifiable {
    var id: String
    var title: String
    var url: String
    var excerpt: String
    var retrievedAt: String
}
enum MainTab: String, CaseIterable { case toolbox="百宝箱", feed="动态", play="游乐场", profile="我的" }
struct SocialComment: Codable, Identifiable {
    var id=UUID(); var author="我"; var text:String; var date=Date()
}
struct BeautyPost: Codable, Identifiable {
    var id=UUID(); var author:String; var title:String; var text:String
    var category:String; var asset:String?; var image:Data?; var createdAt=Date()
    var sourceURL:String?; var sourceTitle:String?; var importedAt:Date?; var sourceAuthor:String?
    var isExample=false; var isMine=false; var liked=false; var bookmarked=false
    var comments:[SocialComment]=[]
    var platform:String?; var sourceID:String?; var publishedAt:String?; var duration:String?
    var learningFocus:String?; var watchPoints:[String]?
}
struct LeafEntry: Codable, Identifiable {var id=UUID();var title:String;var amount:Int;var date=Date()}
struct CommunityState: Codable {
    var posts:[BeautyPost]=[];var leaves=0;var ledger:[LeafEntry]=[];var rewards:[String]=[]
    var roomItems:[String]=[];var style="樱桃红";var profileConsent=false
    var roomLayout:RoomLayout?
}

struct CardNumber: Codable, Identifiable {var label:String;var value:String;var quote:String;var id:String{label+value}}
