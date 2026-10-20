import XCTest

final class AuthenUITests:XCTestCase {
    @MainActor private func capture(_ app:XCUIApplication,_ name:String){let shot=XCTAttachment(screenshot:app.screenshot());shot.name=name;shot.lifetime = .keepAlways;add(shot)}
    @MainActor private func scrollTo(_ element:XCUIElement,in app:XCUIApplication){for _ in 0..<6{if element.isHittable{return};app.swipeUp()}}
    @MainActor func testConsumerJourney() throws {
        let app=XCUIApplication();app.launchArguments=["--reset-history","--reset-community"];app.launch()
        XCTAssertTrue(app.buttons["导航-百宝箱"].waitForExistence(timeout:8));capture(app,"V3-01-百宝箱")
        for name in ["文字","图片","视频","音频","评论","链接"]{XCTAssertTrue(app.buttons["输入"+name].exists)}
        app.buttons["试一份示例"].tap();app.buttons["示例-flagged"].tap()
        XCTAssertTrue(app.staticTexts["资料卡结论"].waitForExistence(timeout:25));capture(app,"V3-02-资料卡")
        let save=app.buttons["收藏资料卡"];scrollTo(save,in:app);XCTAssertTrue(save.isHittable);save.tap();XCTAssertTrue(app.buttons["已收藏"].exists)
        app.buttons["完成"].tap();app.buttons["导航-我的"].tap();XCTAssertTrue(app.buttons.matching(NSPredicate(format:"identifier BEGINSWITH %@","资料卡-")).firstMatch.exists);capture(app,"V3-03-我的知识库")
        app.buttons["导航-动态"].tap();capture(app,"V3-04-动态")
        app.buttons["发动态"].tap();let title=app.textFields["动态标题"];XCTAssertTrue(title.waitForExistence(timeout:4));title.tap();title.typeText("My beauty notes")
        let body=app.textViews["动态正文"];body.tap();body.typeText("I check the original source before sharing beauty claims.")
        app.swipeUp();let publish=app.buttons["发布动态"];scrollTo(publish,in:app);publish.tap()
        XCTAssertTrue(app.buttons["My beauty notes"].waitForExistence(timeout:5));capture(app,"V3-05-发布完成")
        app.buttons["My beauty notes"].firstMatch.tap();XCTAssertTrue(app.buttons["查查这篇内容"].waitForExistence(timeout:5));app.swipeUp()
        app.buttons["收藏"].tap();let input=app.textFields["分享你的看法"];scrollTo(input,in:app);input.tap();input.typeText("Useful note");app.buttons["发送"].tap();XCTAssertTrue(app.staticTexts["Useful note"].exists)
        app.buttons["完成"].tap();app.terminate();app.launchArguments=[];app.launch();app.buttons["导航-我的"].tap();app.buttons["发布"].tap()
        capture(app,"V3-11-重启后发布档案")
        XCTAssertTrue(app.staticTexts["My beauty notes"].firstMatch.waitForExistence(timeout:4))
    }
    @MainActor func testGameAndRoom() throws {
        let app=XCUIApplication();app.launchArguments=["--reset-community"];app.launch();app.buttons["导航-游乐场"].tap()
        XCTAssertTrue(app.buttons["配对-0"].waitForExistence(timeout:5));XCTAssertTrue(app.buttons["导航-百宝箱"].exists);capture(app,"V3-游戏独立页面")
        for i in [0,1,2,3,4,5]{app.buttons["配对-\(i)"].tap()}
        XCTAssertTrue(app.staticTexts["游戏反馈"].label.contains("10 片"))
        let room=app.buttons["去装扮 ›"];scrollTo(room,in:app);room.tap()
        XCTAssertTrue(app.buttons["布置模式"].waitForExistence(timeout:6));capture(app,"V3-小屋全景")
        app.buttons["布置模式"].tap();let stool=app.buttons["家具-stool"];scrollTo(stool,in:app);stool.tap()
        let start=app.staticTexts["家具位置"].label;app.buttons["向右移动"].tap();app.buttons["右转"].tap()
        XCTAssertEqual(app.staticTexts["家具角度"].label,"45°");XCTAssertNotEqual(app.staticTexts["家具位置"].label,start)
        capture(app,"V3-家具移动旋转");app.buttons["保存布置"].tap();app.buttons["关闭"].tap()
        app.terminate();app.launchArguments=[];app.launch();app.buttons["导航-我的"].tap();app.buttons["打开美妆小屋"].tap()
        XCTAssertTrue(app.buttons["布置模式"].waitForExistence(timeout:5));app.buttons["布置模式"].tap();scrollTo(app.buttons["家具-stool"],in:app);app.buttons["家具-stool"].tap()
        XCTAssertEqual(app.staticTexts["家具角度"].label,"45°");XCTAssertTrue(app.staticTexts["家具位置"].label.contains("-0.5"));capture(app,"V3-重启保留布置")
        app.buttons["关闭"].tap()
    }
    @MainActor func testRealDiscoveryAndAdvice() throws {
        let app=XCUIApplication();app.launch()
        let discovery=app.buttons["发现-3CE教程"];scrollTo(discovery,in:app);XCTAssertTrue(discovery.exists);capture(app,"V3-我的发现")
        discovery.tap();XCTAssertTrue(app.staticTexts["根据视频简介整理"].waitForExistence(timeout:5));XCTAssertTrue(app.staticTexts["URCOSME MY"].exists);capture(app,"V3-3CE原帖")
        app.buttons["完成"].tap();app.buttons["导航-动态"].tap();capture(app,"V3-真实动态")
        app.buttons["导航-百宝箱"].tap();for _ in 0..<3{app.swipeDown()};app.buttons["输入文字"].tap()
        let editor=app.textViews["素材输入框"];XCTAssertTrue(editor.waitForExistence(timeout:5));editor.tap();editor.typeText("How to apply 3CE lipstick for everyday gradient lips?")
        app.swipeUp();scrollTo(app.buttons["帮我查查"],in:app);app.buttons["帮我查查"].tap()
        XCTAssertTrue(app.staticTexts["资料卡结论"].waitForExistence(timeout:90));XCTAssertTrue(app.navigationBars["美妆小功课"].exists);XCTAssertFalse(app.staticTexts["AI 没连上，只找了常见夸大说法"].exists);capture(app,"V3-真实AI涂妆步骤")
        app.buttons["完成"].tap()
    }
    @MainActor func testRealAIAndInvalidLink() throws {
        let app=XCUIApplication();app.launch();app.buttons["输入文字"].tap()
        let editor=app.textViews["素材输入框"];XCTAssertTrue(editor.waitForExistence(timeout:5));editor.tap();editor.typeText("The label says 2% niacinamide. The post claims 10% niacinamide. Are these consistent?")
        app.swipeUp();let submit=app.buttons["帮我查查"];scrollTo(submit,in:app);submit.tap()
        XCTAssertTrue(app.staticTexts["资料卡结论"].waitForExistence(timeout:90));XCTAssertFalse(app.staticTexts["AI 没连上，只找了常见夸大说法"].exists);capture(app,"V3-10-真实AI数字核对")
        app.buttons["完成"].tap();app.buttons["输入链接"].tap();let link=app.textViews["素材输入框"];XCTAssertTrue(link.waitForExistence(timeout:5));link.tap();link.typeText("not a link");app.swipeUp();scrollTo(app.buttons["帮我查查"],in:app);app.buttons["帮我查查"].tap();XCTAssertTrue(app.staticTexts["输入错误"].waitForExistence(timeout:4));app.buttons["取消"].tap()
    }
}
