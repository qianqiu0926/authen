# AUTHEN 服务器部署

> 最新更新：消费者 APP 统一提交与成长树，见 [SMART-INPUT-RELEASE.md](SMART-INPUT-RELEASE.md)；浏览器 APP 基础部署见 [CONSUMER-RELEASE.md](CONSUMER-RELEASE.md)。下文保留最初后台部署与运维记录。

部署版本：20261015-222251-final。

部署日期：2026-10-15。服务器：119.91.129.203（Ubuntu，2核 / 2GB）。

## 访问入口

- 企业网页：https://authen.classby.cn （自动进入 `/authen/`）
- IP HTTP 入口：http://119.91.129.203/authen/
- APP 后台：https://authen.classby.cn/api/
- 状态：https://authen.classby.cn/api/health

IP 根目录仍为原 WHO PAYS 网站；本次未替换原有应用。域名 HTTP 自动跳转 HTTPS，IP 的 `/authen/` 保留 HTTP 验收入口。

## 已部署内容

企业端：文章、评论、图片、视频、音频、链接输入，内容卡、具体原话与原因、公开参考资料、下载和浏览器内记录。

后台：DeepSeek 内容分析、公开网页读取、公开护肤资料读取、faster-whisper small 音频转文字。音频一次处理一段，CPU 和内存设有上限。

APP：Simulator 与真机的默认核对接口统一指向上述 HTTPS 域名；不携带模型 API 密钥。Debug 调试可用 `AUTHEN_SERVICE_BASE_URL` 指定本机后台。

## 当前边界

- 网页为公开企业试用空间，未接企业登录、组织权限、共享数据库。
- 网页核对记录仅存于当前浏览器，最多30份。IP 与域名是两个浏览器存储空间，记录不互通。
- APP 的资料卡、社区发帖、积分与小屋仍保存在设备内；这次未建立跨用户社交服务或跨设备同步。原生 APP 页面不会因为服务器部署而变成浏览器页面，也未发布 App Store / TestFlight 包。
- 网页视频检查抽样画面和字幕，口播需要单独传音频；APP 保留原有音视频读取流程。
- 语音转写可能出现错字，尤其是成分名。网络受限、需登录或限制访问的社交链接可能读不到，可改为粘贴文字或截图。
- 目前是内容理解、图文比较和有限公开资料查询。尚无专门的 AI 生图、图片篡改、换脸或声音伪造检测模型；不把模型结论当作真假概率。

## 运行位置

- 当前版本：`/opt/authen/current`，指向 `/opt/authen/releases/` 下的版本目录。
- 后台：`authen.service`，仅监听 `127.0.0.1:14173`，由 Nginx 提供公网访问。
- 共享配置：`/opt/authen/shared/service.env`，不含模型密钥。
- DeepSeek 私密配置：服务用户 `authen` 的主目录下 `.config/authen/deepseek.json`，权限600。它不在网页目录内。
- 语音运行环境：`/opt/authen/shared/venv-audio`。
- 模型：`/opt/authen/shared/whisper-small`，已复制模型文件，不依赖外网下载。
- 公开参考元数据：当前版本的 `Research/social-v3/manifest.json`。未上传研究资料全集、QA 文件或本机私密目录。
- Nginx 域名配置：`/etc/nginx/sites-available/authen.classby.cn`。
- Nginx 共用配置：`/etc/nginx/snippets/authen-*.conf` 和 `/etc/nginx/conf.d/authen-limits.conf`。
- 原 IP 站点配置备份：`/etc/nginx/authen-backups/`。

服务设置：开机自动启动、异常自动重启；最多2个 AI 核对同时运行、全局每分钟12次核对。Nginx 另设每IP限速。模型密钥仅供服务器调用；未把密码、API 密钥写入网页或 APP。

## HTTPS

证书由 Let's Encrypt 签发，域名 `authen.classby.cn`。当前证书到期时间为2027-01-13。

`certbot.timer` 已启用，每天检查续期。验证目录 `/var/www/authen-acme`，续期完成后通过 `/etc/letsencrypt/renewal-hooks/deploy/authen-nginx-reload` 检查并重新加载 Nginx。已完成 `certbot renew --cert-name authen.classby.cn --dry-run --run-deploy-hooks`，模拟续期成功。

## 日常维护

```sh
sudo systemctl status authen
sudo journalctl -u authen -n 50 --no-pager
curl -fsS https://authen.classby.cn/api/health
sudo systemctl restart authen
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --cert-name authen.classby.cn --dry-run
```

不要将私密配置复制进 `web/dist`；不要把密钥加进浏览器代码或 iOS 配置。

## 更新和回退

1. 本机构建网页、运行测试。
2. 上传到新的 `/opt/authen/releases/<版本>/`，只上传运行文件、构建文件和明确需要的参考资料。
3. Linux 安装 Node 依赖，复用 shared 下的语音环境和模型。
4. 更新 `/opt/authen/current` 符号链接，重启 `authen.service`。
5. 检查 HTTP、HTTPS、核对接口和原有站点。

若更新失败，将 `current` 链接切回上一个已验证版本后重启服务。不要删除私密配置、共享模型或其他站点的 Nginx 文件。

## 本次验证

- HTTP IP 路径、HTTPS 域名与 HTTP 跳转正常。
- 浏览器完成真实 DeepSeek 文字、图片、视频内容核对；公开 NHS 页面读取成功。
- 服务器音频转写成功：约7秒中文音频耗时约21秒，测试峰值内存约751MiB；成分名出现错字，数字2%与10%保留。
- API 拒绝不相关网站的请求来源、服务器内部地址和无效素材类型。
- 网页与 APP 构建文件的已知密钥扫描通过。
- iOS 真正通过域名完成 AI 数字核对的 UI 测试通过。
- 网页与后台20项测试、iOS18项单元测试、1项真实云端UI测试通过。
- 音频从网页上传到内容卡的完整流程、评论更正和空疑点结果也已检查。
- 测试结果和构建日志保存在此目录，不在服务器网页目录公开。
- 原 nginx、EvoPi、WHO PAYS 网页及后台服务均保持运行。
