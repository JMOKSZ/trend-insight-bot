# Trend Insight Bot

智能趋势分析机器人，结合多平台数据进行深度分析，提供有价值的市场洞察。

## 功能特色

- 📊 **多平台数据聚合** - 从X、Reddit、新闻网站等平台收集数据
- 🤖 **AI驱动分析** - 使用AI模型进行深度数据分析
- 📈 **趋势预测** - 基于历史数据和当前趋势预测未来发展
- 🎯 **精准洞察** - 提供具体可行的市场洞察
- 🔔 **实时提醒** - 重要趋势变化及时通知
- 📅 **定期报告** - 生成趋势分析报告

## 安装

```bash
git clone https://github.com/JMOKSZ/trend-insight-bot.git
cd trend-insight-bot
npm install
```

## 使用

```bash
# 启动趋势分析机器人
npm start

# 分析特定话题
node index.js --topic "AI"

# 生成每日报告
node index.js --report daily

# 监控特定关键词
node index.js --monitor "cryptocurrency"
```

## 配置

复制 `.env.example` 为 `.env` 并填入相应配置：

```bash
cp .env.example .env
```

## API支持

本工具支持以下AI模型：
- Azure OpenAI
- OpenAI GPT系列
- Anthropic Claude
- 以及其他兼容的API

## 贡献

欢迎提交Issue和Pull Request来帮助改进此项目。