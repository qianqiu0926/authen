# Image 2 制作顺序

使用 imagegen 技能原有的 `scripts/image_gen.py`，模型保持 `gpt-image-2`。用户提供的参考图仅用于该项目。

1. `01-character-master.txt`：参考 `image-6.jpg`、`image-4.jpg`、`image-2.jpg`。先生成并检查人物。
2. `02-ios-art-direction.txt`：参考 `image-6.jpg`、`image-1.png`、`image-3.jpg`、`image-7.jpg`、`image-9.jpg`。生成首页、碎纸过程和报告的完整视觉方向。
3. `03-shredder.txt`：参考 `image-1.png` 和已检查的人物。生成空机器，用户素材在界面里动态叠加。
4. `04-vanity-objects.txt`：参考已检查的人物。四个物件独立裁切，用作输入按钮。
5. `05-character-states.txt`：参考已检查的人物。身份和服装保持一致，导出状态图。

原始生成图片保存在 `Design/Generated`。去背景、裁切和压缩后的实际资产保存在 `Design/Production`。绿底只用于本地去背景，不进入 App。

当前服务配置位于用户本机私密目录；此处不存密钥。生成使用技能自带 CLI，不能把服务密钥写入 iOS 或网页。
