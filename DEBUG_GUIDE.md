# 调试指南 - 解决卡顿问题

## 🐛 问题：点击生成支付信息时卡顿

### 已修复的问题

#### 1. **消息处理器参数错误** ✅
**问题**: `generateAddress` 消息处理器没有正确接收 `options.country` 参数
```javascript
// ❌ 旧代码
const address = generatorService.generateAddress(request.country || "US");

// ✅ 新代码
const country = request.options?.country || request.country || "US";
const address = generatorService.generateAddress(country);
```

#### 2. **缺少中国、香港、澳门地址数据** ✅
**问题**: `generator.js` 中的 `getAddressData()` 没有中国地区数据，导致生成失败

**修复**: 添加了完整的地址数据
- 🇨🇳 中国：10个省份，10个城市，10条街道，6位邮编
- 🇭🇰 香港：10个区，3个城市，10条街道，无邮编
- 🇲🇴 澳门：8个区，3个城市，10条街道，无邮编

#### 3. **没有超时处理** ✅
**问题**: 如果消息处理失败，会永久等待

**修复**: 添加了 5 秒超时机制
```javascript
const cardResponse = await Promise.race([
  chrome.runtime.sendMessage({ type: 'generatePaymentData', ... }),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('生成卡片超时（5秒）')), 5000)
  )
]);
```

#### 4. **缺少详细日志** ✅
**修复**: 添加了完整的中文调试日志
- 📤 发送请求
- 📨 收到响应
- ✅ 成功信息
- ❌ 错误信息

---

## 🔍 如何调试

### 步骤 1: 打开开发者工具
1. 在扩展侧边栏或任何页面按 `F12`
2. 切换到 **Console（控制台）** 标签

### 步骤 2: 重新加载扩展
1. 打开 `chrome://extensions/`
2. 找到"支付信息生成器"
3. 点击刷新按钮 🔄

### 步骤 3: 生成数据并查看日志
1. 在扩展面板中选择国家（如 🇨🇳 中国）
2. 点击"生成完整支付信息"
3. 查看控制台输出

---

## 📊 正常的日志输出示例

```
📤 发送生成卡片请求...
💳 收到生成卡片请求: {bin: "552461", quantity: 10, month: null, year: null}
✅ 卡片生成成功: 10 张
📨 卡片响应: {success: true, data: {...}}
✅ 卡片生成成功，准备生成地址...
📤 发送生成地址请求，国家: CN
📍 收到生成地址请求: {country: "CN"}
🌍 使用国家: CN
🏠 生成地址，國家: CN
✅ 地址生成完成: {street: "1234 中山路", city: "北京", ...}
✅ 地址生成成功: {country: "CN", name: "..."}
📨 地址响应: {success: true, data: {...}}
✅ 地址生成成功
✅ 完整支付数据已生成并保存
```

---

## ❌ 错误日志示例

### 错误 1: 超时
```
📤 发送生成卡片请求...
❌ 生成失败: 生成卡片超时（5秒）
```
**解决方法**: 
- 检查 `background.js` 是否正在运行
- 重新加载扩展

### 错误 2: 国家不支持
```
⚠️ 國家 "XX" 沒有地址數據，使用美國數據
```
**解决方法**: 
- 这是警告，不是错误，会自动使用美国数据
- 如需添加该国家数据，请在 `services/generator.js` 的 `getAddressData()` 中添加

### 错误 3: 消息发送失败
```
❌ 发送消息失败: Could not establish connection
```
**解决方法**: 
- 刷新页面
- 重新加载扩展

---

## 🧪 测试各个国家

### 支持的国家列表
| 国家 | 代码 | 状态 | 特殊说明 |
|------|------|------|----------|
| 🇺🇸 美国 | US | ✅ | 完整支持 |
| 🇬🇧 英国 | GB | ✅ | 完整支持 |
| 🇨🇦 加拿大 | CA | ✅ | 完整支持 |
| 🇦🇺 澳大利亚 | AU | ✅ | 完整支持 |
| 🇩🇪 德国 | DE | ✅ | 完整支持 |
| 🇫🇷 法国 | FR | ✅ | 完整支持 |
| 🇨🇳 中国 | CN | ✅ | 新增支持 |
| 🇭🇰 香港 | HK | ✅ | 新增支持，无邮编 |
| 🇲🇴 澳门 | MO | ✅ | 新增支持，无邮编 |

### 测试步骤
```bash
1. 选择国家：🇨🇳 中国
2. 输入 BIN：552461
3. 数量：10
4. 点击"生成完整支付信息"
5. 查看控制台日志
6. 检查输出文本框中是否显示中文地址
```

### 预期输出（中国）
```
=== 国家/地区 ===
🇨🇳 中国

=== 支付卡片（共 10 张）===

卡片 1:
  卡号: 5524 6123 4567 8901
  有效期: 12/28
  CVV: 123

...

=== 持卡人信息 ===
姓名: John Smith

=== 账单地址 ===
国家: CN
城市: 北京
街道: 1234 中山路
邮编: 100001
州/省: 北京
```

---

## 🛠️ 高级调试

### 查看 Background Script 日志
1. 打开 `chrome://extensions/`
2. 找到"支付信息生成器"
3. 点击"service worker"链接
4. 会打开一个新的开发者工具窗口
5. 查看该窗口的控制台日志

### 查看存储的数据
在控制台输入：
```javascript
chrome.storage.local.get('generatedPaymentData', (result) => {
  console.log('存储的数据:', result);
});
```

### 清除存储的数据
```javascript
chrome.storage.local.remove('generatedPaymentData', () => {
  console.log('数据已清除');
});
```

---

## 📞 报告问题

如果问题仍然存在，请提供以下信息：

1. **完整的控制台日志**（从点击按钮到错误出现）
2. **选择的国家和参数**
3. **Chrome 版本**
4. **是否重新加载过扩展**
5. **Background Script 的日志**（如果有）

### 日志示例
```
选择的国家: 🇨🇳 中国
BIN: 552461
数量: 10
月份: 随机
年份: 随机

控制台输出:
[复制完整的控制台日志]
```

