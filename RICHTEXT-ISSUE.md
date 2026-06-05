# MakerWorld Auto Translate - 富文本翻译问题记录

## 日期: 2026-04-06

## 问题描述

MakerWorld 国际站模型编辑页面的富文本框（contenteditable）中，翻译按钮可见且可点击，API 翻译成功返回英文内容，但富文本框的**可见内容不会更新**。

## 已确认的事实

### 正常工作的部分
1. **按钮注入成功** — contenteditable 元素被正确检测，翻译图标按钮出现在右上角
2. **点击事件正常** — 通过 document 级别 capture phase handler 成功拦截点击
3. **文本提取正常** — `el.innerText` 能正确获取富文本中的中文内容（323字符）
4. **API 调用成功** — LLM API 返回了 930 字符的英文翻译
5. **DOM 写入成功** — `el.innerText` 在 console 中显示已更新为英文

### 失败的部分
- 虽然 `el.innerText` 已被修改为英文，但**页面上可见的编辑器内容仍然是中文**
- 这说明 MakerWorld 的富文本编辑器维护了自己的内部状态，**不受直接 DOM 操作影响**

## 已尝试的方案及结果

| 方案 | 代码 | 结果 |
|------|------|------|
| `document.execCommand('selectAll')` + `execCommand('insertText')` | 先 focus，再 selectAll，再 insertText | `execCommand` 返回 `true` 但内容没变 |
| `el.innerHTML = ''` + `el.textContent = cleanValue` | 直接替换 DOM 内容 | `el.innerText` 显示已更新，但可见内容没变 |
| `el.dispatchEvent(new Event('input', {bubbles: true}))` | 触发 input/change 事件 | 无效果 |
| `new InputEvent('input', {inputType: 'insertText', data: value})` | — | 未尝试 |

## 根本原因分析

MakerWorld 的富文本编辑器（很可能是 Quill、ProseMirror、Slate 或类似的编辑器框架）使用了**虚拟 DOM 或内部状态模型**：
- 编辑器的显示内容不直接由 `innerHTML`/`textContent` 驱动
- 框架会在内部维护一个数据结构（如 Delta、AST），DOM 只是渲染结果
- 直接修改 DOM 不会触发框架的状态更新，框架可能在下一次渲染时用内部状态覆盖 DOM

## 已实施的解决方案

### 架构：MAIN World Bridge + HTML 翻译

**问题根因**：
1. Content script 运行在 isolated world，无法访问 CKEditor JS 实例
2. 页面 CSP 阻止内联 `<script>` 注入
3. 直接修改 DOM 无效（CKEditor 内部 model 会覆盖）

**解决方案**：
1. **`ckeditor-bridge.js`** — 通过 manifest.json 的 `"world": "MAIN"` 运行在页面 JS 上下文
   - 直接搜索 DOM 元素属性找到 CKEditor 实例（`Object.getOwnPropertyNames` + `Object.getOwnPropertySymbols`）
   - 通过 `window.postMessage` 与 content script 双向通信
   - 支持 `getData()` 和 `setData()` 两个操作

2. **HTML 感知翻译**（保留图片）：
   - 从 CKEditor 获取完整 HTML（`editor.getData()`）
   - 将 `<img>` 标签替换为占位符 `[MW_IMG_0]`
   - 使用专门的 HTML 翻译 prompt 发送给 LLM（要求保留 HTML 标签）
   - 翻译完成后恢复图片占位符
   - 通过 bridge 设置回 CKEditor

3. **通信流程**：
   ```
   content.js (isolated world)  ←→  window.postMessage  ←→  ckeditor-bridge.js (MAIN world)
         │                                                              │
         ├── mw-ckeditor-get →                                          ├── editor.getData()
         ├── mw-ckeditor-get-result ←                                   │
         ├── mw-ckeditor-set →                                          ├── editor.setData()
         └── mw-ckeditor-result ←                                       │
   ```

### 文件变更
- `shared/constants.js` — 新增 `SYSTEM_PROMPT_HTML`（HTML 感知翻译提示词）
- `background.js` — 支持 `isHtml` 标志，选择对应 prompt
- `content/content.js` — 新增 `handleRichTranslate`、`getCKEditorHTML`、`setCKEditorHTML`
- `content/ckeditor-bridge.js` — 新增 `mw-ckeditor-get` handler
- `manifest.json` — 新增 MAIN world content script 入口

### 方向 1: 识别编辑器框架并使用其 API
- 打开 F12 → Elements，检查富文本容器上是否有 `data-` 属性标识编辑器类型
- 常见标识：
  - Quill: `.ql-editor` class, `Quill` 全局对象
  - TinyMCE: `tinymce` 全局对象, `mce-` 前缀 class
  - ProseMirror: `.ProseMirror` class
  - Slate: `data-slate-editor` 属性
- 找到框架后，通过其 API 设置内容（如 `quill.setText()`, `editor.setContent()` 等）

### 方向 2: 模拟键盘输入
- 用 `document.execCommand('selectAll')` 选中所有文本
- 然后逐字符用 `KeyboardEvent` 模拟输入
- 或者用 Clipboard API: `navigator.clipboard.writeText(translated)` → 选中全部 → `document.execCommand('paste')`

### 方向 3: 模拟 InputEvent
- 有些框架监听原生的 `InputEvent` 而非通用的 `input` 事件
- 尝试: `el.dispatchEvent(new InputEvent('beforeinput', {inputType: 'insertText', data: value, bubbles: true}))`

### 方向 4: 找到 React/Vue 组件的 state setter
- 在 React DevTools 中找到编辑器组件
- 通过 `__reactFiber$` 或 `__reactInternalInstance$` 访问组件实例
- 直接调用 state 更新函数

## 调试命令

在 F12 Console 中执行以下命令来识别编辑器类型：

```javascript
// 检查编辑器框架
console.log('Quill:', !!document.querySelector('.ql-editor'));
console.log('ProseMirror:', !!document.querySelector('.ProseMirror'));
console.log('Slate:', !!document.querySelector('[data-slate-editor]'));
console.log('TinyMCE:', !!window.tinymce);
console.log('CKEditor:', !!window.CKEDITOR);
console.log('Draft.js:', !!document.querySelector('[data-contents="true"]'));

// 检查 contenteditable 元素上的属性
var ce = document.querySelector('[contenteditable="true"]');
if (ce) {
  console.log('Classes:', ce.className);
  console.log('Data attrs:', Array.from(ce.attributes).filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value));
  console.log('Parent classes:', ce.parentElement?.className);
}

// 检查 React fiber
if (ce && ce.__reactFiber$) {
  console.log('React fiber found:', ce.__reactFiber$);
}
```

## 项目文件结构

```
makerworld-auto-translate/
├── manifest.json              # Manifest V3, service_worker: background.js
├── background.js              # Service Worker (扩展根目录), API 调用 + 7天缓存
├── shared/
│   ├── constants.js           # 预设(ZhiPu/DeepSeek, 无硬编码模型名), 翻译提示词
│   └── storage.js             # getConfig(), saveConfig()
├── content/
│   ├── content.js             # Content Script: DOM注入, contenteditable支持, 调试日志
│   └── content.css            # 翻译按钮样式
├── options/
│   ├── options.html           # 设置页: 厂商选择, API Key, 动态模型列表
│   ├── options.js             # 加载/保存配置, Fetch Models 从厂商API
│   └── options.css            # 设置页样式
└── icons/                     # 16/48/128px PNG图标
```

## 关键技术决策记录

1. **background.js 放在扩展根目录** — Chrome MV3 service worker 的 scope 限制在其所在目录，放在根目录才能 `importScripts('shared/constants.js')`
2. **不使用 DOM wrapping** — 直接插入按钮作为 sibling（非 wrapper），避免破坏 React/Vue 布局
3. **document 级 capture click handler** — 富文本编辑器会拦截普通 click 事件，必须在 capture 阶段拦截
4. **`mousedown` 上加 `stopImmediatePropagation`** — 防止编辑器在 mousedown 阶段抢走焦点
5. **模型列表从厂商 API 动态加载** — 不硬编码模型名，通过 Fetch Models 按钮获取
