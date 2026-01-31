/**
 * Trend Insight Bot
 * 智能趋势分析机器人
 */

require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

class TrendInsightBot {
  constructor() {
    // 初始化AI客户端
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_ENDPOINT || undefined,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || undefined },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY || undefined }
    });
    
    if (process.env.CLAUDE_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
      });
    }
    
    this.model = process.env.MODEL_NAME || 'gpt-4';
    this.trendData = {};
  }

  /**
   * 从X获取话题数据
   */
  async getXData(query, maxResults = 20) {
    // 注意：这里我们使用X API的基本访问权限
    // 实际实现需要有效的Bearer Token
    try {
      const params = new URLSearchParams({
        query: query,
        max_results: maxResults,
        'tweet.fields': 'created_at,author_id,public_metrics,lang',
        'user.fields': 'name,username,verified'
      });

      const response = await axios.get(
        `https://api.twitter.com/2/tweets/search/recent?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('获取X数据时出错:', error.message);
      return { data: [] }; // 返回空数据而不是抛出错误
    }
  }

  /**
   * 从新闻网站获取数据
   */
  async getNewsData(query) {
    try {
      // 这里我们搜索新闻网站
      const encodedQuery = encodeURIComponent(query);
      const response = await axios.get(
        `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrendInsightBot/1.0)'
          }
        }
      );
      
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const articles = [];
      $('item').each((index, element) => {
        if (articles.length >= 10) return false; // 只取前10个
        
        const title = $(element).find('title').text();
        const link = $(element).find('link').text();
        const pubDate = $(element).find('pubDate').text();
        
        articles.push({
          title,
          link,
          pubDate,
          source: 'News'
        });
      });
      
      return articles;
    } catch (error) {
      console.error('获取新闻数据时出错:', error.message);
      return [];
    }
  }

  /**
   * 从Reddit获取数据
   */
  async getRedditData(query) {
    try {
      // 使用Reddit API获取数据
      const response = await axios.get(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&type=link`,
        {
          headers: {
            'User-Agent': 'TrendInsightBot/1.0'
          }
        }
      );
      
      const posts = response.data.data.children.map(child => {
        const post = child.data;
        return {
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          created_utc: post.created_utc,
          source: 'Reddit'
        };
      });
      
      return posts;
    } catch (error) {
      console.error('获取Reddit数据时出错:', error.message);
      return [];
    }
  }

  /**
   * 分析文本情绪
   */
  analyzeSentiment(text) {
    return sentiment.analyze(text);
  }

  /**
   * 使用AI分析趋势
   */
  async analyzeTrend(data) {
    try {
      const combinedData = data.flatMap(platformData => 
        platformData.map(item => ({
          ...item,
          text: item.title || item.text || item.content || ''
        }))
      ).filter(item => item.text && item.text.length > 10);

      if (combinedData.length === 0) {
        return {
          summary: "暂无足够的数据进行趋势分析",
          trends: [],
          sentiment: { score: 0, comparative: 0 },
          recommendations: []
        };
      }

      // 计算整体情绪
      const sentiments = combinedData.map(item => this.analyzeSentiment(item.text));
      const avgSentiment = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;

      const systemPrompt = `你是一位专业的趋势分析师，擅长从社交媒体和新闻数据中识别和分析趋势。请分析以下数据并提供详细的趋势洞察。`;

      const userPrompt = `请分析以下${combinedData.length}条数据的趋势：
      
${combinedData.map((item, index) => `${index + 1}. [${item.source}] ${item.title || item.text.substring(0, 100)}...`).join('\n')}

请提供：
1. 趋势总结
2. 主要趋势点
3. 情绪分析（正面/负面/中性）
4. 具体建议或洞察
5. 未来预测`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.5
      });

      return {
        summary: response.choices[0].message.content,
        trends: combinedData.slice(0, 5), // 前5个项目
        sentiment: { score: avgSentiment, comparative: avgSentiment / combinedData.length },
        recommendations: ["需要更多数据进行深入分析", "建议持续监控该话题"]
      };
    } catch (error) {
      console.error('分析趋势时出错:', error.message);
      return {
        summary: "分析过程中出现错误",
        trends: [],
        sentiment: { score: 0, comparative: 0 },
        recommendations: [`错误详情: ${error.message}`]
      };
    }
  }

  /**
   * 生成趋势报告
   */
  async generateReport(topic = 'general') {
    console.log(`正在生成关于"${topic}"的趋势报告...`);
    
    // 从多个平台收集数据
    const [xData, newsData, redditData] = await Promise.all([
      this.getXData(topic),
      this.getNewsData(topic),
      this.getRedditData(topic)
    ]);
    
    // 整合数据
    const allData = [
      xData.data ? xData.data : [],
      newsData,
      redditData
    ];
    
    // 分析趋势
    const analysis = await this.analyzeTrend(allData);
    
    // 生成报告
    const report = {
      topic,
      timestamp: new Date().toISOString(),
      analysis,
      sources: {
        x: xData.data ? xData.data.length : 0,
        news: newsData.length,
        reddit: redditData.length
      },
      totalItems: (xData.data ? xData.data.length : 0) + newsData.length + redditData.length
    };
    
    return report;
  }

  /**
   * 保存报告
   */
  async saveReport(report, filename = null) {
    if (!filename) {
      const dateStr = moment().format('YYYYMMDD_HHmm');
      filename = `trend_report_${report.topic}_${dateStr}.json`;
    }
    
    await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf8');
    console.log(`趋势报告已保存到: ${filename}`);
    
    // 同时生成一个易于阅读的MD版本
    const mdFilename = filename.replace('.json', '.md');
    const mdContent = this.generateMarkdownReport(report);
    await fs.writeFile(mdFilename, mdContent, 'utf8');
    console.log(`趋势报告(MD版)已保存到: ${mdFilename}`);
  }

  /**
   * 生成Markdown格式的报告
   */
  generateMarkdownReport(report) {
    let md = `# 趋势分析报告\n\n`;
    md += `**主题**: ${report.topic}\n\n`;
    md += `**生成时间**: ${moment(report.timestamp).format('YYYY年MM月DD日 HH:mm:ss')}\n\n`;
    md += `**数据来源**: X(${report.sources.x}), 新闻(${report.sources.news}), Reddit(${report.sources.reddit})\n\n`;
    md += `**总项目数**: ${report.totalItems}\n\n`;
    
    md += `## 趋势分析\n\n`;
    md += `${report.analysis.summary}\n\n`;
    
    md += `## 主要趋势点\n\n`;
    report.analysis.trends.slice(0, 5).forEach((trend, index) => {
      md += `${index + 1}. **[${trend.source}]** ${trend.title || trend.text.substring(0, 100)}...\n\n`;
    });
    
    md += `## 情绪分析\n\n`;
    const sentimentLabel = report.analysis.sentiment.score > 0 ? '正面' : 
                         report.analysis.sentiment.score < 0 ? '负面' : '中性';
    md += `- **情绪得分**: ${report.analysis.sentiment.score.toFixed(2)} (${sentimentLabel})\n`;
    md += `- **相对情绪**: ${report.analysis.sentiment.comparative.toFixed(2)}\n\n`;
    
    md += `## 建议与洞察\n\n`;
    report.analysis.recommendations.forEach(rec => {
      md += `- ${rec}\n`;
    });
    
    md += `\n---\nGenerated by [Trend Insight Bot](https://github.com/JMOKSZ/trend-insight-bot)\n`;
    
    return md;
  }

  /**
   * 持续监控趋势
   */
  async startMonitoring(topic, intervalMinutes = 60) {
    console.log(`开始监控"${topic}"，间隔${intervalMinutes}分钟`);
    
    const monitor = async () => {
      try {
        const report = await this.generateReport(topic);
        await this.saveReport(report);
        
        // 这里可以添加通知逻辑
        console.log(`趋势报告已生成: ${report.topic} at ${moment().format('HH:mm:ss')}`);
      } catch (error) {
        console.error('监控过程中出错:', error.message);
      }
      
      // 设置下次执行
      setTimeout(monitor, intervalMinutes * 60 * 1000);
    };
    
    // 立即执行一次
    await monitor();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const args = process.argv.slice(2);
  const bot = new TrendInsightBot();
  
  // 解析命令行参数
  const topicIndex = args.indexOf('--topic');
  const reportIndex = args.indexOf('--report');
  const monitorIndex = args.indexOf('--monitor');
  
  (async () => {
    try {
      if (monitorIndex !== -1) {
        // 启动监控模式
        const topic = args[monitorIndex + 1] || 'general';
        await bot.startMonitoring(topic, 60); // 默认每小时一次
      } else if (reportIndex !== -1) {
        // 生成报告
        const type = args[reportIndex + 1] || 'daily';
        const topic = topicIndex !== -1 ? args[topicIndex + 1] : 'general';
        
        const report = await bot.generateReport(topic);
        await bot.saveReport(report);
        
        console.log('趋势报告生成完成！');
      } else if (topicIndex !== -1) {
        // 分析特定话题
        const topic = args[topicIndex + 1];
        
        const report = await bot.generateReport(topic);
        await bot.saveReport(report);
        
        console.log('趋势分析完成！');
      } else {
        // 默认：生成一般性报告
        const report = await bot.generateReport();
        await bot.saveReport(report);
        
        console.log('默认趋势报告生成完成！');
      }
    } catch (error) {
      console.error('执行过程中出错:', error);
    }
  })();
}

module.exports = TrendInsightBot;