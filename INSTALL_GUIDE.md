# 扩展安装和修复指南

## 🚨 扩展打不开的解决方法

### 方法 1: 重新加载扩展

1. **打开扩展管理页面**
   ```
   在地址栏输入: chrome://extensions/
   ```

2. **启用开发者模式**
   - 在页面右上角找到"开发者模式"开关
   - 确保它是开启状态（蓝色）

3. **找到"支付信息生成器"扩展**
   - 如果显示错误，请查看错误信息

4. **点击刷新按钮** 🔄
   - 位于扩展卡片的右下角

5. **检查错误**
   - 如果仍有错误，点击"错误"按钮查看详细信息

---

### 方法 2: 检查 Service Worker

1. **打开扩展管理页面**
   ```
   chrome://extensions/
   ```

2. **找到"支付信息生成器"**

3. **点击"service worker"链接**
   - 如果显示"无效"，说明 background.js 加载失败

4. **查看控制台错误**
   - 会打开一个新的开发者工具窗口
   - 查看是否有红色错误信息

5. **常见错误和解决方法**:

   **错误 A: SyntaxError**
   ```
   SyntaxError: Unexpected token
   ```
   - 说明 JS 文件有语法错误
   - 请检查最近修改的文件

   **错误 B: Import Error**
   ```
   Failed to load script: services/generator.js
   ```
   - 检查文件是否存在
   - 检查路径是否正确

---

### 方法 3: 完全重新安装

1. **移除扩展**
   ```
   chrome://extensions/ → 找到扩展 → 点击"移除"
   ```

2. **清除缓存**
   - Chrome 设置 → 隐私和安全 → 清除浏览数据
   - 选择"缓存的图片和文件"
   - 时间范围：过去 1 小时
   - 点击"清除数据"

3. **重新加载扩展**
   ```
   chrome://extensions/ → 点击"加载已解压的扩展程序"
   → 选择项目文件夹: D:\lt\Sidebar_Cursor_FZ
   ```

4. **验证安装**
   - 检查扩展是否出现在列表中
   - 检查是否有错误提示
   - 点击扩展图标测试

---

## 🔍 诊断步骤

### 1. 检查文件完整性

确保以下文件存在：
```
D:\lt\Sidebar_Cursor_FZ\
├── manifest.json           ✓
├── background.js           ✓
├── sidepanel.html          ✓
├── sidepanel-simple.js     ✓
├── auto-fill.js            ✓
├── services\
│   └── generator.js        ✓
└── icons\
    └── icon64.png          ✓
```

**检查命令（在 PowerShell 中）**:
```powershell
cd D:\lt\Sidebar_Cursor_FZ
dir manifest.json, background.js, sidepanel.html, sidepanel-simple.js, auto-fill.js
dir services\generator.js
dir icons\icon64.png
```

### 2. 验证 manifest.json

打开 `chrome://extensions/` 查看是否有警告：
- ⚠️ **Manifest Version**: 必须是 3
- ⚠️ **Permissions**: 检查是否有被拒绝的权限
- ⚠️ **Service Worker**: 必须指向 `background.js`

### 3. 测试 Service Worker

在扩展管理页面：
1. 点击"service worker"链接
2. 在打开的控制台中输入：
   ```javascript
   console.log('Test');
   ```
3. 如果显示 "Test"，说明 service worker 正常运行

### 4. 检查侧边栏

1. 打开任意网页
2. 点击扩展图标
3. 应该会显示侧边栏
4. 按 F12 打开开发者工具
5. 查看是否有错误

---

## 🐛 常见问题和解决方法

### 问题 1: 扩展图标不显示

**症状**: 工具栏没有扩展图标

**解决方法**:
1. 点击工具栏的拼图图标 🧩
2. 找到"支付信息生成器"
3. 点击图钉 📌 固定到工具栏

### 问题 2: 侧边栏是空白的

**症状**: 点击图标后侧边栏打开但是空白

**解决方法**:
1. 右键点击侧边栏
2. 选择"检查"
3. 查看控制台错误
4. 常见原因：
   - `sidepanel-simple.js` 文件路径错误
   - JavaScript 语法错误

### 问题 3: Service Worker 无效

**症状**: Service Worker 显示"无效"或"已停止"

**解决方法**:
```javascript
// 在 chrome://extensions/ 的 service worker 控制台中运行
chrome.runtime.reload();
```

### 问题 4: 生成按钮无响应

**症状**: 点击"生成完整支付信息"没有反应

**解决方法**:
1. 打开侧边栏
2. 按 F12 打开开发者工具
3. 查看控制台是否有错误
4. 检查 `sidepanel-simple.js` 是否正确加载

---

## 📋 验证安装成功的检查清单

安装成功后，应该满足以下条件：

- [ ] `chrome://extensions/` 中能看到扩展
- [ ] 扩展状态是"已启用"
- [ ] 没有显示任何错误信息
- [ ] Service Worker 显示"活跃"或可点击
- [ ] 点击扩展图标能打开侧边栏
- [ ] 侧边栏显示完整的 UI（不是空白）
- [ ] 能看到三个步骤的面板布局
- [ ] 国家下拉菜单包含 9 个国家
- [ ] "生成完整支付信息"按钮可点击
- [ ] 点击生成按钮有反应（显示状态）

---

## 🔧 手动修复步骤

### 如果扩展仍然无法工作

1. **备份当前文件**
   ```powershell
   cd D:\lt\Sidebar_Cursor_FZ
   mkdir ..\Sidebar_Cursor_FZ_backup
   xcopy /E /I . ..\Sidebar_Cursor_FZ_backup
   ```

2. **检查最近的修改**
   - 查看 `services/generator.js`
   - 查看 `background.js`
   - 查看 `sidepanel-simple.js`

3. **回滚到工作版本**
   - 如果有 Git，运行: `git status`
   - 查看哪些文件被修改了
   - 必要时回滚: `git checkout -- <file>`

4. **逐个文件测试**
   - 先确保基本的 `manifest.json` 和 `background.js` 能工作
   - 然后测试 `sidepanel.html`
   - 最后测试 `auto-fill.js`

---

## 📞 获取帮助

如果问题仍未解决，请提供以下信息：

1. **Chrome 版本**
   ```
   chrome://version/
   ```

2. **扩展管理页面截图**
   - 包括错误信息

3. **Service Worker 控制台日志**
   - 完整的错误堆栈

4. **侧边栏控制台日志**
   - 如果侧边栏能打开的话

5. **文件列表**
   ```powershell
   cd D:\lt\Sidebar_Cursor_FZ
   dir /s /b
   ```

---

## ✅ 快速测试命令

在 PowerShell 中运行以下命令来快速检查：

```powershell
# 切换到项目目录
cd D:\lt\Sidebar_Cursor_FZ

# 检查关键文件
Write-Host "检查关键文件..." -ForegroundColor Cyan
$files = @(
    "manifest.json",
    "background.js", 
    "sidepanel.html",
    "sidepanel-simple.js",
    "auto-fill.js",
    "services\generator.js"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "✓ $file" -ForegroundColor Green
    } else {
        Write-Host "✗ $file (缺失)" -ForegroundColor Red
    }
}

# 检查文件大小（检测是否为空）
Write-Host "`n检查文件大小..." -ForegroundColor Cyan
foreach ($file in $files) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        if ($size -eq 0) {
            Write-Host "⚠ $file (文件为空)" -ForegroundColor Yellow
        } else {
            Write-Host "✓ $file ($size 字节)" -ForegroundColor Green
        }
    }
}
```

