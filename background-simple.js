// Background script for Payment Data Generator extension

// Import only the generator service
importScripts("services/generator.js");

// Initialize generator service
const generatorService = new GeneratorService();

console.log('✅ Background script loaded');

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("✅ 支付信息生成器扩展已安装");

  try {
    // Enable side panel for all tabs (if supported)
    if (chrome.sidePanel) {
      console.log("✅ Side Panel API 可用");
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true,
      });
    } else {
      console.log("⚠️ Side Panel API 不可用 - 需要 Chrome 114+");
    }
  } catch (error) {
    console.error("❌ 初始化错误:", error);
  }
});

// Handle messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      console.log("📨 收到消息:", request.type);
      
      switch (request.type) {
        case "ping":
          sendResponse({ success: true });
          break;

        case "generateAddress":
          try {
            console.log('📍 收到生成地址请求:', request.options);
            const country = request.options?.country || request.country || "US";
            console.log('🌍 使用国家:', country);
            
            const address = generatorService.generateAddress(country);
            const name = generatorService.generateName();
            const formatted = generatorService.formatAddressForDisplay(address);
            
            console.log('✅ 地址生成成功:', { country, name });
            
            sendResponse({
              success: true,
              data: { address: address, name: name, formatted: formatted },
            });
          } catch (error) {
            console.error('❌ 生成地址错误:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case "generatePaymentData":
          try {
            console.log('💳 收到生成卡片请求:', request.options);
            const options = request.options || {};
            const paymentData = generatorService.generatePaymentData(options);
            console.log('✅ 卡片生成成功:', paymentData.cards.length, '张');
            sendResponse({
              success: true,
              data: paymentData,
            });
          } catch (error) {
            console.error('❌ 生成卡片错误:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        default:
          console.warn('⚠️ 未知消息类型:', request.type);
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error('❌ 消息处理错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

console.log('✅ 消息监听器已设置');

