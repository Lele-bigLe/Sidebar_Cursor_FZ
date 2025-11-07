// 支付信息生成器 - 简化版

class PaymentGenerator {
  constructor() {
    this.generatedData = null; // 存储生成的数据
    this.init();
  }

  init() {
    // 初始化暗色模式切换
    this.initDarkMode();
    
    // 初始化生成器按钮
    this.initGeneratorButtons();
    
    // 初始化 BIN 历史记录
    this.initBinHistory();
    
    // 加载保存的设置
    this.loadSettings();
  }

  // 暗色模式
  initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark);
      });
    }

    // 加载暗色模式设置
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
      document.body.classList.add('dark-mode');
    }
  }

  // 初始化生成器按钮
  initGeneratorButtons() {
    // 生成支付数据按钮
    const generateBtn = document.getElementById('generateCardsBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generatePaymentData());
    }

    // 填充到表单按钮
    const fillFormBtn = document.getElementById('fillFormBtn');
    if (fillFormBtn) {
      fillFormBtn.addEventListener('click', () => this.fillPaymentForm());
    }

    // 自动提交开关
    const autoSubmitCheck = document.getElementById('autoSubmitEnabled');
    if (autoSubmitCheck) {
      autoSubmitCheck.addEventListener('change', (e) => {
        localStorage.setItem('autoSubmitEnabled', e.target.checked);
      });
    }
  }

  // 加载设置
  loadSettings() {
    const autoSubmitEnabled = localStorage.getItem('autoSubmitEnabled');
    if (autoSubmitEnabled !== null) {
      document.getElementById('autoSubmitEnabled').checked = autoSubmitEnabled === 'true';
    }
  }

  // 生成完整支付数据（包括卡片、姓名、地址）
  async generatePaymentData() {
    const bin = document.getElementById('binInput').value.trim();
    const quantity = parseInt(document.getElementById('cardQuantity').value) || 10;
    const month = document.getElementById('monthSelect').value;
    const year = document.getElementById('yearSelect').value;
    const country = document.getElementById('countrySelect').value;

    if (!bin || bin.length < 6) {
      this.showGenerateStatus('请输入至少 6 位的 BIN 码', 'error');
      return;
    }

    try {
      // 显示生成中状态
      this.showGenerateStatus('🔄 正在生成支付信息...', 'info');

      // 保存 BIN 到历史记录
      this.addBinToHistory(bin);

      console.log('📤 发送生成卡片请求...');
      
      // 1. 生成卡片数据（带超时）
      const cardResponse = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'generatePaymentData',
          options: {
            bin: bin,
            quantity: quantity,
            month: month === 'Random' ? null : month,
            year: year === 'Random' ? null : year
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('生成卡片超时（5秒）')), 5000)
        )
      ]);

      console.log('📨 卡片响应:', cardResponse);

      if (!cardResponse || !cardResponse.success) {
        throw new Error(cardResponse?.error || '卡片生成失败');
      }

      console.log('✅ 卡片生成成功，准备生成地址...');
      console.log('📤 发送生成地址请求，国家:', country);

      // 2. 生成地址和姓名（带超时）
      const addressResponse = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'generateAddress',
          options: { country: country }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('生成地址超时（5秒）')), 5000)
        )
      ]);

      console.log('📨 地址响应:', addressResponse);

      if (!addressResponse || !addressResponse.success) {
        throw new Error(addressResponse?.error || '地址生成失败');
      }

      console.log('✅ 地址生成成功');

      // 3. 合并数据
      const data = {
        ...cardResponse.data,
        name: addressResponse.data.name,
        address: addressResponse.data.address
      };

      // 4. 格式化输出
      let output = '';
      
      // 国家信息
      output += `=== 国家/地区 ===\n`;
      output += `${this.getCountryName(country)}\n\n`;

      // 卡片信息
      if (data.cards && data.cards.length > 0) {
        output += `=== 支付卡片（共 ${data.cards.length} 张）===\n\n`;
        data.cards.forEach((card, index) => {
          output += `卡片 ${index + 1}:\n`;
          output += `  卡号: ${card.number}\n`;
          output += `  有效期: ${card.month.toString().padStart(2, '0')}/${card.year}\n`;
          output += `  CVV: ${card.cvv}\n\n`;
        });
      }

      // 持卡人信息
      if (data.name) {
        output += `=== 持卡人信息 ===\n`;
        output += `姓名: ${data.name}\n\n`;
      }

      // 账单地址
      if (data.address) {
        output += `=== 账单地址 ===\n`;
        output += `国家: ${data.address.country}\n`;
        output += `城市: ${data.address.city}\n`;
        output += `街道: ${data.address.street}\n`;
        output += `邮编: ${data.address.postalCode}\n`;
        if (data.address.state) {
          output += `州/省: ${data.address.state}\n`;
        }
      }

      // 显示结果
      document.getElementById('cardOutput').value = output;
      
      // 显示成功状态（不使用通知切换面板）
      this.showGenerateStatus(`✅ 成功生成 ${data.cards.length} 张卡片及完整账单信息`, 'success');

      // 保存生成的数据
      this.generatedData = data;
      await chrome.storage.local.set({ 'generatedPaymentData': data });
      console.log('✅ 完整支付数据已生成并保存');

      // 启用填充按钮
      const fillFormBtn = document.getElementById('fillFormBtn');
      if (fillFormBtn) {
        fillFormBtn.disabled = false;
      }

    } catch (error) {
      console.error('生成支付数据错误:', error);
      this.showGenerateStatus('❌ 生成失败: ' + error.message, 'error');
    }
  }

  // 获取国家名称
  getCountryName(code) {
    const countryNames = {
      'US': '🇺🇸 美国',
      'GB': '🇬🇧 英国',
      'CA': '🇨🇦 加拿大',
      'AU': '🇦🇺 澳大利亚',
      'DE': '🇩🇪 德国',
      'FR': '🇫🇷 法国',
      'CN': '🇨🇳 中国',
      'HK': '🇭🇰 香港',
      'MO': '🇲🇴 澳门'
    };
    return countryNames[code] || code;
  }

  // 显示生成状态（在当前面板内显示，不使用通知）
  showGenerateStatus(message, type = 'info') {
    const statusDiv = document.getElementById('generateStatus');
    const statusText = document.getElementById('generateStatusText');
    
    if (statusDiv && statusText) {
      statusText.textContent = message;
      statusDiv.className = `generate-status ${type}`;
      statusDiv.style.display = 'block';

      // 成功或错误消息 5 秒后自动隐藏
      if (type === 'success' || type === 'error') {
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 5000);
      }
    }
  }


  // BIN 历史记录管理
  initBinHistory() {
    const binInput = document.getElementById('binInput');
    if (!binInput) return;

    binInput.addEventListener('focus', () => {
      this.showBinHistory();
    });

    binInput.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideBinHistory();
      }, 200);
    });

    this.loadBinHistory();
  }

  getBinHistory() {
    const stored = localStorage.getItem('cursor_bin_history');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  saveBinHistory(history) {
    localStorage.setItem('cursor_bin_history', JSON.stringify(history));
  }

  addBinToHistory(binCode) {
    if (!binCode || binCode.length < 6) return;

    let history = this.getBinHistory();
    
    // 移除重复项
    history = history.filter(item => item.bin !== binCode);
    
    // 获取 BIN 信息
    const binInfo = this.getBinInfo(binCode);
    history.unshift({
      bin: binCode,
      ...binInfo,
      lastUsed: new Date().toISOString()
    });

    // 只保留最近 10 个
    history = history.slice(0, 10);

    this.saveBinHistory(history);
    this.renderBinHistory();
  }

  getBinInfo(bin) {
    const cleanBin = bin.replace(/[x\s]/gi, '');
    
    if (/^4/.test(cleanBin)) return { type: 'Visa', description: 'Visa 信用卡' };
    if (/^5[1-5]/.test(cleanBin) || /^2[2-7]/.test(cleanBin)) return { type: 'MasterCard', description: 'MasterCard 信用卡' };
    if (/^3[47]/.test(cleanBin)) return { type: 'American Express', description: 'Amex 信用卡' };
    if (/^6(?:011|5)/.test(cleanBin)) return { type: 'Discover', description: 'Discover 信用卡' };
    if (/^3[0689]/.test(cleanBin)) return { type: 'Diners Club', description: 'Diners Club 卡' };
    if (/^35/.test(cleanBin)) return { type: 'JCB', description: 'JCB 信用卡' };
    
    return { type: 'Unknown', description: '未知卡类型' };
  }

  loadBinHistory() {
    this.renderBinHistory();
  }

  showBinHistory() {
    const dropdown = document.getElementById('binHistoryDropdown');
    if (dropdown) {
      this.renderBinHistory();
      dropdown.style.display = 'block';
    }
  }

  hideBinHistory() {
    const dropdown = document.getElementById('binHistoryDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  renderBinHistory() {
    const dropdown = document.getElementById('binHistoryDropdown');
    if (!dropdown) return;

    const history = this.getBinHistory();
    
    if (history.length === 0) {
      dropdown.innerHTML = '<div class="bin-history-item">暂无历史记录</div>';
      return;
    }

    dropdown.innerHTML = history.map(item => `
      <div class="bin-history-item" data-bin="${item.bin}">
        <div class="bin-code">${item.bin}</div>
        <div class="bin-info">
          <span class="bin-type">${item.type}</span>
          <span class="bin-desc">${item.description}</span>
        </div>
      </div>
    `).join('');

    // 添加点击事件
    dropdown.querySelectorAll('.bin-history-item').forEach(item => {
      item.addEventListener('click', () => {
        const bin = item.dataset.bin;
        document.getElementById('binInput').value = bin;
        this.hideBinHistory();
      });
    });
  }

  // 填充支付表单
  async fillPaymentForm() {
    console.log('🚀 开始填充支付表单');
    
    if (!this.generatedData) {
      this.showGenerateStatus('请先生成支付数据', 'error');
      return;
    }

    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        this.showGenerateStatus('无法找到活动标签页', 'error');
        return;
      }

      console.log('📍 当前标签页:', tab.url);

      // 检查是否是支付页面
      if (!tab.url || (!tab.url.includes('checkout') && !tab.url.includes('payment'))) {
        const confirmFill = confirm('当前页面可能不是支付页面，是否仍要填充？');
        if (!confirmFill) {
          return;
        }
      }

      // 显示填充中状态
      this.showGenerateStatus('🔄 正在填充表单...', 'info');

      // 发送填充命令到内容脚本
      chrome.tabs.sendMessage(tab.id, {
        type: 'fillPaymentForm',
        data: this.generatedData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ 发送消息错误:', chrome.runtime.lastError);
          this.showGenerateStatus('无法连接到页面，请刷新页面后重试', 'error');
          return;
        }

        console.log('📨 收到填充响应:', response);

        if (response && response.success) {
          console.log('✅ 表单填充成功');
          this.showGenerateStatus('✅ 表单填充成功！', 'success');
          
          // 如果启用了自动提交
          const autoSubmitEnabled = document.getElementById('autoSubmitEnabled')?.checked;
          if (autoSubmitEnabled) {
            console.log('🚀 自动提交已启用，2秒后提交...');
            this.showGenerateStatus('⏳ 2秒后自动提交表单...', 'info');
            
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'submitPaymentForm'
              }, (submitResponse) => {
                if (chrome.runtime.lastError) {
                  console.error('提交失败:', chrome.runtime.lastError);
                  this.showGenerateStatus('表单提交失败', 'error');
                } else {
                  console.log('✅ 表单已提交');
                  this.showGenerateStatus('✅ 表单已提交', 'success');
                }
              });
            }, 2000);
          }
        } else {
          const errorMsg = response?.error || '未知错误';
          console.error('❌ 表单填充失败:', errorMsg);
          this.showGenerateStatus('填充失败: ' + errorMsg, 'error');
        }
      });

    } catch (error) {
      console.error('❌ 填充表单错误:', error);
      this.showGenerateStatus('填充失败: ' + error.message, 'error');
    }
  }

  // 显示通知（已弃用，使用 showGenerateStatus 代替）
  showNotification(message, type = 'info') {
    // 重定向到 showGenerateStatus，保持在当前面板显示
    this.showGenerateStatus(message, type);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  window.paymentGenerator = new PaymentGenerator();
});

