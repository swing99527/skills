#!/usr/bin/env node
/**
 * 泛能网光伏运维数据采集脚本（无头浏览器版）
 *
 * 使用 Playwright 无头浏览器自动登录泛能网后台，
 * 采集各电站的光伏发电量、设备状态、逆变器运行信息等数据。
 *
 * 用法:
 *   node collect.js --phone 138xxxx --password xxxx
 *   node collect.js --phone 138xxxx --password xxxx --screenshot
 *   node collect.js --phone 138xxxx --password xxxx --headed   # 有头模式（调试用）
 *
 * 依赖: playwright (会自动安装)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────
// 配置
// ─────────────────────────────────────────
const CONFIG = {
  LOGIN_URL:
    'https://authentication-center-new.ennew.com/login?appid=fnw-auth-manage&redirect=https%3A%2F%2Fweb.fanneng.com%2F&terminalType=PC-WEB-CHROME&tenantPageName=fanneng&sdkVersion=0.2.6&withTempAuthCode=true&checkWhiteUser=1&isDirectPage=1&logout=1',
  HOME_URL: 'https://web.fanneng.com/',
  TIMEOUT: 30000,
  NAV_WAIT: 3000,
  KNOWN_STATIONS: [
    '天津集通新能源有限公司',
    '滁州集通新能源有限公司',
  ],
};

// ─────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    phone: '',
    password: '',
    headed: false,
    screenshot: false,
    outputDir: path.join(__dirname, '..', 'output'),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--phone':
      case '-p':
        opts.phone = args[++i];
        break;
      case '--password':
      case '--pwd':
        opts.password = args[++i];
        break;
      case '--headed':
        opts.headed = true;
        break;
      case '--screenshot':
      case '-s':
        opts.screenshot = true;
        break;
      case '--output':
      case '-o':
        opts.outputDir = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
泛能网光伏运维数据采集脚本

用法:
  node collect.js --phone <手机号> --password <密码> [选项]

选项:
  --phone, -p      登录手机号 (必填)
  --password, --pwd 登录密码 (必填)
  --headed         有头模式运行（可视化浏览器，调试用）
  --screenshot, -s 采集过程中保存截图
  --output, -o     输出目录 (默认: ./output)
  --help, -h       显示帮助
`);
        process.exit(0);
    }
  }

  if (!opts.phone || !opts.password) {
    console.error('❌ 必须提供 --phone 和 --password 参数');
    console.error('   用法: node collect.js --phone 138xxxx --password xxxx');
    process.exit(1);
  }

  return opts;
}

// ─────────────────────────────────────────
// 确保 Playwright 已安装
// ─────────────────────────────────────────
function ensurePlaywright() {
  try {
    require.resolve('playwright');
  } catch {
    console.log('📦 首次运行，正在安装 Playwright...');
    execSync('npm install playwright', { stdio: 'inherit', cwd: __dirname });
    execSync('npx playwright install chromium', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Playwright 安装完成');
  }
}

// ─────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveScreenshot(page, name, opts) {
  if (!opts.screenshot) return;
  if (!fs.existsSync(opts.outputDir)) fs.mkdirSync(opts.outputDir, { recursive: true });
  const filepath = path.join(opts.outputDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  📸 截图: ${filepath}`);
}

/**
 * 在所有 frame 中查找并点击包含指定文本的元素
 */
async function clickInFrames(page, text, options = {}) {
  const { timeout = 10000, exact = false } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const locatorStr = exact ? `text="${text}" >> visible=true` : `text=${text} >> visible=true`;
        const locator = frame.locator(locatorStr);

        if ((await locator.count()) > 0) {
          await locator.first().click({ timeout: 3000 });
          return true;
        }
      } catch {
        // 继续尝试下一个 frame
      }
    }
    await sleep(500);
  }
  return false;
}

/**
 * 在所有 frame 中查找包含指定文本的 frame 并提取 body 文本
 */
async function getFrameTextContaining(page, keyword) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const text = await frame.locator('body').textContent({ timeout: 2000 });
      if (text && text.includes(keyword)) {
        return { frame, text };
      }
    } catch {
      // 继续
    }
  }
  return null;
}

// ─────────────────────────────────────────
// Step 1: 登录
// ─────────────────────────────────────────
async function login(page, opts, context) {
  console.log('\n🔐 尝试使用缓存状态访问首页...');
  await page.goto(CONFIG.HOME_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
  await sleep(3000);
  
  if (!page.url().includes('login') && !page.url().includes('authentication-center')) {
     console.log('  ✅ 凭证有效，直接进入系统！');
     await saveScreenshot(page, '02-home-rendered', opts);
     return;
  }

  console.log('  ⚠️ 凭证无效或首次运行，进入手动登录流程...');
  await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'networkidle', timeout: CONFIG.TIMEOUT });
  await sleep(2000);

  // 查找并填写手机号输入框 (type="text", placeholder="请输入手机号")
  const phoneInput = page.locator('input[placeholder*="手机"]').first();
  await phoneInput.waitFor({ timeout: 10000 });
  await phoneInput.click();
  await phoneInput.fill(opts.phone);
  console.log('  ✅ 手机号已填写');

  // 填写密码 (type="password", placeholder="请输入密码")
  const pwdInput = page.locator('input[type="password"]').first();
  await pwdInput.click();
  await pwdInput.fill(opts.password);
  console.log('  ✅ 密码已填写');

  // 注：当前版本登录页无 checkbox，无需勾选用户协议

  await saveScreenshot(page, '01-login-filled', opts);

  // 点击登录按钮 — 按钮文字为"登 录"（中间有空格），可能是自定义组件
  // 使用多种定位策略
  let loginClicked = false;
  const loginStrategies = [
    () => page.locator('text=登 录').first().click({ timeout: 3000 }),
    () => page.locator('text=登录').first().click({ timeout: 3000 }),
    () => page.getByRole('button', { name: /登.*录/ }).first().click({ timeout: 3000 }),
    () => page.evaluate(() => {
      // JS fallback: 找到包含"登录"或"登 录"的可点击元素
      const els = document.querySelectorAll('button, div[class*="btn"], span[class*="btn"], a[class*="btn"], [role="button"]');
      for (const el of els) {
        if (el.textContent && el.textContent.replace(/\s/g,'').includes('登录')) {
          el.click();
          return true;
        }
      }
      return false;
    }),
  ];

  for (const strategy of loginStrategies) {
    try {
      await strategy();
      loginClicked = true;
      break;
    } catch {
      // 尝试下一个策略
    }
  }

  if (!loginClicked) {
    throw new Error('无法找到并点击登录按钮');
  }
  console.log('  ⏳ 正在登录...');

  // 等待跳转到首页
  console.log('  ⏳ 等待首页完成加载并渲染...');
  try {
    await page.waitForURL('**/web.fanneng.com/**', { timeout: 20000 });
  } catch (e) {
    console.warn('  ⚠️ 等待 waitForURL 超时: ' + e.message);
  }

  // 额外等待确信SPA框架组件完全挂载（非常关键，很多新版界面是纯前端渲染）
  await page.waitForTimeout(6000);

  const url = page.url();
  if (url.includes('web.fanneng.com') || url.includes('console') || url.includes('home')) {
    console.log(`  ✅ 登录成功！当前 URL: ${url}`);
    
    // 首次登录成功后，将 Cookie 和 Storage 状态保存到文件
    const AUTH_STATE_FILE = path.join(opts.outputDir, 'state.json');
    await context.storageState({ path: AUTH_STATE_FILE });
    console.log(`  💾 登录凭证已保存至 ${AUTH_STATE_FILE}，下次运行将自动跳过登录！`);
  } else {
    // 可能是密码错误或其他原因没有跳过去
    console.error('  ❌ 登录疑似失败，当前 URL:', url);
    await saveScreenshot(page, '01-login-failed', opts);
    throw new Error('登录失败: URL 未正常跳转');
  }

  // 再等一个 networkidle 防止内部的 iframe 和 API 请求没完成
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch(e) { /* ignore */ }

  await saveScreenshot(page, '02-home-rendered', opts);
}

// ─────────────────────────────────────────
// Step 2: 导航到光伏运行页面
// ─────────────────────────────────────────
async function navigateToSolarPage(page, opts) {
  console.log('\n📍 Step 2: 导航到光伏运行页面...');

  // 点击菜单: 项目经营 → 生产分析 → 光伏运行
  const menuPath = ['项目经营', '生产分析', '光伏运行'];

  for (const [index, menuText] of menuPath.entries()) {
    console.log(`  → 点击菜单: ${menuText}`);
    // 第一个菜单可能需要较长时间加载(骨架屏)，给充足时间
    const waitTimeout = index === 0 ? 30000 : 10000;
    const clicked = await clickInFrames(page, menuText, { timeout: waitTimeout });
    if (!clicked) {
      console.warn(`  ⚠️ 未找到菜单 "${menuText}"，尝试 JS 方式...`);
      // JS fallback: 在所有 frame 中搜索
      const found = await page.evaluate((text) => {
        const allFrames = [document, ...Array.from(document.querySelectorAll('iframe')).map((f) => {
          try { return f.contentDocument; } catch { return null; }
        }).filter(Boolean)];
        for (const doc of allFrames) {
          // 只搜索可能是菜单的元素，并反转数组以优先获取叶子节点
          const els = Array.from(doc.querySelectorAll('a, li, span, div[class*="menu"], div[class*="item"]')).reverse();
          const el = els.find((e) => {
            if (!e.textContent || !e.textContent.includes(text)) return false;
            // 确保可见
            if (!e.offsetParent) return false;
            // 避免匹配到包含很多子元素的大容器，只点击文本比较短且包含目标的
            if (e.textContent.trim().length > text.length + 10) return false;
            return true;
          });
          if (el) {
            el.click();
            return true;
          }
        }
        return false;
      }, menuText);
      if (!found) {
        throw new Error(`无法找到菜单: ${menuText}`);
      }
    }
    await sleep(1500);
  }

  // 等待光伏运行页面加载
  await sleep(CONFIG.NAV_WAIT);
  await saveScreenshot(page, '03-solar-page', opts);
  console.log('  ✅ 已进入光伏运行页面');
}

// ─────────────────────────────────────────
// Step 3: 采集光伏监视数据
// ─────────────────────────────────────────
async function collectSolarMonitorData(page, stationName, opts) {
  console.log(`\n📊 Step 3: 采集光伏监视数据 [${stationName}]...`);

  await sleep(2000);

  // 在所有 frame 中查找发电量数据
  const result = await page.evaluate(() => {
    const data = {};
    const allFrames = [document];

    // 尝试获取 iframe 内容
    document.querySelectorAll('iframe').forEach((f) => {
      try {
        if (f.contentDocument) allFrames.push(f.contentDocument);
      } catch {}
    });

    for (const doc of allFrames) {
      const text = doc.body?.textContent || '';
      if (!text.includes('当日发电量') && !text.includes('装机容量')) continue;

      // 使用正则提取数值，匹配"标签 数值 单位"的模式
      const patterns = [
        { key: '当日发电量', regex: /当日发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '装机容量', regex: /装机容量[\s\S]*?([\d,.]+)\s*(kW|MW)/i },
        { key: '当月发电量', regex: /当月发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '当年发电量', regex: /当年发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '首次并网时间', regex: /首次并网时间[\s\S]*?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i },
        { key: '当日等效利用小时数', regex: /当日等效利用小时数[\s\S]*?([\d,.]+)\s*h/i },
        { key: '当日发电效率', regex: /当日发电效率[\s\S]*?([\d,.]+)\s*%/i },
        { key: '累计减排CO₂', regex: /累计减排CO[\s\S]*?([\d,.]+)\s*(t|吨)/i },
      ];

      for (const p of patterns) {
        const match = text.match(p.regex);
        if (match) {
          data[p.key] = match[2] ? `${match[1]} ${match[2]}` : match[1];
        }
      }

      // 如果找到了数据就退出
      if (Object.keys(data).length > 0) break;
    }

    return data;
  });

  if (Object.keys(result).length > 0) {
    console.log('  ✅ 光伏监视数据:');
    for (const [k, v] of Object.entries(result)) {
      console.log(`     ${k}: ${v}`);
    }
  } else {
    console.warn('  ⚠️ 未能提取到光伏监视数据（可能是 iframe 跨域限制）');
    // 降级方案: 使用 frame 方式
    const frameResult = await extractFromFrames(page);
    if (frameResult && Object.keys(frameResult).length > 0) {
      console.log('  ✅ 光伏监视数据 (frame 提取):');
      for (const [k, v] of Object.entries(frameResult)) {
        console.log(`     ${k}: ${v}`);
      }
      return frameResult;
    }
  }

  await saveScreenshot(page, `04-monitor-${stationName}`, opts);
  return result;
}

/**
 * 通过 Playwright frame API 提取数据（绕过跨域）
 */
async function extractFromFrames(page) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const text = await frame.locator('body').textContent({ timeout: 3000 });
      if (!text || (!text.includes('当日发电量') && !text.includes('装机容量'))) continue;

      const data = {};
      const patterns = [
        { key: '当日发电量', regex: /当日发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '装机容量', regex: /装机容量[\s\S]*?([\d,.]+)\s*(kW|MW)/i },
        { key: '当月发电量', regex: /当月发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '当年发电量', regex: /当年发电量[\s\S]*?([\d,.]+)\s*(kWh|万kWh|MWh)/i },
        { key: '首次并网时间', regex: /首次并网时间[\s\S]*?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i },
        { key: '当日等效利用小时数', regex: /当日等效利用小时数[\s\S]*?([\d,.]+)\s*h/i },
        { key: '当日发电效率', regex: /当日发电效率[\s\S]*?([\d,.]+)\s*%/i },
        { key: '累计减排CO₂', regex: /累计减排CO[\s\S]*?([\d,.]+)\s*(t|吨)/i },
      ];

      for (const p of patterns) {
        const match = text.match(p.regex);
        if (match) {
          data[p.key] = match[2] ? `${match[1]} ${match[2]}` : match[1];
        }
      }

      if (Object.keys(data).length > 0) return data;
    } catch {
      // 继续
    }
  }
  return null;
}

// ─────────────────────────────────────────
// Step 4: 采集逆变器数据
// ─────────────────────────────────────────
async function collectInverterData(page, stationName, opts) {
  console.log(`\n🔧 Step 4: 采集逆变器数据 [${stationName}]...`);

  // 点击"逆变器" Tab
  const clicked = await clickInFrames(page, '逆变器', { timeout: 8000 });
  if (!clicked) {
    console.warn('  ⚠️ 未找到"逆变器"Tab');
    return null;
  }
  
  // 逆变器数据量较大，等待更长的时间让SPA请求完成
  console.log('  ⏳ 等待逆变器数据加载...');
  await sleep(30000);

  // 提取逆变器汇总数据
  const frames = page.frames();
  let inverterData = null;

  for (const frame of frames) {
    try {
      const text = await frame.locator('body').textContent({ timeout: 3000 });
      // 泛能网顶部会有 "全部 (43台)  正常 (1台)" 等字眼
      if (!text || !text.includes('台')) continue;

      const summary = {};
      const statusRegex = /(全部|正常|离线|停机|告警)\s*[（(]?\s*(\d+)\s*台/g;
      let match;
      while ((match = statusRegex.exec(text)) !== null) {
        summary[match[1]] = parseInt(match[2]);
      }

      // 也尝试另一种格式: "正常 5"
      if (Object.keys(summary).length === 0) {
        const altRegex = /(全部|正常|离线|停机|告警)\s+(\d+)/g;
        while ((match = altRegex.exec(text)) !== null) {
          summary[match[1]] = parseInt(match[2]);
        }
      }

      if (Object.keys(summary).length > 0) {
        // 只保留提取的数据，不再保存一长串无关的HTML body文本
        inverterData = { summary };
        break;
      }
    } catch {
      // 继续
    }
  }

  if (inverterData) {
    console.log('  ✅ 逆变器状态汇总:');
    for (const [k, v] of Object.entries(inverterData.summary)) {
      console.log(`     ${k}: ${v}台`);
    }
  } else {
    console.warn('  ⚠️ 未能提取到逆变器数据');
  }

  await saveScreenshot(page, `05-inverter-${stationName}`, opts);

  // 切回光伏监视 Tab 避免污染状态
  await clickInFrames(page, '光伏监视', { timeout: 5000 });
  await sleep(4000);
  await sleep(1000);

  return inverterData;
}

// ─────────────────────────────────────────
// Step 5: 切换电站
// ─────────────────────────────────────────
async function switchStation(page, stationName, opts) {
  console.log(`\n🔄 Step 5: 切换到电站: ${stationName}...`);

  // 点击左上角电站名称展开下拉
  const frames = page.frames();
  let switched = false;

  for (const frame of frames) {
    try {
      // 找到电站名称元素并点击
      const stationSelector = frame.locator('[class*="station"], [class*="company"], [class*="select"]')
        .filter({ hasText: /集通新能源/ });
      if ((await stationSelector.count()) > 0) {
        await stationSelector.first().click();
        await sleep(1500);
        // 在下拉菜单中选择目标电站
        const targetItem = frame.getByText(stationName, { exact: false });
        if ((await targetItem.count()) > 0) {
          await targetItem.first().click();
          switched = true;
          break;
        }
      }
    } catch {
      // 继续
    }
  }

  if (!switched) {
    // 降级: 直接搜索点击
    switched = await clickInFrames(page, stationName, { timeout: 5000 });
  }

  if (switched) {
    console.log(`  ✅ 已切换到: ${stationName}`);
    await sleep(CONFIG.NAV_WAIT);

    // 检查是否被重定向到登录页
    if (page.url().includes('login') || page.url().includes('authentication')) {
      console.warn('  ⚠️ 被重定向到登录页，需要重新登录');
      return 'NEED_RELOGIN';
    }
  } else {
    console.warn(`  ⚠️ 未能切换到 ${stationName}`);
    return 'FAILED';
  }

  await saveScreenshot(page, `06-switch-${stationName}`, opts);
  return 'OK';
}

// ─────────────────────────────────────────
// Step 6: 生成报告
// ─────────────────────────────────────────
function generateReport(allData) {
  const now = timestamp();
  const lines = [];

  lines.push('# 光伏运维数据采集报告');
  lines.push(`> 采集时间：${now}`);
  lines.push('> 采集方式：Playwright 无头浏览器自动化');
  lines.push('');

  // 发电量汇总
  lines.push('## 电站发电量汇总');
  lines.push('');
  lines.push('| 指标 | ' + allData.map((d) => d.station).join(' | ') + ' |');
  lines.push('|---|' + allData.map(() => '---').join('|') + '|');

  const monitorKeys = [
    '装机容量', '当日发电量', '当月发电量', '当年发电量',
    '当日发电效率', '当日等效利用小时数', '累计减排CO₂', '首次并网时间',
  ];

  for (const key of monitorKeys) {
    const values = allData.map((d) => d.monitor?.[key] || '—');
    lines.push(`| ${key} | ${values.join(' | ')} |`);
  }

  lines.push('');

  // 设备状态汇总
  lines.push('## 设备状态汇总');
  lines.push('');
  lines.push('| | 全部 | 正常 | 停机 | 离线 | 告警 |');
  lines.push('|---|---|---|---|---|---|');

  for (const d of allData) {
    const s = d.inverter?.summary || {};
    lines.push(
      `| ${d.station} | ${s['全部'] ?? '—'} | ${s['正常'] ?? '—'} | ${s['停机'] ?? '—'} | ${s['离线'] ?? '—'} | ${s['告警'] ?? '—'} |`
    );
  }

  lines.push('');
  lines.push('## 注意事项');
  lines.push('');

  const hour = new Date().getHours();
  if (hour < 6 || hour > 20) {
    lines.push('> ⚠️ 当前为夜间采集，所有逆变器显示"停机"属于**正常现象**。');
  } else {
    lines.push('> 当前为白天采集，数据为实时运行数据。');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  console.log('═══════════════════════════════════════════');
  console.log('  泛能网光伏运维数据采集');
  console.log(`  时间: ${timestamp()}`);
  console.log(`  模式: ${opts.headed ? '有头 (可视化)' : '无头 (后台)'}`);
  console.log('═══════════════════════════════════════════');

  ensurePlaywright();
  const { chromium } = require('playwright');

  const browser = await chromium.launch({
    headless: !opts.headed,
    slowMo: opts.headed ? 100 : 0,
  });

  const AUTH_STATE_FILE = path.join(opts.outputDir, 'state.json');
  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (fs.existsSync(AUTH_STATE_FILE)) {
    contextOptions.storageState = AUTH_STATE_FILE;
    console.log('  ✅ 加载已保存的浏览器凭证 (Cookie/Storage)');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const allData = [];

  try {
    // Step 1: 登录
    await login(page, opts, context);

    // Step 2: 导航到光伏运行页面
    await navigateToSolarPage(page, opts);

    // Step 3-5: 循环尝试切换电站并采集
    for (const stationName of CONFIG.KNOWN_STATIONS) {
      const switchResult = await switchStation(page, stationName, opts);

      if (switchResult === 'NEED_RELOGIN') {
        await login(page, opts, context);
        await navigateToSolarPage(page, opts);
        await switchStation(page, stationName, opts);
      } else if (switchResult === 'FAILED') {
        console.warn(`  🔴 无法切换到电站: ${stationName}`);
        allData.push({ station: stationName, monitor: null, inverter: null });
        continue;
      }

      console.log('  ⏳ 切换电站后，系统会默认跳回首页(运营总览)。等待其加载以防止路由崩溃...');
      await page.waitForTimeout(30000); // 增加回退主页后的缓冲时间以避免请求重叠被取消

      console.log('  🔄 试图重新进入光伏运行页面...');
      await navigateToSolarPage(page, opts).catch(() => {
        console.warn('  ⚠️ 导航到光伏运行页面部分流失败，可能已经在页面上或遇到网络抖动');
      });

      console.log('  ⏳ 等待电站数据在新页面中挂载和刷新...');
      await page.waitForTimeout(30000); // 等待图表和API返回

      const monitor = await collectSolarMonitorData(page, stationName, opts);
      const inverter = await collectInverterData(page, stationName, opts);
      allData.push({
        station: stationName,
        monitor: monitor,
        inverter: inverter,
      });
    }

    // Step 6: 生成报告
    console.log('\n📋 Step 6: 生成报告...');
    const report = generateReport(allData);

    // 保存报告
    if (!fs.existsSync(opts.outputDir)) fs.mkdirSync(opts.outputDir, { recursive: true });
    const reportFile = path.join(
      opts.outputDir,
      `solar-report-${new Date().toISOString().slice(0, 10)}.md`
    );
    fs.writeFileSync(reportFile, report, 'utf-8');
    console.log(`\n📄 报告已保存: ${reportFile}`);

    // 同时输出到控制台
    console.log('\n' + '─'.repeat(50));
    console.log(report);
    console.log('─'.repeat(50));

    // 保存原始 JSON 数据
    const jsonFile = path.join(
      opts.outputDir,
      `solar-data-${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(jsonFile, JSON.stringify(allData, null, 2), 'utf-8');
    console.log(`💾 原始数据: ${jsonFile}`);

  } catch (error) {
    console.error('\n❌ 采集失败:', error.message);
    await saveScreenshot(page, 'error', { ...opts, screenshot: true });
    throw error;
  } finally {
    await browser.close();
    console.log('\n🏁 浏览器已关闭');
  }
}

// 运行
main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
