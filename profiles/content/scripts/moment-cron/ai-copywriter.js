#!/usr/bin/env node
/**
 * AI 文案生成器 - 调用 AI 基于素材内容原创生成 5 组不同风格的文案
 *
 * 重要规则：
 * 1. 文案中不要出现"纳瓦尔"的名字
 * 2. 把素材智慧内化成自己的表达
 * 3. 评估素材是否适合发朋友圈
 *
 * 修复记录 (2026-03-16)：
 * - 超时时间：120 秒 → 300 秒
 * - Fallback 机制：固定模板 → 基于素材关键词的智能生成
 * - 添加重试机制（最多 3 次）
 *
 * 修复记录 (2026-04-11)：
 * - 最大重试次数：3 次 → 5 次
 * - 重试间隔：10 秒 → 60 秒
 * - 添加 Gateway 状态检查
 * - 基础超时：300 秒 → 180 秒（减少单次等待，增加重试次数）
 *
 * 修复记录 (2026-04-12)：
 * - 之前调用 openclaw agent（依赖 Gateway），Gateway 在 cron 环境挂死导致全部失败
 * - 改为直接调 DashScope API（无需 Gateway），可靠性大幅提升
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============ 配置（用于场景去重等本地文件操作）============
const CONFIG = {
  outputDir: path.join(__dirname, 'output')
};

// ============ DashScope API 配置（直接从配置文件读取）============
let _apiKey = null;
let _apiUrl = null;

function getDashScopeConfig() {
  if (_apiKey) return { apiKey: _apiKey, url: _apiUrl };

  // 优先用 wanx 图片脚本的 API Key（已验证可用），
  // 备用 openclaw 配置中的 qwencode key
  const wanxScript = '/root/.openclaw/workspace/scripts/wanx_generate_image.py';
  if (fs.existsSync(wanxScript)) {
    const content = fs.readFileSync(wanxScript, 'utf8');
    const keyMatch = content.match(/API_KEY\s*=\s*["']([^"']+)["']/);
    if (keyMatch) {
      _apiKey = keyMatch[1];
      _apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      return { apiKey: _apiKey, url: _apiUrl };
    }
  }

  // Fallback: 从 openclaw.json 读取
  const openclawConfig = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  const providers = openclawConfig.models?.providers || {};
  const qwen = providers.qwencode || {};
  _apiKey = qwen.apiKey || '';
  // coding 端点有 Coding Plan 限制，改用 compatible-mode 端点
  _apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  return { apiKey: _apiKey, url: _apiUrl };
}

function dashScopeChat(model, messages, maxTokens = 800) {
  return new Promise((resolve, reject) => {
    const { apiKey, url } = getDashScopeConfig();
    const urlObj = new URL(url);
    const body = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.8 });

    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          if (d.error) reject(new Error('API error: ' + d.error.message));
          else resolve(d);
        } catch (e) {
          reject(new Error('Parse error: ' + data.substring(0, 100)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * 评估素材是否适合发朋友圈
 */
function isValidMaterial(content) {
  const invalidKeywords = [
    '感谢', '谢谢', '致谢', '前言', '序言', '目录', '版权',
    '资源', '推荐', '网站', '链接', '更多内容', '订阅', '关注',
    '推特', 'Twitter', '播客', 'Podcast', '采访', 'Navalmanack',
    'VisualizeValue', 'http://', 'https://', 'www.'
  ];
  
  for (const keyword of invalidKeywords) {
    if (content.toLowerCase().includes(keyword.toLowerCase())) {
      return { valid: false, reason: `包含无效关键词：${keyword}` };
    }
  }
  
  if (content.trim().length < 50) {
    return { valid: false, reason: '内容过短' };
  }
  
  if (content.trim().length > 500) {
    return { valid: false, reason: '内容过长' };
  }
  
  return { valid: true };
}

function extractCoreViewpoint(content) {
  return content.trim().replace(/\s+/g, ' ').substring(0, 150);
}

function detectTheme(content) {
  const themes = {
    '财富': ['财富', '赚钱', '产品化', '杠杆', '资产', '收入', '投资', '规模', '价值', '被动', '资本', '复利'],
    '成长': ['学习', '成长', '能力', '技能', '专长', '进步', '提升', '积累', '迭代', '培训', '知识'],
    '人生': ['人生', '生活', '选择', '自由', '幸福', '意义', '时间', '关系', '方向', '当下'],
    '思考': ['思考', '智慧', '清醒', '独立', '判断', '本质', '道理', '实践', '思路', '逻辑'],
    '内心': ['内心', '强大', '平静', '力量', '接纳', '勇气', '自信', '平和', '情绪']
  };
  const scores = {};
  for (const [theme, keywords] of Object.entries(themes)) {
    scores[theme] = keywords.reduce((sum, k) => sum + (content.includes(k) ? 1 : 0), 0);
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

function extractKeywords(content) {
  const keywords = [];
  const keywordList = ['财富', '赚钱', '杠杆', '资产', '投资', '学习', '成长', '能力', '技能', 
                       '人生', '选择', '自由', '幸福', '思考', '智慧', '独立', '内心', '强大', 
                       '平静', '价值', '复利', '时间', '当下', '本质', '判断', '专长', '知识',
                       '资本', '人力', '知识产权', '回报', '估值', '安全边际', '原则'];
  for (const k of keywordList) {
    if (content.includes(k)) keywords.push(k);
  }
  return keywords;
}

/**
 * 智能 Fallback 生成器 - 基于素材核心观点生成 5 组不同角度的原创内容
 * 修复 (2026-04-24)：之前所有风格共用同一套模板，只替换一个句号，
 * 导致每天生成的文案看起来完全一样。
 * 现在每个风格都有独立的生成逻辑，真正基于素材内容展开。
 */
function generateSmartFallback(material, theme) {
  console.log('[FALLBACK] AI 调用失败，使用智能 Fallback 生成文案...');
  
  const coreViewpoint = extractCoreViewpoint(material.content);
  const keywords = extractKeywords(material.content);
  const keywordStr = keywords.length > 0 ? keywords.join('、') : '选择';
  
  // 5 个风格各有独立的思考角度和句式结构，全部基于素材核心观点
  const styles = [
    {
      name: '深度思考',
      generate: () => {
        const openings = [
          `关于${keywordStr}，有一个常被忽略的事实：`,
          `很多人没想明白${keywordStr}背后的逻辑：`,
          `真正理解${keywordStr}的人，不会只看表面：`,
        ];
        const opening = openings[Math.floor(Math.random() * openings.length)];
        return `${opening}${coreViewpoint}。这不是鸡汤，而是底层逻辑。表面看是努力的问题，本质上是方向的问题。方向对了，每一步都在积累；方向错了，越努力越危险。把时间线拉长来看，真正决定一个人高度的，不是某一次的冲刺，而是持续做正确的事。`;
      }
    },
    {
      name: '财富认知',
      generate: () => {
        const openings = [
          `赚钱的底层逻辑，其实就藏在${keywordStr}里：`,
          `关于财富，最反直觉的真相是：`,
          `拉开财富差距的，往往不是能力，而是对${keywordStr}的理解：`,
        ];
        const opening = openings[Math.floor(Math.random() * openings.length)];
        return `${opening}${coreViewpoint}。财富的本质是价值交换，你解决了多少人的什么问题，就值多少钱。不要盯着钱看，要盯着价值看。当你持续为他人创造真实价值，财富只是副产品。投资自己，永远是回报率最高的选择。`;
        }
    },
    {
      name: '成长思维',
      generate: () => {
        const openings = [
          `成长最快的方式，不是学更多，而是想清楚${keywordStr}：`,
          `关于成长，我越来越相信一件事：`,
          `真正的成长，是从理解${keywordStr}开始的：`,
        ];
        const opening = openings[Math.floor(Math.random() * openings.length)];
        return `${opening}${coreViewpoint}。不要和别人比速度，要和昨天的自己比深度。每天进步一点点，一年就是巨大的差距。学习最快的方式是用中学，边做边迭代。怕犯错而不动手，才是最大的错误。`;
      }
    },
    {
      name: '人生感悟',
      generate: () => {
        const openings = [
          `人生最重要的事，说到底还是${keywordStr}：`,
          `走到今天，越来越觉得${keywordStr}才是关键：`,
          `关于人生，时间给了我最诚实的答案——${keywordStr}：`,
        ];
        const opening = openings[Math.floor(Math.random() * openings.length)];
        return `${opening}${coreViewpoint}。重要的不是目的地，而是沿途的风景和看风景的心情。把每一天过好，未来自然会好。选择做长期主义者，不追逐短期的热闹，守住自己的节奏。时间会给你答案。`;
      }
    },
    {
      name: '内心力量',
      generate: () => {
        const openings = [
          `内心强大的人，都懂${keywordStr}：`,
          `真正的力量，来自对${keywordStr}的深刻理解：`,
          `关于内心，最大的误区是以为强大就是坚硬。其实${keywordStr}告诉我们：`,
        ];
        const opening = openings[Math.floor(Math.random() * openings.length)];
        return `${opening}${coreViewpoint}。真正的力量不是征服外界，而是掌控自己。允许自己不完美，同时继续变得更好。当你的内心足够安定，外界的一切都无法动摇你。平静，是最大的力量。不随波逐流，不焦虑比较，守住自己的节奏。`;
      }
    }
  ];
  
  const results = styles.map(style => ({
    style: style.name,
    content: style.generate(),
    theme: theme,
    isFallback: true
  }));
  
  console.log('[FALLBACK] 智能生成完成（5 组独立角度，基于素材核心观点）');
  return results;
}

/**
 * 检查 DashScope API 是否可用（网络连通性检查）
 */
function checkDashScopeHealth() {
  try {
    const { apiKey, url } = getDashScopeConfig();
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname.replace('/chat/completions', '/models'),
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 8000,
    };
    return new Promise(resolve => {
      const req = https.request(opts, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(res.statusCode < 500));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  } catch (e) {
    return Promise.resolve(false);
  }
}

async function generateWithAI(material, theme, retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 10000; // 10 秒重试间隔

  const systemPrompt = `你是朋友圈文案专家。朋友圈不是公众号，不是写文章。朋友圈是"刷"的，不是"读"的。

【朋友圈文案铁律】
1. 第一句必须抓人——要么反常识、要么有冲突、要么让人好奇。刷朋友圈的人 0.5 秒决定是否继续看。
2. 全文 3-6 行，100-150 字。超过 6 行会被折叠，折叠后没人点开。
3. 说人话。像跟朋友聊天，不像在写论文。用短句，少用长复合句。
4. 有"我"的视角。朋友圈是个人社交，不是媒体发布。"我见过"、"我踩过坑"、"我后来才明白"比"人应该"更有说服力。
5. 每段之间空一行。朋友圈的排版就是换行，不要连成一大坨。
6. 纯文本，不用 emoji，无 hashtags，不出现"纳瓦尔"。

【5 组风格 = 5 种完全不同的切入角度，禁止重复同一观点】

深度思考：从"认知颠覆"切入。先说一个大多数人相信但其实是错的观点，再揭示真相。**开头句式不要固定**——可以是反问、可以是陈述、可以是比喻，每次换一种。

财富认知：从"钱/价值"切入。谈什么值得投入时间、什么不值得。用做生意/赚钱的视角看问题。语气像一个踩过坑的创业者。**开头句式不要固定**。

成长思维：从"具体做法"切入。不说大道理，说具体怎么做。**开头句式不要固定**——可以是"我试过..."、可以是"有个方法..."、可以是"后来我发现..."。

人生感悟：从"时间/经历"切入。带个人故事感。**开头句式不要固定**——可以是"小时候..."、可以是"有次..."、可以是"去年..."。

内心力量：从"情绪共鸣"切入。先说一个大家都有的痛点感受（焦虑、迷茫、内耗），再给一个让人松一口气的视角。语气像一个懂你的人。**开头句式不要固定**。

【⚠️ 核心约束】
- 5 组文案的核心论证路径必须完全不同。如果两段都在说"A 不是 B 而是 C"，说明失败了。
- 每条必须有自己独立的开头钩子、展开逻辑、结尾收束。
- **禁止固定开头句式**——"大家都以为"、"我算过一笔账"、"28岁那年"这些句式每次只能出现一次，不能每次都这样开头。
|- 禁止使用\"你应该\"、\"我们要\"这种说教句式。用\"我发现\"、\"我后来才懂\"代替。`;

  const userPrompt = `基于以下素材创作 5 组不同风格的朋友圈文案。

素材内容：${material.content.trim()}
素材主题：${theme}

【朋友圈排版示例 - 注意换行和短句】
30 岁之前，我以为人脉就是多认识人。

后来发现，真正的人脉是：
你靠谱，别人愿意把重要的事交给你。
你诚信，合作过的人下次还找你。

声誉、人品、口碑，都是会复利增长的资产。

比起一时的聪明，靠谱才是一个人最硬的底牌。

【更多示例 - 注意"我"的视角和口语化】
我踩过一个坑：什么都想学，结果什么都不精。

后来想明白了——
你不需要样样厉害。
只要一件事做到顶尖，别人就会为你而来。

基础永远大于花哨技巧。
简单清晰的表达，胜过一堆无用的证书。

【⚠️ 格式要求】
- 每条文案内部用换行分段（不要 \n，用实际的换行符）
- 全文 3-6 行，每行不超过 20 字
- 纯文本，不要 emoji，不要 hashtags

请严格按以下 JSON 格式输出（不要其他内容）：
{"copywriting":[{"style":"深度思考","content":"文案内容..."},{"style":"财富认知","content":"文案内容..."},{"style":"成长思维","content":"文案内容..."},{"style":"人生感悟","content":"文案内容..."},{"style":"内心力量","content":"文案内容..."}]}`;

  // 优先用 qwen-plus（通用模型），备用 qwen3.5-plus
  const models = ['qwen-plus', 'qwen3.5-plus'];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const model of models) {
      try {
        console.log(`[AI] 调用 DashScope API (${model})，第${attempt + 1}次尝试...`);

        const resp = await dashScopeChat(model, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], 1200);

        const content = resp.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.copywriting && parsed.copywriting.length === 5) {
            console.log(`[AI] 生成成功 (${model})`);
            return parsed.copywriting.map(c => ({
              style: c.style,
              content: c.content,
              theme: theme,
            }));
          }
        }
        console.log('[AI] JSON 解析失败，尝试其他模型...');
      } catch (e) {
        console.error(`[AI ERROR] (${model}):`, e.message.substring(0, 100));
      }
    }

    if (attempt < maxRetries - 1) {
      console.log(`[AI] 所有模型尝试失败，${retryDelay / 1000}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.log('[AI] 所有重试失败，切换到智能 Fallback');
  return generateSmartFallback(material, theme);
}

/**
 * 根据素材内容生成专属配图提示词
 * 优化版本：朋友圈风格优先（2026-04-22）
 * 2026-04-12：改为直接调 DashScope API
 */
async function generateImagePrompt(material, theme) {
  const maxRetries = 2;
  const retryDelay = 8000;
  const models = ['qwen-plus', 'qwen3.5-plus'];

  // 代码层面随机化：从"视觉风格 × 具体元素"生成
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 朋友圈配图的第一性原理：适合传播、适合分享
  // 能让人点赞/转发/收藏的画面类型：
  // 1. 治愈系（太美了，我要收藏）- 海边日出、晚霞、星空、雨后
  // 2. 共鸣系（这就是我的生活）- 普通人的日常，但温暖有盼头
  // 3. 态度系（这就是我想说的）- 逆光剪影、空旷公路、坚定背影
  // 4. 悬念系（这是什么意思？）- 有对比、有冲突但不消极
  // 5. 美感系（好看，先存了）- 极简构图、光影对比、几何分割
  //
  // ⚠️ 核心底线：画面情绪必须积极向上，即使表现困境也要有希望感
  // 禁止：抽烟、喝酒、哭泣、颓废、破败、衰败、凄凉

  // 每个主题映射到 2-3 种视觉风格，每种风格有具体的场景/元素/光线库
  const themeVisuals = {
    '人生': {
      // 人生主题适合：治愈系 + 共鸣系 + 态度系
      visualStyles: ['治愈', '共鸣', '态度'],
      scenes: {
        '治愈': [
          '海边日出，金色阳光洒在波光粼粼的海面上，远处有渔船剪影',
          '雨后彩虹横跨城市天际线，地面水洼倒映着天空',
          '晚霞染红了整片天空，城市轮廓在橙红色中若隐若现',
          '星空下的山顶，银河横跨天际，远处城市灯火如星',
          '秋日的银杏大道，金黄的落叶铺满小路，阳光穿透树叶',
          '清晨的湖面，薄雾笼罩，一只白鹭掠过水面',
          '雪山脚下的草原，野花盛开，远处是皑皑雪峰',
          '夕阳下的芦苇荡，逆光中芦苇穗泛着金光',
          '雨后的古镇青石板路，倒映着红灯笼和灰瓦白墙',
          '日出前的城市天际线，天空从深蓝渐变到橙红'
        ],
        '共鸣': [
          '小区楼下长椅，旁边放着半副象棋和一杯茶',
          '菜市场角落，菜贩收摊后留下的水渍和新鲜蔬菜',
          '楼道声控灯下，墙上有一些小广告，角落放着旧纸箱',
          '阳台晾衣绳上挂着洗得发白的工作服，水滴在往下掉',
          '小区楼梯转角，墙上有孩子画的歪歪扭扭的画，充满童趣',
          '公园石凳上放着一本翻开的旧书，旁边是拐杖',
          '城中村小巷口，电线交错，墙上有手写的联系电话',
          '小区儿童游乐区空秋千，旁边放着一个小皮球'
        ],
        '态度': [
          '空旷公路延伸至地平线，一个人背对镜头走向远方',
          '山顶一个人影，面对壮阔云海，渺小但坚定',
          '桥上逆光剪影，下面是车流，人一动不动',
          '天台边缘，城市在脚下，风把衣服吹得鼓起',
          '日出时的江边堤坝，一个人迎着晨光跑步'
        ]
      },
      mood: '人生百态，平凡但有力量',
      angle: '根据风格变化：治愈用远景，共鸣用平视，态度用逆光剪影'
    },
    '财富': {
      // 财富主题适合：共鸣系 + 悬念系 + 态度系
      visualStyles: ['共鸣', '悬念', '态度'],
      scenes: {
        '共鸣': [
          '深夜办公室工位，屏幕还亮着，键盘旁放着咖啡杯',
          '地铁车厢连接处，一个人靠着门打瞌睡，手里攥着文件',
          '工地脚手架旁，安全帽放在地上，旁边放着矿泉水',
          '地下车库电梯口，一双皮鞋旁边放着工装袋',
          '夜市收摊后的地面，整洁安静，远处还有灯光',
          '共享办公区空座位，桌上放着咖啡杯和计算器',
          '凌晨批发市场，地上堆着货物，三轮车停在旁边',
          '天桥上往下看车流，栏杆上放着手机'
        ],
        '悬念': [
          '桌上摊开的笔记本旁边放着笔和计算器',
          '新旧对比：旧工具旁边放着崭新的手机',
          '空工位上屏幕亮着，显示着复杂的表格，人不在',
          '钱包里有一些零钱，但旁边是最新款耳机',
          '桌上放着简单的饭菜，但旁边放着创业计划书'
        ],
        '态度': [
          '城市天际线逆光剪影，一个人站在天台边缘',
          '深夜写字楼一扇亮着的窗，整栋楼都黑了',
          '早高峰地铁站，人潮汹涌中一个人逆行'
        ]
      },
      mood: '城市奋斗，平凡但有力量',
      angle: '根据风格变化：共鸣用平视，悬念用特写，态度用剪影'
    },
    '成长': {
      // 成长主题适合：治愈系 + 共鸣系 + 美感系
      visualStyles: ['治愈', '共鸣', '美感'],
      scenes: {
        '治愈': [
          '清晨阳光穿透树叶，光斑洒在草地上',
          '破土而出的嫩芽，背景是模糊的城市建筑',
          '雨后春笋，泥土还带着湿气，笋尖顶着露水',
          '蝴蝶破茧的瞬间，翅膀还是湿的',
          '沙漠中的绿洲，仙人掌旁开着一朵小花',
          '悬崖边的松树，根系裸露但依然挺拔',
          '冬日枯枝上冒出的第一个新芽',
          '溪流中的石头，被水冲刷得光滑，旁边长满青苔'
        ],
        '共鸣': [
          '出租屋书桌，笔记摊开着写满又划掉',
          '公交车后排座位上放着一本翻开的书',
          '楼梯转角放着一双雨靴，鞋底还带着泥',
          '城中村天台上放着一把折叠椅，望着远处的楼',
          '网吧里一台亮着的电脑前空无一人，屏幕显示代码',
          '快递柜前放着一个拆了一半的包裹',
          '修鞋摊旁放着一双修好的皮鞋，鞋油刚干',
          '小区健身器材旁放着一瓶喝了一半的矿泉水'
        ],
        '美感': [
          '极简构图：一面白墙上一道阳光投射的几何阴影',
          '对称构图：楼梯扶手螺旋上升，从正上方拍',
          '线条引导：铁轨延伸至远方，两侧是枯黄的草',
          '框架构图：门框里看到窗外的树和天空',
          '色彩对比：灰暗背景中一抹鲜艳的红色'
        ]
      },
      mood: '向上，积累，不张扬但有力量',
      angle: '根据风格变化：治愈用微距，共鸣用平视，美感用构图'
    },
    '思考': {
      // 思考主题适合：治愈系 + 悬念系 + 美感系
      visualStyles: ['治愈', '悬念', '美感'],
      scenes: {
        '治愈': [
          '海边礁石上一个人影剪影，日出金色阳光洒在海面',
          '湖边晨雾，水面平静如镜，倒映着对岸的树',
          '山顶云海翻涌，日出从云层中透出金光',
          '竹林深处，阳光透过竹叶形成光柱',
          '雪后的森林，树枝挂着雪，脚印延伸到远方',
          '黄昏的麦田，麦浪在风中起伏，远处是村庄'
        ],
        '悬念': [
          '空长椅上一本翻开的书，书页被风吹起',
          '桌上摊开的笔记本，旁边放着半杯冷掉的茶',
          '窗台上放着一副老花镜和一本旧书',
          '凉亭石桌上放着茶杯，人不在，茶还在冒热气',
          '黑板上写了一半的公式，粉笔放在窗台上',
          '沙发上摊开的报纸，旁边放着老花镜和半块饼干'
        ],
        '美感': [
          '光影墙面：光线在墙面形成几何分割，明暗对比',
          '极简构成：简单几何元素，大面积留白',
          '对称水面：平静湖面倒映着天空和树，上下对称',
          '渐变天空：从深蓝到橙红的渐变，下方是城市轮廓',
          '黑白对比：纯黑背景中一束光打在白色物体上'
        ]
      },
      mood: '孤独但有方向，安静，与自己对话',
      angle: '根据风格变化：治愈用远景，悬念用中景，美感用特写'
    },
    '内心': {
      // 内心主题适合：治愈系 + 共鸣系 + 态度系
      visualStyles: ['治愈', '共鸣', '态度'],
      scenes: {
        '治愈': [
          '星空下的海边，海浪轻拍沙滩，银河横跨天际',
          '雨后初晴，阳光穿透云层形成丁达尔光柱',
          '月光下的湖面，银色的月光在水面上铺开一条路',
          '冬日壁炉旁，暖光映照着旧沙发和毛毯',
          '清晨花园，露珠在花瓣上，第一缕阳光照进来',
          '温泉蒸汽在冷空气中升腾，周围是雪景',
          '黄昏的薰衣草田，紫色花海延伸到远山',
          '萤火虫在夏夜草丛中闪烁，背景是模糊的树林'
        ],
        '共鸣': [
          '出租屋阳台，晾着的衣服在微风中晃动，水珠还在滴',
          '窗台上放着一杯水旁边放着笔记本，阳光照在上面',
          '床头一盏小灯还亮着，被子整齐叠着',
          '玄关换鞋凳上放着一串钥匙和口罩，旁边是背包',
          '沙发一角放着抱枕和毛毯，旁边是打开的书',
          '厨房灶台上放着刚做完饭的锅，旁边是调料瓶',
          '飘窗上放着一杯水，旁边是翻开的书和手机',
          '楼梯间一盏灯亮着，墙上有一些生活痕迹'
        ],
        '态度': [
          '逆光中的一个人影，面对大海或天空',
          '雨中一个人打伞走在空旷的街道',
          '天台边缘，风吹动头发，城市在身后'
        ]
      },
      mood: '一个人的时光，安静但有力量',
      angle: '根据风格变化：治愈用远景，共鸣用平视，态度用逆光'
    }
  };

  const rule = themeVisuals[theme] || themeVisuals['人生'];
  const chosenStyle = r(rule.visualStyles);

  // 场景去重：从可用场景中排除最近用过的
  const usedScenesPath = path.join(CONFIG.outputDir, 'used-scenes.json');
  let usedScenes = [];
  try {
    if (fs.existsSync(usedScenesPath)) {
      usedScenes = JSON.parse(fs.readFileSync(usedScenesPath, 'utf8'));
    }
  } catch (e) { /* ignore */ }

  // 从当前风格的场景中排除已使用的
  const availableScenes = rule.scenes[chosenStyle].filter(s => !usedScenes.includes(s));
  // 如果全部用完了，重置并从头开始
  const scenePool = availableScenes.length > 0 ? availableScenes : rule.scenes[chosenStyle];
  const chosenScene = r(scenePool);

  // 记录已使用（保留最近 20 个）
  usedScenes.push(chosenScene);
  if (usedScenes.length > 20) usedScenes = usedScenes.slice(-20);
  try { fs.writeFileSync(usedScenesPath, JSON.stringify(usedScenes, null, 2)); } catch (e) { /* ignore */ }

  const systemPrompt = `你是朋友圈配图视觉策划师。

【朋友圈配图的第一性原理】
配图的核心目的：**让人停下来，想点赞/转发/收藏。**

什么样的配图能做到？
1. **治愈系**（触发"太美了，我要收藏"）——海边日出、晚霞、星空、雨后、雪景
2. **共鸣系**（触发"这就是我的生活"）——深夜工位、地铁、出租屋、菜市场
3. **态度系**（触发"这就是我想说的"）——逆光剪影、空旷公路、孤独背影
4. **悬念系**（触发"这是什么意思？"）——不完整的场景、有冲突的画面
5. **美感系**（触发"好看，先存了"）——极简构图、光影对比、几何分割

【本次指定的视觉方案】
- 视觉风格：${chosenStyle}
- 具体场景：${chosenScene}
- 情绪基调：${rule.mood}
- 构图角度：${rule.angle}

【⚠️ 重要约束】
- 你必须基于上面指定的风格和场景生成 prompt，不要替换成其他
- 可以在这个场景基础上添加合理细节，但核心画面不能变
- 治愈系要突出"美"和"治愈感"，不要刻意做旧
- 共鸣系要突出"真实感"和"生活痕迹"，不要过度美化
- 态度系要突出"剪影"和"逆光"，不要出现正脸
- 悬念系要突出"不完整"和"冲突感"，不要信息太完整
- 美感系要突出"构图"和"光影"，不要元素太多

【⚠️ 情绪底线 — 绝对不能消极】
- 画面传递的情绪必须是**积极向上**的，即使表现困境也要有希望感
- 禁止出现：抽烟、喝酒、哭泣、颓废、破败、衰败、凄凉
- 即使是"共鸣系"（表现普通人生活），也要突出**温暖、坚韧、有盼头**
- 避免使用负面细节词：斑驳、剥落、磨损、凉透、冷掉、半截、破败、凄凉
- 用"有岁月痕迹""有使用痕迹""有生活气息"代替"破旧""老旧""斑驳"

【绝对禁止】
- 黑板/粉笔/教室——太刻意说教
- 3D 渲染/CG/插画/卡通/抽象艺术/超现实拼贴
- 任何品牌 Logo、英文文字、西方建筑
- 出现人脸正脸（态度系用剪影，其他风格不要有人）

【格式要求】
- 逗号分隔，50-80 字
- 摄影写实，手机拍摄质感
- 竖版 3:4 构图，上方留白`;

  const userPrompt = `素材主题：${theme}

请严格按以下 JSON 格式输出（不要其他内容）：
{"imagePrompt":"生成的配图提示词", "negativePrompt":"排除 3D 渲染，CG，插画，卡通，抽象艺术，超现实，海报设计，杂志封面，文字，logo，英文，皮肤光滑，完美灯光，对称构图"}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const model of models) {
      try {
        console.log(`[IMAGE-AI] 调用 DashScope API (${model})...`);
        const resp = await dashScopeChat(model, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], 200);

        const content = resp.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.imagePrompt) {
            console.log('[IMAGE-AI] 生成成功:', parsed.imagePrompt.substring(0, 50) + '...');
            return {
              imagePrompt: parsed.imagePrompt,
              negativePrompt: parsed.negativePrompt || '排除 3D 渲染，CG，插画，卡通，抽象艺术，超现实，海报设计，杂志封面，文字，logo，英文'
            };
          }
        }
      } catch (e) {
        console.error(`[IMAGE-AI ERROR] (${model}):`, e.message.substring(0, 100));
      }
    }

    if (attempt < maxRetries - 1) {
      console.log(`[IMAGE-AI] 重试中...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.log('[IMAGE-AI] 生成失败，使用默认提示词');
  const defaultPrompt = getDefaultImagePrompt(theme);
  return {
    imagePrompt: defaultPrompt,
    negativePrompt: '排除 3D 渲染，CG，插画，卡通，抽象艺术，超现实，海报设计，杂志封面，文字，logo，英文'
  };
}

/**
 * 获取默认提示词（Fallback）
 * 修复 (2026-04-24)：移除咖啡/绿植/夕阳等泛滥元素，改为反套路场景
 */
function getDefaultImagePrompt(theme) {
  const defaultPrompts = {
    '财富': '旧楼梯转角，一束光打在剥落的墙皮上，灰尘在光柱里悬浮，俯拍，上方大面积留白，安静却有力量',
    '成长': '水泥地裂缝里钻出一株野草，晨光斜照，水珠挂在叶尖，低角度特写，背景虚化，生命力，克制的情绪',
    '人生': '菜市场角落，一把未撑开的旧伞靠在竹筐旁，地面水渍反光，竖构图，上方留白，生活痕迹，时间流逝',
    '思考': '地铁扶手特写，不同颜色的握痕交叠，背景虚化成色块，竖构图，上方留白，城市节奏，孤独与连接',
    '内心': '空旷天台边缘，一把折叠椅，远处城市天际线模糊，黄昏光线，广角但留白，自由，与自己和解'
  };
  return defaultPrompts[theme] || defaultPrompts['思考'];
}

async function generate5Copywriting(material) {
  const theme = detectTheme(material.content);
  console.log('[INFO] 素材主题:', theme);
  return generateWithAI(material, theme);
}

if (require.main === module) {
  const testMaterial = { content: '杠杆等于资本加人力加知识产权。专长是无法通过培训获得的知识。投资回报是买入并持有加估值加安全边际。' };
  console.log('[TEST] 正在测试 AI 文案生成...\n');
  generate5Copywriting(testMaterial).then(results => {
    console.log('\n=== 生成的文案 ===\n');
    for (const r of results) {
      console.log(`【${r.style}】\n${r.content}\n---`);
    }
  }).catch(e => console.error('测试失败:', e.message));
}

module.exports = { generate5Copywriting, generateImagePrompt, getDefaultImagePrompt, extractCoreViewpoint, detectTheme, extractKeywords, isValidMaterial };
