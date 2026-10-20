import Foundation

struct RoomPiece: Codable, Identifiable, Equatable {
    var id:String; var kind:String; var x:Float; var z:Float; var angle:Float=0
    var visible=true
    var spec:RoomFurniture { RoomFurniture.catalog.first{$0.id == kind}! }
}
struct RoomLayout:Codable,Equatable {
    var style="樱桃红"
    var pieces:[RoomPiece]
    static let initial=RoomLayout(pieces:[
        RoomPiece(id:"vanity",kind:"vanity",x:-0.7,z:-2.08),
        RoomPiece(id:"shelf",kind:"shelf",x:2.12,z:-2.11),
        RoomPiece(id:"sofa",kind:"sofa",x:-2.55,z:0.25,angle:90),
        RoomPiece(id:"stool",kind:"stool",x:-0.7,z:-0.94),
        RoomPiece(id:"rug",kind:"rug",x:0,z:0.65),
        RoomPiece(id:"table",kind:"table",x:0.32,z:0.9),
        RoomPiece(id:"plant",kind:"plant",x:2.50,z:1.65),
        RoomPiece(id:"lamp",kind:"lamp",x:-2.5,z:1.94)
    ])
    /// Keep rotated furniture entirely within the floor. Rugs can sit under furniture.
    static func bounded(_ piece:RoomPiece)->RoomPiece {
        var p=piece
        p.angle=(p.angle.truncatingRemainder(dividingBy:360)+360).truncatingRemainder(dividingBy:360)
        let a=p.angle * .pi/180, s=p.spec
        let halfX=(abs(cos(a))*s.width+abs(sin(a))*s.depth)/2
        let halfZ=(abs(sin(a))*s.width+abs(cos(a))*s.depth)/2
        p.x=min(3.13-halfX,max(-3.13+halfX,p.x))
        p.z=min(2.53-halfZ,max(-2.53+halfZ,p.z))
        return p
    }
    func overlaps(_ piece:RoomPiece)->Bool {
        guard piece.kind != "rug" else{return false}
        func extents(_ p:RoomPiece)->(Float,Float){let a=p.angle * .pi/180;return ((abs(cos(a))*p.spec.width+abs(sin(a))*p.spec.depth)/2,(abs(sin(a))*p.spec.width+abs(cos(a))*p.spec.depth)/2)}
        let a=extents(piece)
        return pieces.contains { other in
            guard other.id != piece.id,other.visible,other.kind != "rug" else{return false}
            let b=extents(other)
            return abs(piece.x-other.x)<a.0+b.0-0.06 && abs(piece.z-other.z)<a.1+b.1-0.06
        }
    }
}
struct RoomFurniture:Identifiable {
    let id:String;let title:String;let symbol:String;let width:Float;let depth:Float
    static let catalog:[RoomFurniture]=[
        .init(id:"vanity",title:"梳妆台",symbol:"rectangle.inset.filled",width:2.15,depth:0.84),
        .init(id:"shelf",title:"香氛架",symbol:"cabinet",width:1.22,depth:0.72),
        .init(id:"sofa",title:"小沙发",symbol:"sofa",width:1.8,depth:0.95),
        .init(id:"stool",title:"绒面凳",symbol:"chair",width:0.70,depth:0.70),
        .init(id:"rug",title:"花瓣地毯",symbol:"oval",width:3.6,depth:2.7),
        .init(id:"table",title:"小圆桌",symbol:"circle",width:1.0,depth:1.0),
        .init(id:"plant",title:"绿植",symbol:"leaf",width:0.65,depth:0.65),
        .init(id:"lamp",title:"落地灯",symbol:"lamp.floor",width:0.62,depth:0.62),
        .init(id:"lipstick",title:"口红展台",symbol:"sparkles",width:0.55,depth:0.55)
    ]
}
