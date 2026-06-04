# 幸福人生

幸福人生是一款面向高压年轻职场人的 AI 身心健康陪伴应用。产品围绕小悦陪伴、身心状态、快速记录、时光记和个人空间展开。

## 本地运行

```bash
cp .env.example .env
npm install
npm run dev -- --port 3001
```

打开 [http://localhost:3001](http://localhost:3001)。

## 环境变量

必须配置 DeepSeek 才能使用真实 AI 对话：

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

可选配置豆包语音。配置后会优先使用云端 TTS；未配置时默认保持静音并提示，不再突然播放设备系统音：

```bash
VOLCENGINE_TTS_APP_ID=
VOLCENGINE_TTS_TOKEN=
VOLCENGINE_TTS_CLUSTER=volcano_tts
VOLCENGINE_TTS_VOICE_TYPE=BV113_streaming
VOLCENGINE_TTS_VOICE_TYPE_YOUTH_GIRL=BV113_streaming
VOLCENGINE_TTS_VOICE_TYPE_SOFT_GIRL=BV001_streaming
VOLCENGINE_TTS_VOICE_TYPE_WARM_NEUTRAL=BV002_streaming
```

可选配置视觉模型。未配置时食物拍照识别会明确展示基础估算状态：

```bash
DEEPSEEK_VISION_MODEL=
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-4.1-mini
```

## 生产构建

```bash
npm ci
npm run lint
npm run build
npm run start -- --port 3001
```

应用运行时使用 SQLite 数据库，首次启动会自动创建 `data/happylife.db`。本地数据库、环境变量和测试截图均不会提交到 Git。

## 当前外部能力

- AI 陪伴对话：DeepSeek `deepseek-v4-flash`
- 数据保存：SQLite
- 数据备份：设置页支持导出完整 JSON
- 语音陪伴：默认静音，用户主动播放；支持可选豆包 TTS，云端未配置时不强制播放系统音
- 拍照识餐：支持视觉模型接入，没有视觉凭证时使用明确标注的基础估算
