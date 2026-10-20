import XCTest
import UIKit
@testable import AUTHEN

final class ContentReviewTests:XCTestCase {
    private func read(_ text:String)->ReadMaterial {ReadMaterial(text:text,lines:[],preview:nil,frameTimes:[],scope:"文字",images:[])}
    func testOrdinaryTextDoesNotBecomeCertifiedTrue() {
        let material=Material(kind:.text,text:"这瓶乳液今天用起来很滋润。")
        let result=ContentReview.review(material,read:read(material.text))
        XCTAssertEqual(result.verdict,.unclear)
        XCTAssertFalse(result.isSample)
        XCTAssertFalse(result.evidence.isEmpty)
    }
    func testQuotedPromiseIsPreservedAndTraceable() {
        let material=Material(kind:.text,text:"敏感肌试试，7天变白，100%无刺激。")
        let result=ContentReview.review(material,read:read(material.text))
        XCTAssertEqual(result.verdict,.flagged)
        XCTAssertTrue(result.evidence.contains{$0.quote=="7天变白"})
        XCTAssertTrue(result.evidence.contains{$0.quote=="100%"})
        XCTAssertTrue(result.evidence.allSatisfy{!$0.explanation.isEmpty && !$0.sourceTitle.isEmpty})
    }
    func testUnrelatedDigitsDoNotTriggerTimePromise() {
        let material=Material(kind:.text,text:"我在7天前买了这瓶保湿乳，今天第一次用。")
        XCTAssertEqual(ContentReview.review(material,read:read(material.text)).verdict,.unclear)
    }
    func testRepeatedCommentsReportOnlySubmittedSample() {
        let text=Array(repeating:"真的特别好用会一直回购",count:3).joined(separator:"\n")
        let report=ContentReview.review(Material(kind:.text,text:text),read:read(text))
        XCTAssertEqual(report.verdict,.flagged)
        XCTAssertTrue(report.evidence[0].finding.contains("3次"))
        XCTAssertTrue(report.evidence[0].explanation.contains("还不能说是水军"))
    }
    func testDemoAlwaysDisclosesItsSource() {
        let report=ContentReview.review(Material(kind:.image,text:"含甘油",sample:"supported"),read:read("含甘油"))
        XCTAssertEqual(report.verdict,.supported)
        XCTAssertTrue(report.isSample)
        XCTAssertTrue(report.scope.contains("不对应真实品牌"))
    }
    func testRepeatedVideoFramesAreNotCalledRepeatedComments() {
        let text=Array(repeating:"这个保湿乳使用起来很舒服",count:4).joined(separator:"\n")
        let report=ContentReview.review(Material(kind:.video),read:read(text))
        XCTAssertEqual(report.verdict,.unclear)
    }
    @MainActor func testActualImageOCRAndLocation() async throws {
        let renderer=UIGraphicsImageRenderer(size:CGSize(width:800,height:600))
        let image=renderer.image{ context in
            UIColor.white.setFill();context.fill(CGRect(x:0,y:0,width:800,height:600))
            ("100% no irritation" as NSString).draw(at:CGPoint(x:40,y:100),withAttributes:[.font:UIFont.systemFont(ofSize:48),.foregroundColor:UIColor.black])
        }
        let data=try XCTUnwrap(image.pngData())
        let material=Material(kind:.image,images:[data])
        let content=try await MediaReader.read(material)
        XCTAssertTrue(content.text.contains("100%"))
        let report=ContentReview.review(material,read:content)
        XCTAssertEqual(report.verdict,.flagged)
        XCTAssertNotNil(report.evidence[0].box)
        XCTAssertEqual(report.evidence[0].imageIndex,0)

    }
    func testActualVideoFramesAndLocations() async throws {
        let old=UserDefaults.standard.object(forKey:"videoSpeech")
        UserDefaults.standard.set(false,forKey:"videoSpeech")
        defer {if let old{UserDefaults.standard.set(old,forKey:"videoSpeech")}else{UserDefaults.standard.removeObject(forKey:"videoSpeech")}}

        let url=try XCTUnwrap(Bundle(for:Self.self).url(forResource:"claim",withExtension:"mp4"))
        let content=try await MediaReader.read(Material(kind:.video,videoURL:url))
        XCTAssertEqual(content.frameTimes.count,2)
        XCTAssertEqual(content.images.count,2)
        XCTAssertTrue(content.text.contains("100%"))
        let report=ContentReview.review(Material(kind:.video,videoURL:url),read:content)
        XCTAssertEqual(report.verdict,.flagged)
        XCTAssertNotNil(report.evidence.first?.seconds)
        XCTAssertNotNil(report.evidence.first?.imageIndex)
    }
    func testActualAudioTranscriptAndTimestamps() async throws {
        let url=try XCTUnwrap(Bundle(for:Self.self).url(forResource:"beauty-audio",withExtension:"wav"))
        let read=try await MediaReader.read(Material(kind:.audio,videoURL:url))
        XCTAssertTrue(read.text.contains("30") || read.text.contains("三十"))
        XCTAssertFalse(read.lines.isEmpty)
        XCTAssertTrue(read.lines.allSatisfy{$0.seconds != nil && $0.box == nil && $0.imageIndex == nil})
        XCTAssertTrue(read.images.isEmpty)
    }
    @MainActor func testSupplementKeepsOriginalAndDoesNotMixDemo() {
        let store=AppStore()
        let original=ContentReview.review(Material(kind:.text,text:"7天变白"),read:read("7天变白"))
        store.supplementing=original
        store.accept(Material(kind:.image,text:"补充的说明"))
        XCTAssertEqual(store.material?.text,"7天变白\n补充的说明")
        store.cancel()
        let second=AppStore()
        second.supplementing=ContentReview.review(Material(kind:.image,sample:"flagged"),read:read("演示文字"))
        second.accept(Material(kind:.image,text:"我的内容"))
        XCTAssertEqual(second.material?.text,"我的内容")
        XCTAssertNil(second.material?.sample)
        second.cancel()
    }
}
