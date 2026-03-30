---
name: fanneng-solar-monitor
description: 泛能网光伏运维后台数据采集（无头浏览器版）。使用 Playwright MCP 无头浏览器登录泛能网后台，采集各电站的光伏发电量、设备状态、逆变器运行信息等数据。触发词：光伏运维、泛能网、发电量、逆变器状态、光伏监控、solar monitoring。
---

# 泛能网光伏运维后台数据采集 Skill（无头浏览器版）

## 概述

该 Skill 使用 **Playwright MCP 无头浏览器** 自动化登录泛能网（fanneng.com）光伏运维后台，采集各电站的光伏发电数据和设备运维状态。

无需可视化浏览器窗口，完全在后台运行，适合服务器环境和自动化任务。

## 适用场景

- 用户需要查看光伏电站的发电量数据
- 用户需要统计逆变器设备的运行状态（正常/停机/离线/告警）
- 用户需要跨多个电站汇总运维数据
- 定期巡检数据采集报告
- 无 GUI 环境下的自动化数据采集

## 系统信息

- **平台地址**: https://web.fanneng.com/
- **登录地址**: https://authentication-center-new.ennew.com/login?appid=fnw-auth-manage&redirect=https%3A%2F%2Fweb.fanneng.com%2F&terminalType=PC-WEB-CHROME&tenantPageName=fanneng&sdkVersion=0.2.6&withTempAuthCode=true&checkWhiteUser=1&isDirectPage=1&logout=1
- **平台技术**: 基于 iframe 嵌套的 SPA 应用，使用新奥数能科技平台构建

## 推荐工具

**MCP Playwright** — 使用 Playwright MCP server 提供的工具集进行无头浏览器自动化操作。

核心工具:
- `mcp_playwright_browser_navigate` — 导航到 URL
- `mcp_playwright_browser_snapshot` — 获取页面快照（a11y tree，用于定位元素）
- `mcp_playwright_browser_click` — 点击元素
- `mcp_playwright_browser_type` — 输入文本
- `mcp_playwright_browser_fill_form` — 填写表单
- `mcp_playwright_browser_evaluate` — 执行 JavaScript
- `mcp_playwright_browser_wait_for` — 等待文本出现
- `mcp_playwright_browser_take_screenshot` — 截图
- `mcp_playwright_browser_run_code` — 运行自定义 Playwright 代码

## 操作流程

### Step 1: 登录

1. 使用 `mcp_playwright_browser_navigate` 打开登录地址:
   ```
   url: https://authentication-center-new.ennew.com/login?appid=fnw-auth-manage&redirect=https%3A%2F%2Fweb.fanneng.com%2F&terminalType=PC-WEB-CHROME&tenantPageName=fanneng&sdkVersion=0.2.6&withTempAuthCode=true&checkWhiteUser=1&isDirectPage=1&logout=1
   ```

2. 使用 `mcp_playwright_browser_snapshot` 获取页面快照，找到以下元素的 ref:
   - 手机号输入框
   - 密码输入框
   - 用户协议勾选框（checkbox）
   - 登录按钮

3. 使用 `mcp_playwright_browser_fill_form` 填写登录表单:
   - 手机号输入框: 填入用户手机号
   - 密码输入框: 填入密码

4. **重要**: 使用 `mcp_playwright_browser_click` 勾选用户协议 checkbox（位于登录按钮下方）

5. 使用 `mcp_playwright_browser_click` 点击登录按钮

6. 使用 `mcp_playwright_browser_wait_for` 等待跳转完成:
   ```
   text: ["泛能网", "项目经营"]
   timeout: 15000
   ```

> [!IMPORTANT]
> 登录页面底部的用户协议 checkbox 必须勾选才能成功登录。使用 snapshot 查找 checkbox 的 ref 后点击。如果 snapshot 中未显示 checkbox，尝试使用 `mcp_playwright_browser_evaluate` 执行 JavaScript 来定位和点击:
> ```javascript
> () => {
>   const checkbox = document.querySelector('input[type="checkbox"]') || document.querySelector('.agreement-checkbox');
>   if (checkbox) checkbox.click();
>   return !!checkbox;
> }
> ```

### Step 2: 识别电站列表

- 使用 `mcp_playwright_browser_snapshot` 查看页面状态
- 页面左上角显示当前电站名称（如"天津集通新能源有限公司"）
- 使用 `mcp_playwright_browser_click` 点击电站名称展开下拉菜单
- 再次 `mcp_playwright_browser_snapshot` 查看所有可用电站

已知电站：
1. **滁州集通新能源有限公司** — 子站: 中通快递滁州转运中心4.23891MW光伏项目
2. **天津集通新能源有限公司** — 子站: 中通中快供应链屋顶1.1MW分布式光伏

### Step 3: 导航到光伏运行页面

路径: **左侧菜单 → 项目经营 → 生产分析 → 光伏运行**

由于页面使用 **iframe 嵌套**，需要特殊处理：

**方法 A: 使用 snapshot + click（推荐）**

1. `mcp_playwright_browser_snapshot` 查看菜单结构
2. 找到 "项目经营" 菜单项的 ref，使用 `mcp_playwright_browser_click` 点击
3. 再次 snapshot，找到 "生产分析"，点击
4. 再次 snapshot，找到 "光伏运行"，点击
5. `mcp_playwright_browser_wait_for` 等待页面加载:
   ```
   text: ["光伏监视", "逆变器"]
   timeout: 30000 // ⚠️ 泛能网SPA需要极长的加载时间
   ```

**方法 B: 使用 JavaScript 穿透 iframe**

如果 snapshot 无法看到 iframe 内的菜单，使用 `mcp_playwright_browser_run_code` 执行:

```javascript
async (page) => {
  // 获取所有 frame
  const frames = page.frames();
  for (const frame of frames) {
    const menuItem = await frame.$('text=项目经营');
    if (menuItem) {
      await menuItem.click();
      await frame.waitForTimeout(1000);
      
      const subItem = await frame.$('text=生产分析');
      if (subItem) {
        await subItem.click();
        await frame.waitForTimeout(1000);
        
        const target = await frame.$('text=光伏运行');
        if (target) {
          await target.click();
          return 'Successfully navigated to 光伏运行';
        }
      }
    }
  }
  return 'Menu items not found in any frame';
}
```

> [!NOTE]
> 页面使用 iframe 嵌套，菜单项在 iframe 内部。`mcp_playwright_browser_snapshot` 可能无法直接看到 iframe 内的元素。如果 snapshot 看不到菜单，优先使用方法 B（JavaScript 穿透 iframe）。

### Step 4: 采集光伏监视 Tab 数据

光伏运行页面有 4 个 Tab:
- **光伏监视**（默认选中）— 核心发电数据
- **逆变器** — 设备状态明细
- 并网柜
- 气象站

**使用 `mcp_playwright_browser_run_code` 批量提取数据（推荐）:**

```javascript
async (page) => {
  const data = {};
  const frames = page.frames();
  
  for (const frame of frames) {
    // 尝试在每个 frame 中查找数据
    const textContent = await frame.textContent('body').catch(() => '');
    
    if (textContent.includes('当日发电量') || textContent.includes('装机容量')) {
      // 提取关键指标
      const metrics = [
        '当日发电量', '装机容量', '当月发电量', '首次并网时间',
        '当年发电量', '当日等效利用小时数', '当日发电效率', '累计减排CO'
      ];
      
      for (const metric of metrics) {
        const regex = new RegExp(metric + '[：:\\s]*([\\d.,]+\\s*[\\w万kWhkt°%]*)', 'i');
        const match = textContent.match(regex);
        if (match) data[metric] = match[1].trim();
      }
      break;
    }
  }
  
  return JSON.stringify(data, null, 2);
}
```

**或使用 snapshot 逐个读取:**

1. `mcp_playwright_browser_snapshot` 获取页面数据
2. 从 snapshot 结果中提取以下字段:

| 字段 | 说明 |
|---|---|
| 当日发电量 | 当天累计发电量 (kWh 或 万kWh) |
| 装机容量 | 电站总装机容量 (kW) |
| 当月发电量 | 本月累计发电量 (万kWh) |
| 首次并网时间 | 电站首次连网日期 |
| 当年发电量 | 本年度累计发电量 (万kWh) |
| 经纬度 | 电站地理坐标 |
| 当日等效利用小时数 | 发电时长折算 (h) |
| 倾斜角度 | 光伏板倾斜角度 (°) |
| 当日发电效率 | 当天发电效率 (%) |
| 累计减排CO₂ | 累计碳减排量 (t) |
| 电站地点 | 具体地址 |

页面顶部有**电站名称下拉框**，用于选择当前公司下的子电站。

### Step 5: 采集逆变器 Tab 数据

1. 使用 `mcp_playwright_browser_snapshot` 找到 "逆变器" Tab 的 ref
2. 使用 `mcp_playwright_browser_click` 点击切换到逆变器 Tab
3. `mcp_playwright_browser_wait_for` 等待数据加载:
   ```
   text: ["正常", "离线", "停机"]
   timeout: 30000 // ⚠️ 逆变器数量多时接口返回极慢，需要30秒以上的等待
   ```

**提取逆变器汇总数据，使用 `mcp_playwright_browser_run_code`:**

```javascript
async (page) => {
  const result = { summary: {}, inverters: [] };
  const frames = page.frames();
  
  for (const frame of frames) {
    const text = await frame.textContent('body').catch(() => '');
    if (!text.includes('正常') || !text.includes('台')) continue;
    
    // 提取汇总数据
    const statusRegex = /(全部|正常|离线|停机|告警)\s*[（(]?\s*(\d+)\s*台/g;
    let match;
    while ((match = statusRegex.exec(text)) !== null) {
      result.summary[match[1]] = parseInt(match[2]);
    }
    
    // 提取逆变器卡片数据
    const cards = await frame.$$('.inverter-card, [class*="inverter"], [class*="device-card"]');
    for (const card of cards) {
      const cardText = await card.textContent().catch(() => '');
      const inverter = {
        name: (cardText.match(/华为逆变器\w+|逆变器\w+/) || [''])[0],
        text: cardText.substring(0, 200)
      };
      result.inverters.push(inverter);
    }
    
    break;
  }
  
  return JSON.stringify(result, null, 2);
}
```

**顶部状态汇总栏**显示:
- 全部 (X台)
- 正常 (X台) 
- 离线 (X台)
- 停机 (X台)
- 告警 (X台)

**每个逆变器卡片包含:**
- 设备名称（如"华为逆变器NB1"）
- 额定功率 (kW)
- 当前状态（停机/正常/离线/告警）
- 实时参数:
  - 日实际发电量 (kWh)
  - 日等效利用小时数 (h)
  - 日发电效率 (%)
  - 有功功率 (kW)
  - 机内空气温度 (°C)

> [!NOTE]
> 逆变器列表可能需要**向下滚动**才能看到所有设备。天津站有 10 台，滁州站有 43 台。
> 使用 `mcp_playwright_browser_run_code` 可以通过 JavaScript 滚动加载所有数据:
> ```javascript
> async (page) => {
>   const frames = page.frames();
>   for (const frame of frames) {
>     await frame.evaluate(() => {
>       const container = document.querySelector('[class*="scroll"], [class*="list"]');
>       if (container) container.scrollTop = container.scrollHeight;
>     });
>   }
> }
> ```

### Step 6: 切换电站并重复采集

1. 使用 `mcp_playwright_browser_snapshot` 找到左上角电站名称的 ref
2. 使用 `mcp_playwright_browser_click` 点击电站名称
3. 使用 `mcp_playwright_browser_snapshot` 查看下拉菜单中的电站列表
4. 使用 `mcp_playwright_browser_click` 选择下一个电站
5. `mcp_playwright_browser_wait_for` 等待页面刷新
6. 重新导航到光伏运行页面（可能需要重复 Step 3）
7. 重复 Step 4-5

> [!WARNING]
> 切换电站时，系统可能会重定向到登录页面。如果发生这种情况，需要重新执行登录流程。
> 切换后强烈建议设置巨长缓冲：**等待至少 30 秒 (30000ms)**，否则并行请求会被网站中断甚至迫使会话抛出登录页。
> ```javascript
> async (page) => {
>   const url = page.url();
>   return url.includes('login') ? 'NEED_RELOGIN' : 'OK';
> }
> ```

### Step 7: 汇总数据

最终输出应包含:

1. **发电量汇总表**: 各电站的日/月/年发电量
2. **设备状态汇总表**: 各电站正常/停机/离线/告警设备数量
3. **注意事项**: 如果是夜间采集，所有逆变器显示"停机"是正常现象

## 完整自动化脚本（一键采集）

如果需要一次性运行完整采集流程，使用 `mcp_playwright_browser_run_code` 执行以下脚本:

```javascript
async (page) => {
  const LOGIN_URL = 'https://authentication-center-new.ennew.com/login?appid=fnw-auth-manage&redirect=https%3A%2F%2Fweb.fanneng.com%2F&terminalType=PC-WEB-CHROME&tenantPageName=fanneng&sdkVersion=0.2.6&withTempAuthCode=true&checkWhiteUser=1&isDirectPage=1&logout=1';
  
  // ⚠️ 用户需要提供凭据
  const PHONE = 'YOUR_PHONE';
  const PASSWORD = 'YOUR_PASSWORD';
  
  // Step 1: 登录
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 填写登录表单
  const phoneInput = page.locator('input[type="tel"], input[placeholder*="手机"], input[placeholder*="phone"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await phoneInput.fill(PHONE);
  await passwordInput.fill(PASSWORD);
  
  // 勾选协议
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (await checkbox.count() > 0) {
    await checkbox.check();
  }
  
  // 点击登录
  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"]').first();
  await loginBtn.click();
  
  // 等待登录完成
  await page.waitForURL('**/web.fanneng.com/**', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  return 'Login completed. Current URL: ' + page.url();
}
```

> [!IMPORTANT]
> 上述脚本中的 `YOUR_PHONE` 和 `YOUR_PASSWORD` 需要替换为实际的登录凭据。在执行前**必须询问用户**获取凭据。

## 数据采集注意事项

1. **夜间采集**: 太阳能电站夜间所有逆变器均为停机状态，有功功率为 0.00 kW，这是**正常**现象
2. **白天采集**: 建议在 9:00-16:00 时段采集，可获取实时运行数据
3. **数据单位**: 发电量可能显示为 kWh 或 万kWh，注意单位转换
4. **页面加载**: 由于使用 iframe，页面切换后需要等待 2-3 秒让数据加载完成
5. **iframe 处理**: 使用 `page.frames()` 获取所有 frame，数据通常在子 frame 中
6. **无头模式**: Playwright MCP 默认以无头模式运行，无需 GUI 环境

## 故障处理

| 问题 | 解决方案 |
|---|---|
| snapshot 看不到 iframe 内容 | 使用 `mcp_playwright_browser_run_code` + `page.frames()` 穿透 iframe |
| 登录后被重定向回登录页 | 检查协议 checkbox 是否已勾选；检查单次会话是否抓取了过久导致Token失效 |
| 页面数据未加载 | 将所有数据表提取的 `waitForTimeout` 时间**加长至30000ms（30秒）**以上 |
| 电站切换后菜单消失 | 这是泛能网切换电站后的默认行为。首先等待至少15-30秒，然后再通过JS强制点击或跳转回光伏运行 |
| 元素无法点击 | 使用 `evaluate` 执行 JavaScript 直接操作 DOM |

## 官方专属抓取脚本 (collect.js)

Skill 仓库下已提供成熟和高度容错的网络爬虫脚本 `/scripts/collect.js`，该脚本内建了：
1. **Cookie/LocalStorage 凭证保持**：避免每次重新登录。
2. **极长超时防崩溃**：全局包含 30000ms 的硬等待机制，保证图表渲染。
3. **Markdown 和 JSON 双输出**：采集结束自动撰写美观报表。

**运行方式：**
```bash
cd scripts/
node collect.js --phone 手机号 --password 密码 --screenshot
```

## 输出模板

```markdown
# 光伏运维数据采集报告
> 采集时间：YYYY-MM-DD HH:MM
> 采集方式：Playwright 无头浏览器

## 电站汇总

| 指标 | 电站1 | 电站2 | 合计 |
|---|---|---|---|
| 电站名称 | xxx | xxx | — |
| 装机容量 | xxx kW | xxx kW | xxx kW |
| 当日发电量 | xxx kWh | xxx kWh | xxx kWh |
| 当月发电量 | xxx 万kWh | xxx 万kWh | xxx 万kWh |
| 当年发电量 | xxx 万kWh | xxx 万kWh | xxx 万kWh |
| 当日发电效率 | xx% | xx% | — |
| 累计减排CO₂ | xxx t | xxx t | xxx t |

## 设备状态

| | 正常 | 停机 | 离线 | 告警 | 合计 |
|---|---|---|---|---|---|
| 电站1 | x | x | x | x | x |
| 电站2 | x | x | x | x | x |
| 合计 | x | x | x | x | x |
```
