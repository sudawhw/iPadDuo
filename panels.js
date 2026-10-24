// 应用交互面板：Mac 最前面是这些应用时，iPad 触控板的「面板」模式显示对应的按钮与输入区。
//
// 每个动作按优先级尝试：
//   menu   —— 点击应用菜单栏里的菜单项（「菜单 > 项」路径，给中英文候选，不依赖快捷键）
//   button —— 点击窗口里标题匹配正则的按钮（辅助功能）
//   key    —— 发送组合键（最后的退路）
// popup 类型（模型、项目）会先点开下拉菜单，把选项读出来列在 iPad 上，点哪项就选哪项。
// 名称与菜单路径来自对应应用实际的菜单 / 辅助功能树，新版本改名时在这里补充候选即可。
'use strict';

const CHATGPT = {
  name: 'ChatGPT',
  composerHint: '发消息给 ChatGPT…',
  popups: [
    { id: 'model', label: '模型', button: '^(GPT|o\\d|ChatGPT|Sol|模型|Model)' },
    { id: 'project', label: '项目', button: '^(选择项目|Choose project|Project)' },
  ],
  actions: [
    { id: 'new', label: '新聊天', icon: 'plus', menu: ['文件 > 新聊天', 'File > New Chat'], key: 'cmd+n' },
    { id: 'temp', label: '临时聊天', icon: 'ghost', menu: ['文件 > 新建临时聊天', 'File > New Temporary Chat'] },
    { id: 'newproj', label: '新建项目', icon: 'folder', menu: ['文件 > 新建项目…', 'File > New Project…'] },
    { id: 'search', label: '搜索', icon: 'search', button: '^(搜索|Search)$' },
    { id: 'prev', label: '上一个', icon: 'up', menu: ['视图 > 上一个侧边栏条目', 'View > Previous Sidebar Item'] },
    { id: 'next', label: '下一个', icon: 'down', menu: ['视图 > 下一个侧边栏项目', 'View > Next Sidebar Item'] },
    { id: 'sidebar', label: '侧边栏', icon: 'sidebar', menu: ['视图 > 显示/隐藏侧边栏', 'View > Toggle Sidebar', 'View > Show/Hide Sidebar'] },
    { id: 'read', label: '朗读', icon: 'speaker', menu: ['编辑 > 语音 > 开始朗读', 'Edit > Speech > Start Speaking'] },
    { id: 'voicechat', label: '语音聊天', icon: 'wave', button: '^(开始新的语音聊天|Start voice|Voice)' },
    { id: 'stop', label: '停止', icon: 'stop', button: '^(停止|Stop)', key: 'esc' },
  ],
  dictate: { button: '^(听写|Dictate|Dictation)$', menu: ['编辑 > 开始听写…', 'Edit > Start Dictation…'] },
};

const PANELS = {
  'com.anthropic.claudefordesktop': {
    name: 'Claude',
    composerHint: '回复 Claude…',
    popups: [
      { id: 'model', label: '模型', button: '^(模型|Model)' },
    ],
    actions: [
      { id: 'new', label: '新建会话', icon: 'plus', menu: ['文件 > 新建会话', 'File > New Chat', 'File > New Conversation'], key: 'cmd+n' },
      { id: 'search', label: '搜索会话', icon: 'search', menu: ['转到 > 搜索…', 'Go > Search…'] },
      { id: 'prev', label: '上一个会话', icon: 'up', menu: ['转到 > 上一个会话', 'Go > Previous Chat', 'Go > Previous Conversation'] },
      { id: 'next', label: '下一个会话', icon: 'down', menu: ['转到 > 下一个会话', 'Go > Next Chat', 'Go > Next Conversation'] },
      { id: 'sidebar', label: '侧边栏', icon: 'sidebar', menu: ['视图 > 隐藏侧边栏', '视图 > 显示侧边栏', 'View > Hide Sidebar', 'View > Show Sidebar'] },
      { id: 'side', label: '侧边对话', icon: 'split', menu: ['文件 > 新建侧边对话', 'File > New Side Chat'] },
      { id: 'palette', label: '命令面板', icon: 'cmd', menu: ['视图 > 命令面板…', 'View > Command Palette…'] },
      { id: 'code', label: 'Code', icon: 'code', menu: ['转到 > Code', 'Go > Code'] },
      { id: 'stop', label: '停止', icon: 'stop', button: '^(停止|Stop)', key: 'esc' },
    ],
    dictate: { menu: ['编辑 > 开始听写…', 'Edit > Start Dictation…'] },
  },
  'com.openai.codex': CHATGPT,   // 新版 ChatGPT 桌面应用
  'com.openai.chat': CHATGPT,    // 旧版 ChatGPT 桌面应用
};

// 发给 iPad 的版本：去掉执行细节
function publicPanel(bundle) {
  const p = PANELS[bundle];
  if (!p) return null;
  return {
    bundle,
    name: p.name,
    composerHint: p.composerHint,
    popups: p.popups.map((x) => ({ id: x.id, label: x.label })),
    actions: p.actions.map((x) => ({ id: x.id, label: x.label, icon: x.icon })),
    dictate: !!p.dictate,
  };
}

function list() {
  const seen = {};
  return Object.keys(PANELS).filter((b) => {
    const n = PANELS[b].name;
    if (seen[n]) return false;
    seen[n] = true;
    return true;
  }).map((b) => ({ bundle: b, name: PANELS[b].name }));
}

module.exports = { PANELS, publicPanel, list };
