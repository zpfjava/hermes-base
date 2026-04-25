#!/usr/bin/env node
/**
 * 朋友圈文案生成器 - 阿布风格（逐个发送版）
 * 从素材库顺序提取段落（从后往前），基于素材生成 5 组不同风格文案
 *
 * 修复 (2026-04-12)：彻底重写发送逻辑
 * 1. openclaw CLI → 直接调 Feishu HTTP API（Gateway 不需要运行）
 * 2. 之前全部 spawnSync ETIMEDOUT 是因为 openclaw 依赖 Gateway，
 *    而 Gateway 在 cron 环境连接不上导致挂死。
 * 3. 现在用 native https + tenant_access_token 直连飞书，可靠性极高。
 */

const fs = require('fs'), path = require('path'), https = require('https'), { execSync, exec } = require('child_process');
const { generate5Copywriting, detectTheme, generateImagePrompt, getDefaultImagePrompt } = require('./ai-copywriter');

// ============ Feishu API 客户端（直接调飞书 API，不需要 Gateway）============
const FEISHU_HOST = 'open.feishu.cn';

let _cachedToken = null;
let _tokenExpiry = 0;

function getFeishuCredentials() {
  const openclawConfig = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  const accounts = openclawConfig.channels?.feishu?.accounts || {};
  // 优先 content 账号（朋友圈脚本配置的是 content）
  const account = accounts.content || accounts.commander || accounts.default || {};
  return { appId: account.appId, appSecret: account.appSecret };
}

function httpsRequest(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: FEISHU_HOST,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 15000,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getTenantAccessToken(creds) {
  // 先检查缓存 token 是否还有效（提前 60s 过期保护）
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;

  const resp = await httpsRequest('POST', '/open-apis/auth/v3/tenant_access_token/internal', null, {
    app_id: creds.appId,
    app_secret: creds.appSecret,
  });

  if (resp.code !== 0 || !resp.tenant_access_token) {
    throw new Error(`获取 token 失败: code=${resp.code} msg=${resp.msg}`);
  }

  _cachedToken = resp.tenant_access_token;
  // 提前 60s 过期
  _tokenExpiry = Date.now() + (resp.expire - 60) * 1000;
  return _cachedToken;
}

async function feishuSendText(token, chatId, text) {
  const resp = await httpsRequest('POST',
    `/open-apis/im/v1/messages?receive_id_type=chat_id`,
    token,
    {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }
  );
  if (resp.code !== 0) throw new Error(`发送失败: code=${resp.code} msg=${resp.msg}`);
  return resp;
}

async function feishuUploadImage(token, imagePath) {
  // 飞书图片上传用 curl（curl 的 multipart 格式是经过验证的正确格式）
  return new Promise((resolve, reject) => {
    const escapedToken = token.replace(/'/g, "'\\''");
    const escapedPath = imagePath.replace(/'/g, "'\\''");
    const cmd = `curl -s --connect-timeout 15 -X POST 'https://${FEISHU_HOST}/open-apis/im/v1/images' ` +
      `-H 'Authorization: Bearer ${escapedToken}' ` +
      `-F 'image_type=message' ` +
      `-F 'image=@${escapedPath};type=image/png'`;

    exec(cmd, { encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('curl upload failed: ' + err.message));
      try {
        const resp = JSON.parse(stdout);
        resolve(resp);
      } catch {
        reject(new Error('upload parse error: ' + stdout.substring(0, 200)));
      }
    });
  });
}

const CONFIG = {
  baseDir: __dirname,
  outputDir: path.join(__dirname, 'output'),
  sentDir: path.join(__dirname, 'sent'),
  stateFile: path.join(__dirname, 'moment-state.json'),
  historyFile: path.join(__dirname, 'send-history.json'),
  materialsFile: '/root/.openclaw/workspace/shared/materials/朋友圈素材库/纳瓦尔宝典/原文摘录/摘录整理.md',
  chatId: 'oc_f0d7f9a753c626ad3562846e0584cf69',
  feishuAccount: 'content',
  imagePath: '/root/.openclaw/workspace/output'
};

function ensureDirs() {
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  if (!fs.existsSync(CONFIG.sentDir)) fs.mkdirSync(CONFIG.sentDir, { recursive: true });
}

function readState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch (e) { return { lastDate: null, lastSentDate: null, lastIndex: 0 }; }
}

function saveState(state) { fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2)); }

function readHistory() {
  try { return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8')); }
  catch (e) { return []; }
}

function saveHistory(history) { fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2)); }

/**
 * 解析素材库
 */
function parseMaterials() {
  const content = fs.readFileSync(CONFIG.materialsFile, 'utf8');
  const lines = content.split('\n');
  const materials = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/【(\d+)】/);
    if (match) {
      if (current) materials.push(current);
      current = { id: parseInt(match[1]), content: '' };
    } else if (current && line.trim() && !line.startsWith('#') && !line.startsWith('**') && !line.startsWith('---')) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) materials.push(current);
  return materials.filter(m => m.content.length > 50);
}

/**
 * 判断素材是否是无效内容（致谢、前言等）
 */
function isValidMaterial(content) {
  const invalidKeywords = [
    '感谢', '谢谢', '致谢', '感谢语', 'acknowledg', 'dedic',
    '前言', '序言', '序', 'preface', 'introduction',
    '目录', 'contents',
    '版权', 'copyright',
    '献给我', '献给',
    '资源', '推荐', '网站', '链接', '更多内容', '更多信息',
    '进一步了解', '访问', '订阅', '关注', '推特', 'Twitter',
    '播客', 'Podcast', '采访', '访谈', 'Navalmanack', 'VisualizeValue'
  ];
  
  for (const keyword of invalidKeywords) {
    if (content.toLowerCase().includes(keyword.toLowerCase())) {
      return false;
    }
  }
  
  if (content.trim().length < 50) {
    return false;
  }
  
  // 过滤纯人名列表（多个顿号/逗号分隔的外国人名）
  const namePattern = /[·•][\u4e00-\u9fa5]{2,4}[,、]/;
  if (namePattern.test(content)) {
    return false;
  }
  
  // 过滤以人名开头的内容（·吴、沙恩·马克...）
  if (/^[·•\s]+[A-Za-z\u4e00-\u9fa5]+[,、]/.test(content.trim())) {
    return false;
  }
  
  // 过滤包含网址链接的内容
  if (/https?:\/\/[\w.-]+/.test(content)) {
    return false;
  }
  
  // 过滤包含方括号链接的内容
  if (/\[[^\]]+\]\([^)]+\)/.test(content)) {
    return false;
  }
  
  return true;
}

/**
 * 从后往前顺序选择素材（跳过无效素材）
 */
function selectMaterials(state, count = 1) {
  const materials = parseMaterials();
  const total = materials.length;
  let startIndex = state.lastIndex || total;
  const selected = [];
  let skipped = 0;
  
  for (let i = 0; i < count; ) {
    startIndex--;
    if (startIndex < 0) startIndex = total - 1;
    
    const material = materials[startIndex];
    
    if (isValidMaterial(material.content)) {
      selected.push(material);
      i++;
    } else {
      skipped++;
      console.log(`[SKIP] 跳过无效素材 #${material.id}（致谢/前言等）`);
    }
    
    if (skipped > total * 0.8) {
      console.error('[ERROR] 有效素材不足，请检查素材库');
      break;
    }
  }
  
  state.lastIndex = startIndex;
  return selected;
}

/**
 * 配图风格库 - 按主题分组
 * 更新时间：2026-04-22（加入朋友圈风格，生活感优先）
 */
const IMAGE_STYLES = {
  '财富': [
    '城市天际线从咖啡馆窗户望出去，玻璃上有水珠，暖黄灯光，忙碌的一天刚刚开始',
    '办公桌上摊开的笔记本和笔，旁边放着手机显示待办事项，自然光，高效工作',
    '清晨书桌特写，打开的书本，咖啡杯冒着热气，柔和侧光，温暖氛围，学习成长',
    '现代图书馆内部，整齐书架延伸至远方，暖色灯光，知识殿堂，静谧氛围',
    '高端办公场景，玻璃幕墙会议室，城市景观背景，晨光洒在会议桌上，商务质感',
    '日出时分的港口，货轮剪影，金色海面，贸易与流通，希望与开始',
    '电脑屏幕前一杯咖啡，键盘旁放着笔记本，深夜台灯，专注工作的夜晚',
    '地铁站里人流匆匆，一个人安静地站着看手机，城市节奏中的片刻停顿'
  ],
  '成长': [
    '阳光透过树叶洒在小路上，一双运动鞋走在落叶上，自然光，向前走的踏实感',
    '清晨森林人像，阳光穿透树叶形成光束，丁达尔效应，人物仰望天空，静谧治愈',
    '嫩芽破土而出特写，黑色土壤背景，绿色生命力，逆光拍摄，希望与成长',
    '竹林小径，阳光穿过竹叶形成光斑，幽静深远，节节高升，东方禅意',
    '书籍堆叠成阶梯状，暖色台灯光线，知识阶梯，学习成长，静谧氛围',
    '登山者剪影，站在山巅张开双臂，云海在脚下，金色朝阳，成就感',
    '跑步鞋和运动手表放在跑道上，清晨雾气，新的一天从运动开始',
    '健身房镜子前的自拍，汗水，肌肉线条，坚持的力量感'
  ],
  '人生': [
    '傍晚的街道，路灯刚亮起，行人匆匆走过，暖色调，平凡日子里的光',
    '夕阳下的老街道，石板路延伸至远方，暖黄色路灯，怀旧氛围，岁月静好',
    '雨中咖啡馆窗景，雨滴在玻璃上滑落，室内暖光，城市夜景模糊背景，静谧思考',
    '火车窗外风景，田野与村庄快速后退，黄昏光线，旅途与选择，流动感',
    '清晨海边人像剪影，人物站在礁石上眺望远方，日出金色阳光洒在海面，波光粼粼',
    '秋日落叶铺满小径，金黄色调，阳光透过树枝洒下，时光流逝，诗意人生',
    '厨房窗台上的一碗热汤，蒸汽升腾，暖黄灯光，家的味道',
    '阳台上看日落的人，背影，城市天际线，一天结束时的放松'
  ],
  '思考': [
    '书桌上一本翻开的书，旁边是半凉了的咖啡，台灯暖光，安静独处的夜晚',
    '极简主义书房，清晨阳光透过窗户洒在简洁书桌上，一本打开的书，冷色调，光影分割',
    '黑白棋盘格透视延伸，消失点汇聚，哲学思考，选择与方向，极简构图',
    '沙漏特写，细沙缓缓流下，侧逆光拍摄，时间流逝，颗粒质感，静谧氛围',
    '蜡烛燃烧特写，火焰跳动，黑暗背景，光明与思考，温暖色调，静谧深沉',
    '水墨晕染抽象，黑白灰渐变，东方哲学意境，留白艺术，禅意思考',
    '窗边书桌，雨天的街道在窗外模糊，一杯茶，一本笔记，安静的思考时光',
    '深夜的台灯下，摊开的笔记本上写满了字，笔放在旁边，灵感涌现的瞬间'
  ],
  '内心': [
    '窗台上的绿植被阳光照着，叶片上有水珠，窗外是蓝天白云，安静的早晨',
    '清晨海浪拍岸，白色浪花与深蓝海水，慢门长曝光，丝绸质感海浪，蓝绿色调，宁静力量',
    '月下荷花池，水面平静如镜，荷花倒影，银色月光，东方禅意，内心平静',
    '雨滴落在平静湖面，涟漪扩散，慢门拍摄，蓝灰色调，静谧治愈，内心观照',
    '枯山水庭院，白色砂石耙出波纹，石头点缀，禅宗意境，极简冥想',
    '极光下的冰原，绿色光带舞动，星空璀璨，自然奇观，敬畏与宁静',
    '清晨的阳台，一个人裹着毯子捧着热茶，城市还在沉睡，属于自己的时间',
    '浴缸旁的蜡烛和一本书，水汽氤氲，放松的时刻，与自己独处'
  ]
};

/**
 * 根据素材主题选择配图风格（从对应风格组随机选择）
 */
function selectImageStyle(theme) {
  const themeMap = {
    '财富': '财富',
    '成长': '成长',
    '人生': '人生',
    '思考': '思考',
    '内心': '内心'
  };
  
  const styleGroup = IMAGE_STYLES[themeMap[theme]] || IMAGE_STYLES['思考'];
  const randomIndex = Math.floor(Math.random() * styleGroup.length);
  return styleGroup[randomIndex];
}

/**
 * 安全过滤：清理配图提示词中的西方/美国文化元素
 * 防止 AI 生成 NASA、品牌 Logo 等不适合朋友圈的元素
 */
function sanitizeImagePrompt(prompt) {
  const bannedPatterns = [
    // 西方机构/品牌
    { pattern: /NASA|美国宇航|美国航空航天/g, replace: '星空' },
    { pattern: /太空探测|航天探测|火星探测/g, replace: '星空探索' },
    { pattern: /火箭|航天器|宇宙飞船/g, replace: '星星' },
    { pattern: /Logo|标志|商标/g, replace: '' },
    // 英文/西方文字
    { pattern: /英文字母|英文文字|English/g, replace: '' },
    // 西方建筑地标
    { pattern: /埃菲尔|自由女神|大本钟|白宫|国会/g, replace: '城市建筑' },
    // 西方文化元素
    { pattern: /好莱坞|漫威|迪士尼|超级英雄/g, replace: '' },
    // 海报类（容易生成带文字/Logo 的图片）
    { pattern: /海报|杂志封面|封面/g, replace: '画册' },
    // 镜像/翻转
    { pattern: /镜像|翻转|左右颠倒/g, replace: '' },
  ];

  let cleaned = prompt;
  for (const { pattern, replace } of bannedPatterns) {
    if (pattern.test(cleaned)) {
      console.log(`[SANITIZE] 清理: "${pattern.source}" → "${replace}"`);
      cleaned = cleaned.replace(pattern, replace);
    }
  }

  // 清理多余标点
  cleaned = cleaned.replace(/，，+/g, '，').replace(/，+$/g, '').trim();

  return cleaned || prompt; // 如果清理后为空，回退到原始提示词
}

/**
 * 生成配图
 * 修复 (2026-04-24)：加入 negativePrompt，排除 3D/CG/插画风格
 */
function generateImage(prompt, negativePrompt) {
  console.log('[IMAGE] 正在生成配图...');
  console.log('[IMAGE] 提示词:', prompt);
  console.log('[IMAGE] 负面提示词:', negativePrompt);
  
  try {
    const escapedPrompt = prompt.replace(/'/g, "\\'");
    const escapedNegative = (negativePrompt || '').replace(/'/g, "\\'");
    const pythonCode = `
import sys
sys.path.insert(0, '/root/.openclaw/workspace/scripts')
from wanx_generate_image import generate_image

filepath = generate_image(
    prompt='${escapedPrompt}',
    negative_prompt='${escapedNegative}',
    style='摄影写实',
    size='768*1024',
    output_dir='${CONFIG.imagePath}'
)

if filepath:
    print(f'IMAGE_PATH:{filepath}')
else:
    print('IMAGE_FAILED')
`;
    
    const result = execSync(`python3 -c "${pythonCode}"`, {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const match = result.match(/IMAGE_PATH:(.+)/);
    if (match) {
      const imagePath = match[1].trim();
      console.log('[IMAGE] 生成成功:', imagePath);
      return { success: true, path: imagePath };
    } else {
      console.error('[IMAGE] 未找到图片路径');
      return { success: false, error: '未找到图片路径' };
    }
  } catch (error) {
    console.error('[IMAGE ERROR]', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 发送图片到飞书（直接调飞书 HTTP API，绕过 openclaw CLI）
 * @param {string} imagePath - 图片本地路径
 * @param {string} caption - 图片说明文字
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendImageToFeishu(imagePath, caption) {
  const maxRetries = 3;
  const creds = getFeishuCredentials();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[IMAGE SEND] 第${attempt+1}次尝试发送配图...`);
      const token = await getTenantAccessToken(creds);

      // Step 1: 上传图片获取 image_key
      const uploadResp = await feishuUploadImage(token, imagePath);
      if (uploadResp.code !== 0 || !uploadResp.data?.image_key) {
        throw new Error(`图片上传失败: code=${uploadResp.code} msg=${uploadResp.msg}`);
      }
      const imageKey = uploadResp.data.image_key;

      // Step 2: 发送图片消息
      await httpsRequest('POST',
        '/open-apis/im/v1/messages?receive_id_type=chat_id',
        token,
        {
          receive_id: CONFIG.chatId,
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
        }
      );

      // Step 3: caption 单独发文字
      if (caption && caption.trim()) {
        await feishuSendText(token, CONFIG.chatId, caption);
      }

      console.log('[IMAGE SEND] 配图已发送 (direct API)');
      return { success: true };
    } catch (error) {
      console.error(`[IMAGE SEND ERROR] 第${attempt+1}次失败:`, error.message);
      if (attempt < maxRetries - 1) {
        const waitTime = 10000;
        console.log(`[IMAGE SEND] ${waitTime/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  return { success: false, error: '重试 3 次后仍失败' };
}

/**
 * 发送文字消息到飞书（直接调飞书 HTTP API，绕过 openclaw CLI）
 * @param {string} content - 消息内容
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendMessageToFeishu(content) {
  const maxRetries = 3;
  const creds = getFeishuCredentials();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[SEND] 第${attempt+1}次尝试发送消息...`);
      const token = await getTenantAccessToken(creds);
      await feishuSendText(token, CONFIG.chatId, content);
      console.log('[SEND] 消息已发送 (direct API)');
      return { success: true };
    } catch (error) {
      console.error(`[SEND ERROR] 第${attempt+1}次失败:`, error.message);
      if (attempt < maxRetries - 1) {
        const waitTime = 10000;
        console.log(`[SEND] ${waitTime/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  return { success: false, error: '重试 3 次后仍失败' };
}

/**
 * 保存文案到文件
 */
function saveCopywriting(copywritingList, date) {
  const outputFile = path.join(CONFIG.outputDir, `moment-${date}.md`);
  let content = '';
  for (let i = 0; i < copywritingList.length; i++) {
    const c = copywritingList[i];
    content += `【${i+1}/${c.style}】\n${c.content}\n\n────────────────\n\n`;
  }
  fs.writeFileSync(outputFile, content);
  return outputFile;
}

/**
 * 归档已发送的文案
 */
function archiveSent(date) {
  const src = path.join(CONFIG.outputDir, `moment-${date}.md`);
  const dest = path.join(CONFIG.sentDir, `moment-${date}-sent.md`);
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(50));
  console.log('✍️ 朋友圈文案生成器（基于素材生成）');
  console.log(`📅 执行时间：${new Date().toLocaleString('zh-CN')}`);
  console.log('='.repeat(50));

  try {
    ensureDirs();
    let state = readState();
    const today = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).split(' ')[0].replace(/\//g, '-');

    if (state.lastSentDate === today) {
      console.log('[INFO] 今天已发送过文案，跳过');
      return;
    }

    const materials = selectMaterials(state, 1);
    const material = materials[0];

    const theme = detectTheme(material.content);

    console.log('[INFO] 素材库总段落数:', parseMaterials().length);
    console.log('[ORIGINAL]', material.content.substring(0, 100) + '...');
    console.log('[THEME]', theme);

    const copywritingList = await generate5Copywriting(material);

    console.log('\n[SUCCESS] 5 组文案已生成\n');
    console.log('=== 文案预览 ===\n');
    for (const c of copywritingList) {
      console.log(`【${c.style}】\n${c.content.substring(0, 80)}...\n`);
    }
    console.log('================\n');

    saveCopywriting(copywritingList, today);

    // 先发送原素材
    // 跟踪发送是否成功
    let sendSuccess = true;
    
    console.log('[SEND] 发送原素材...');
    const materialContent = `【今日素材】\n${material.content.trim()}\n\n—— 摘自《纳瓦尔宝典》`;
    const matResult = await sendMessageToFeishu(materialContent);
    if (matResult.success) {
      console.log('[OK] 原素材发送成功\n');
    } else {
      console.error('[ERROR] 原素材发送失败:', matResult.error);
      sendSuccess = false;
    }

    console.log('[SEND] 开始逐个发送 5 组文案...\n');

    for (let i = 0; i < copywritingList.length; i++) {
      const c = copywritingList[i];
      console.log(`[SEND ${i+1}/5] 发送【${c.style}】文案...`);

      const sendResult = await sendMessageToFeishu(c.content);

      if (sendResult.success) {
        console.log(`[OK] 第${i+1}组发送成功`);

        if (i < copywritingList.length - 1) {
          console.log('[WAIT] 等待 3 秒...\n');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        console.error(`[ERROR] 第${i+1}组发送失败:`, sendResult.error);
        sendSuccess = false;
      }
    }

    console.log('\n[IMAGE] 文案发送完成，正在生成配图...');
    console.log('[IMAGE] 素材主题:', theme);

    // 使用 AI 根据素材内容生成专属配图提示词
    console.log('[IMAGE-AI] 正在根据素材生成专属配图提示词...');
    const imagePromptResult = await generateImagePrompt(material, theme);
    let imagePrompt = imagePromptResult.imagePrompt;
    let negativePrompt = imagePromptResult.negativePrompt;
    console.log('[IMAGE-AI] 生成的提示词:', imagePrompt);
    console.log('[IMAGE-AI] 负面提示词:', negativePrompt);

    // 安全过滤：清理提示词中的西方/美国文化元素
    imagePrompt = sanitizeImagePrompt(imagePrompt);
    console.log('[IMAGE-AI] 过滤后提示词:', imagePrompt);

    // 直接生成配图（AI 提示词已包含场景/光影/构图/情绪，无需额外拼接）
    const imageResult = generateImage(imagePrompt, negativePrompt);

    if (imageResult.success) {
      const imageSendResult = await sendImageToFeishu(imageResult.path, `今日智慧 · ${theme}`);
      if (imageSendResult.success) {
        console.log('[OK] 配图发送成功');
      } else {
        sendSuccess = false;
      }
    } else {
      console.log('[WARN] 配图生成失败，跳过发送');
      // 配图生成失败不算发送失败，继续
    }
    
    // ✅ 只有发送成功才更新状态文件（修复：之前即使失败也更新）
    if (sendSuccess) {
      state.lastDate = today;
      state.lastSentDate = today;
      saveState(state);
      
      archiveSent(today);
      
      const history = readHistory();
      history.push({
        date: today,
        theme: theme,
        styles: copywritingList.map(c => c.style),
        imagePrompt: imagePrompt,
        material: material.content.substring(0, 200)
      });
      saveHistory(history);
      
      console.log('\n[COMPLETE] 任务完成');
      console.log('[SENT] 成功发送 5/5 组文案 + 1 张配图');
      console.log('[HISTORY] 已记录到 send-history.json');
    } else {
      console.error('\n[ERROR] 发送过程中出现错误，状态文件未更新');
      console.error('[ERROR] 明天会重新尝试发送今天的文案');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  }
}

main().catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
