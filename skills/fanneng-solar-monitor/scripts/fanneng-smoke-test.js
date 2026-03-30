#!/usr/bin/env node
/**
 * 冒烟测试: 验证脚本能否正确打开登录页面并定位到表单元素
 */

const { chromium } = require('playwright');

const LOGIN_URL =
  'https://authentication-center-new.ennew.com/login?appid=fnw-auth-manage&redirect=https%3A%2F%2Fweb.fanneng.com%2F&terminalType=PC-WEB-CHROME&tenantPageName=fanneng&sdkVersion=0.2.6&withTempAuthCode=true&checkWhiteUser=1&isDirectPage=1&logout=1';

(async () => {
  console.log('🧪 冒烟测试: 验证登录页面元素...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // 1. 打开登录页面
    console.log('1️⃣ 打开登录页面...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`   URL: ${page.url()}`);
    console.log(`   Title: ${await page.title()}`);

    await page.waitForTimeout(2000);

    // 2. 截图
    await page.screenshot({ path: '/tmp/fanneng-login-test.png', fullPage: true });
    console.log('   📸 截图已保存: /tmp/fanneng-login-test.png');

    // 3. 查找手机号输入框
    console.log('\n2️⃣ 查找表单元素...');
    const allInputs = await page.locator('input').all();
    console.log(`   找到 ${allInputs.length} 个 input 元素`);

    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const type = await input.getAttribute('type').catch(() => '');
      const placeholder = await input.getAttribute('placeholder').catch(() => '');
      const name = await input.getAttribute('name').catch(() => '');
      const className = await input.getAttribute('class').catch(() => '');
      const isVisible = await input.isVisible().catch(() => false);
      console.log(`   input[${i}]: type="${type}" placeholder="${placeholder}" name="${name}" visible=${isVisible}`);
    }

    // 4. 查找按钮
    const allButtons = await page.locator('button').all();
    console.log(`\n   找到 ${allButtons.length} 个 button 元素`);
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const text = await btn.textContent().catch(() => '');
      const isVisible = await btn.isVisible().catch(() => false);
      console.log(`   button[${i}]: text="${text.trim()}" visible=${isVisible}`);
    }

    // 5. 查找 checkbox
    const checkboxes = await page.locator('input[type="checkbox"]').all();
    console.log(`\n   找到 ${checkboxes.length} 个 checkbox`);
    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      const isChecked = await cb.isChecked().catch(() => false);
      const isVisible = await cb.isVisible().catch(() => false);
      console.log(`   checkbox[${i}]: checked=${isChecked} visible=${isVisible}`);
    }

    // 6. 测试填写表单（不实际提交）
    console.log('\n3️⃣ 测试填写表单...');
    const phoneInput = page.locator(
      'input[type="tel"], input[placeholder*="手机"], input[placeholder*="账号"], input[name*="phone"], input[name*="account"]'
    ).first();

    if ((await phoneInput.count()) > 0) {
      await phoneInput.fill('13800138000');
      console.log('   ✅ 手机号填写成功');
    } else {
      // 降级: 填第一个可见 text input
      const firstInput = page.locator('input:visible').first();
      await firstInput.fill('13800138000');
      console.log('   ✅ 手机号填写成功 (降级定位)');
    }

    const pwdInput = page.locator('input[type="password"]').first();
    if ((await pwdInput.count()) > 0) {
      await pwdInput.fill('testpassword');
      console.log('   ✅ 密码填写成功');
    } else {
      console.log('   ❌ 未找到密码输入框');
    }

    // 勾选协议
    if (checkboxes.length > 0) {
      try {
        await checkboxes[0].check({ force: true });
        console.log('   ✅ 协议勾选成功');
      } catch (e) {
        console.log('   ⚠️ 协议勾选失败:', e.message);
      }
    }

    // 截取填写后的截图
    await page.screenshot({ path: '/tmp/fanneng-login-filled.png', fullPage: true });
    console.log('   📸 填写后截图: /tmp/fanneng-login-filled.png');

    console.log('\n✅ 冒烟测试通过！登录页面元素定位正常。');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    await page.screenshot({ path: '/tmp/fanneng-login-error.png', fullPage: true });
    console.log('   📸 错误截图: /tmp/fanneng-login-error.png');
  } finally {
    await browser.close();
    console.log('\n🏁 浏览器已关闭');
  }
})();
