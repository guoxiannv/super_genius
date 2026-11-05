# 鸿蒙本地验证经验

这是传给 DeepSeek Harness 的项目操作说明，不包含 agent loop、模型调用或任务执行器。代码修改、工具调用、持久会话均由 Harness 原生 SDK/runtime 负责。

## 当前案例与验证范围

云音乐是 Vite/TypeScript Web App，不是 ArkTS 原生工程。保持播放列表、收藏、本地音频导入功能。界面修改后运行 npm run build。展示在鸿蒙浏览器中时，必须写明“鸿蒙浏览器验证”，不能称为原生应用验证。

## CLI

已安装 /Users/hw/.local/bin/devecocli（1.3.10）。使用 Harness bash 工具运行 CLI，遇到不确定参数先查 --help，不要编造调用。

- DEVECO_CLI_STUDIO_PATH=/Applications/DevEco-Studio.app
- hdc: /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc
- 当前允许验证的模拟器：Mate X7，设备标识 127.0.0.1:5555。
- 只操作模拟器；本机另有物理设备，必须显式指定 --device，不得选中物理设备。
- devecocli emulator list
- devecocli emulator start 'Mate X7'（仅在未运行时）
- devecocli emulator fold close --target 'Mate X7'
- devecocli emulator fold open --target 'Mate X7'
- devecocli ui screenshot --device 127.0.0.1:5555 --path /绝对路径/截图.png
- devecocli ui layout --device 127.0.0.1:5555 --format json

## 展示 Web App

先检查现有端口和服务，不要杀掉其他会话的服务。使用可用本地端口启动当前 App 的 Vite preview（比如 8792）；由 Harness 原生终端/后台任务管理该进程。

用 hdc -t 127.0.0.1:5555 rport tcp:8792 tcp:8792 建立回连，再执行：

devecocli device app start --device 127.0.0.1:5555 --bundle com.huawei.hmos.browser --ability MainAbility --action ohos.want.action.viewData --uri http://127.0.0.1:8792

浏览器有首次运行页时先检查 UI 树再操作。启动成功不等于页面已经加载；截图必须显示目标 App，不能把桌面、空白页、错误页作为验收成功。

## 一多适配

先修改 App，再 build，再分别折叠/展开，等待真实界面稳定后截图。检查底部播放器、导航、侧栏、列表截断、触控区域；报告具体通过和未通过项。PNG 保存到本次消息指定的 artifact 目录，并在最终回复引用绝对路径。保留 UI tree 和构建日志以便追溯。不得伪造截图、测试结果或未执行的步骤。
