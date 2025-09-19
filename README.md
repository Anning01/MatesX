# 🌟 MatesX — 超轻量级多端数字人对话引擎

> 专为大规模 C 端用户打造的下一代数字人交互框架 —— 记忆 · 表情 · 动作 · 多端 · 轻量

---

## 🎯 项目主旨
- **支持个人玩家自定义自己的AI伙伴**
- **支持面向海量 C 端用户的超高并发数字人服务**

### 三大核心目标：

1. ✅ **大规模 C 端数字人对话管理**  
   支持高并发、低延迟、稳定可靠的对话服务，设计目标为普通服务器。

2. ✅ **记忆、表情与动作管理**  
   次时代数字人驱动引擎，集成记忆引擎 + 实时情感解析 + 自由表情 & 动作驱动，让数字人“有记忆、有灵魂、有自由”。

3. ✅ **桌面端、APP、小程序多端共用，超轻量级架构**  
   一套核心引擎，适配 Windows/macOS 桌面、iOS/Android APP、微信/支付宝小程序，极致轻量，快速集成。

---

## 🚀 核心功能

### 1. 🗣️ 数字人全链路对话引擎
> `VAD（语音活动检测） → ASR（语音识别） → LLM（大语言模型） → TTS（语音合成） → 数字人驱动`

### 2. 🧠 mem0 级记忆功能
- 长短期记忆融合，支持个性化对话历史存储与上下文理解
- 用户画像动态构建，记忆持久化、跨设备同步

### 3. 😊 实时情感解析
- 基于语音语调、语义内容、对话节奏的多模态情感识别
- 输出情感标签（开心/悲伤/愤怒/惊讶等）驱动表情与语调变化

### 4. 🎭 自由表情 & 自由动作
- 大模型算法建模，支持骨骼/BlendShape 驱动
- 实时根据对话内容、情感状态自动匹配表情与肢体语言

---

## 📱 多端支持

| 平台          | 支持状态 | 技术路线       | 预览                                   |
|-------------|------|------------|----------------------------------------|
| Windows     | ✅    | electron   | <img src="preview/windows.jpg" width="120" />      |
| macOS       | ✅    | electron   |                                        |
| Android app | ✅    | webview    | <img src="preview/android.jpg" width="120" />      |
| 微信小程序       | ✅    | webview    | <img src="preview/mini-program.jpg" width="120" /> |
| Web         | ✅    | WebGL 渲染支持 | <img src="preview/web.jpg" width="120" />          |
> 💡 所有平台共享同一套核心引擎，代码复用率 > 99%，极致轻量（核心模块 < 5MB）

---

## 🛠️ 快速开始

```bash
git clone https://github.com/kleinlee/MatesX.git
cd MatesX
pip install -r requirements.txt
```
部署对话语音模型云服务（alibaba dashscope）

修改utils/dashscope.py 中的：
```bash
# 配置大模型专属接口
DASHSCOPE_API_KEY = ""     # 请到阿里云百炼开通API-key
DASHSCOPE_TOKEN_URL = "https://dashscope.aliyuncs.com/api/v1/tokens"
DASHSCOPE_LLM_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
# 配置你的域名服务器（或仅在本地就用默认localhost）
HOST_URL = "http://localhost:8000"
```
开启服务：
```bash
python main.py
```
然后打开 http://localhost:8000/web/home.html 享用吧

### 高并发及云端同步
- 升级为云端数据库
- 资源放置到OSS

## License
Apache License 2.0

## 联系
|  加我好友，请备注“进群”，拉你进去微信交流群。| 进入QQ群聊，分享看法和最新资讯。                                                                        |
|-------------------|------------------------------------------------------------------------------------------|
| ![微信交流群](https://github.com/user-attachments/assets/b1f24ebb-153b-44b1-b522-14f765154110) | ![QQ群聊](https://github.com/user-attachments/assets/29bfef3f-438a-4b9f-ba09-e1926d1669cb) |

