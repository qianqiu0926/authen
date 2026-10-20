import XCTest
@testable import AUTHEN

private final class ReviewStub:URLProtocol {
    static var handler:((URLRequest)throws->Data)?
    override class func canInit(with request:URLRequest)->Bool {true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest {request}
    override func startLoading(){
        do {
            let data=try Self.handler!(request)
            client?.urlProtocol(self,didReceive:HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json"])!,cacheStoragePolicy:.notAllowed)
            client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)
        }catch{client?.urlProtocol(self,didFailWithError:error)}
    }
    override func stopLoading(){}
}

final class RemoteReviewTests:XCTestCase {
    func testServerReportMapsEvidenceAndDoesNotSendProviderCredentials() async throws {
        let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[ReviewStub.self]
        let session=URLSession(configuration:configuration);defer{session.invalidateAndCancel();ReviewStub.handler=nil}
        ReviewStub.handler={request in
            XCTAssertEqual(request.url?.host,"authen.classby.cn")
            XCTAssertEqual(request.url?.scheme,"https")
            XCTAssertEqual(request.url?.path,"/api/review")
            XCTAssertNil(request.value(forHTTPHeaderField:"Authorization"))
            XCTAssertEqual(request.httpMethod,"POST")
            return Data(#"{"verdict":"flagged","summary":"字幕与说明不一致。","next":"核对产品版本。","scope":"未接入专项检测。","analysisLabel":"DeepSeek 内容分析","evidence":[{"text":"10%","finding":"浓度需要核对","why":"说明写2%。","source":"本次提交的原文","excerpt":"尚未检索独立资料。","seconds":12,"imageIndex":0,"box":[0.1,0.2,0.3,0.1]}]}"#.utf8)
        }
        let material=Material(kind:.text,text:"字幕10%，说明2%。")
        let read=ReadMaterial(text:material.text,lines:[],preview:nil,frameTimes:[],scope:"文字",images:[])
        let report=try await RemoteReview.review(material,read:read,session:session)
        XCTAssertEqual(report.analysisLabel,"DeepSeek 内容分析")
        XCTAssertEqual(report.evidence.first?.seconds,12)
        XCTAssertEqual(report.evidence.first?.quote,"10%")
        XCTAssertFalse(report.isSample)
    }
    func testAdviceCanHaveNoSuspiciousEvidence() async throws {
        let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[ReviewStub.self]
        let session=URLSession(configuration:configuration);defer{session.invalidateAndCancel();ReviewStub.handler=nil}
        ReviewStub.handler={_ in Data(#"{"verdict":"unclear","summary":"把颜色留在唇内侧。","next":"","scope":"技巧建议","analysisLabel":"DeepSeek 内容分析","evidence":[],"answerKind":"advice","tips":["内侧薄涂。","向外晕开。"]}"#.utf8)}
        let m=Material(kind:.text,text:"3CE口红怎么涂？"),read=ReadMaterial(text:"3CE口红怎么涂？",lines:[],preview:nil,frameTimes:[],scope:"文字",images:[])
        let result=try await RemoteReview.review(m,read:read,session:session)
        XCTAssertEqual(result.answerKind,"advice");XCTAssertTrue(result.evidence.isEmpty);XCTAssertEqual(result.tips?.count,2)
    }
    func testOldReportsRemainReadableWithoutProviderField() throws {
        let m=Material(kind:.text,text:"普通体验")
        let read=ReadMaterial(text:m.text,lines:[],preview:nil,frameTimes:[],scope:"文字",images:[])
        let report=ContentReview.review(m,read:read)
        let encoded=try JSONEncoder().encode(report)
        let restored=try JSONDecoder().decode(AnalysisReport.self,from:encoded)
        XCTAssertNil(restored.analysisLabel)
        XCTAssertEqual(restored.id,report.id)
    }
}
