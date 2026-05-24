# 一指清台

用手机摄像头追踪手指，隔空挥杆清台的体感台球小游戏。

## 在线体验

GitHub Pages 部署完成后，手机浏览器打开：

https://hhz-1019.github.io/Onefinger/

首次开始游戏时请允许摄像头权限。摄像头只用于浏览器本地的手势识别；如果拒绝权限，也可以使用触摸拖拽方式游玩。

## 本地预览

```bash
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。

## 发布

推送到 `main` 后，`.github/workflows/pages.yml` 会自动运行测试并部署到 GitHub Pages。
