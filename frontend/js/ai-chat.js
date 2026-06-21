/* AI 分析助手 */

// ==================== 基础状态 ====================
let currentPromptId = 'query';
let allPrompts = [];
let aiSettings = null;
let streamingEnabled = localStorage.getItem('ai-stream-enabled') !== 'false';

// ==================== 提示词标签栏 ====================
async function loadPromptBar() {
  try {
    const resp = await fetch(`${API}/ai/prompts`);
    const data = await resp.json();
    allPrompts = data.prompts || [];
    renderPromptBar();
  } catch (e) {
    console.error('加载提示词失败:', e);
  }
}

function renderPromptBar() {
  const bar = document.getElementById('ai-prompt-bar');
  if (!bar) return;

  // 确保当前选中的提示词还存在
  if (!allPrompts.find(p => p.id === currentPromptId) && allPrompts.length > 0) {
    currentPromptId = allPrompts[0].id;
  }

  bar.innerHTML = allPrompts.map(p => `
    <div class="prompt-chip ${p.id === currentPromptId ? 'active' : ''}"
         data-id="${p.id}" onclick="selectPrompt('${p.id}')" title="${escapeHtml(p.name)}">
      <span class="chip-name">${escapeHtml(p.name)}</span>
    </div>
  `).join('');

  // 同步刷新设置面板中的提示词列表
  if (document.getElementById('prompts-list')) {
    renderSettingsPrompts();
  }
}

function selectPrompt(id) {
  if (!allPrompts.find(p => p.id === id)) return;
  currentPromptId = id;
  document.querySelectorAll('.prompt-chip').forEach(c => c.classList.remove('active'));
  const chip = document.querySelector(`.prompt-chip[data-id="${id}"]`);
  if (chip) chip.classList.add('active');
}

// ==================== 流式开关 ====================
function toggleStream() {
  streamingEnabled = document.getElementById('stream-toggle').checked;
  localStorage.setItem('ai-stream-enabled', streamingEnabled);
}

// ==================== 思考面板折叠 ====================
function toggleThinking(btn) {
  const panel = btn.closest('.thinking-panel');
  if (panel) panel.classList.toggle('open');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('stream-toggle');
  if (toggle) toggle.checked = streamingEnabled;
  loadPromptBar();
});

// ==================== 发送消息 ====================
async function sendMessage() {
  const input = document.getElementById('ai-input');
  const message = input.value.trim();
  if (!message) return;

  if (streamingEnabled) {
    return sendMessageStream(message);
  }

  const chatDiv = document.getElementById('ai-chat');

  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = message;
  chatDiv.appendChild(userMsg);
  input.value = '';
  chatDiv.scrollTop = chatDiv.scrollHeight;

  const body = { message, mode: currentPromptId };
  try {
    const resp = await fetch(`${API}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    const reply = data.reply || data.report || '(无回复)';

    const aiMsg = document.createElement('div');
    aiMsg.className = 'msg ai';
    aiMsg.textContent = reply;
    chatDiv.appendChild(aiMsg);
  } catch (e) {
    const errMsg = document.createElement('div');
    errMsg.className = 'msg ai';
    errMsg.textContent = 'AI 服务暂不可用，请检查设置中的 API 地址和 Key 是否正确';
    chatDiv.appendChild(errMsg);
  }
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

// ==================== 流式发送消息 ====================
async function sendMessageStream(message) {
  const input = document.getElementById('ai-input');
  const chatDiv = document.getElementById('ai-chat');

  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = message;
  chatDiv.appendChild(userMsg);
  input.value = '';

  const aiMsg = document.createElement('div');
  aiMsg.className = 'msg ai';

  // 思考面板
  const thinkingPanel = document.createElement('div');
  thinkingPanel.className = 'thinking-panel';
  thinkingPanel.style.display = 'none';
  thinkingPanel.innerHTML = `
    <button class="thinking-toggle" onclick="toggleThinking(this)">
      💭 思考过程 <span class="thinking-arrow">▸</span>
    </button>
    <div class="thinking-content"></div>
  `;
  aiMsg.appendChild(thinkingPanel);

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-content';
  aiMsg.appendChild(msgContent);

  const cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  cursor.innerHTML = '▌';
  cursor.style.display = 'none';
  aiMsg.appendChild(cursor);

  chatDiv.appendChild(aiMsg);

  const scrollToChat = () => { chatDiv.scrollTop = chatDiv.scrollHeight; };
  scrollToChat();

  try {
    const resp = await fetch(`${API}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode: currentPromptId }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasThinking = false;
    let hasContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.text || '';

            if (currentEvent === 'thinking' || (!currentEvent && text && !hasContent)) {
              if (!hasThinking) {
                thinkingPanel.style.display = 'block';
                hasThinking = true;
              }
              const thinkingContent = thinkingPanel.querySelector('.thinking-content');
              if (thinkingContent) {
                thinkingContent.textContent += text;
                thinkingContent.scrollTop = thinkingContent.scrollHeight;
              }
            } else if (currentEvent === 'content' || (!currentEvent && text && hasThinking)) {
              if (!hasContent) {
                thinkingPanel.classList.add('open');
                setTimeout(() => { thinkingPanel.classList.remove('open'); }, 500);
                cursor.style.display = 'inline';
                hasContent = true;
              }
              msgContent.textContent += text;
              scrollToChat();
            } else if (currentEvent === 'error') {
              msgContent.textContent = msgContent.textContent || '错误: ' + text;
              cursor.style.display = 'none';
              return;
            } else if (currentEvent === 'done') {
              cursor.style.display = 'none';
              return;
            }
          } catch {
            // Skip unparseable data
          }
        }
      }
    }

    cursor.style.display = 'none';
  } catch (e) {
    cursor.style.display = 'none';
    msgContent.textContent = msgContent.textContent || 'AI 服务暂不可用，请检查设置中的 API 地址和 Key 是否正确';
  }
  scrollToChat();
}

// ==================== 设置面板 ====================
function openSettings() {
  document.getElementById('settings-overlay').style.display = 'flex';
  loadSettings();
  loadPrompts();
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

// 点击覆盖层关闭
document.addEventListener('click', (e) => {
  if (e.target.id === 'settings-overlay') closeSettings();
});

// 标签页切换
document.addEventListener('click', (e) => {
  const stab = e.target.closest('.stab[data-tab]');
  if (stab) {
    const tabId = stab.dataset.tab;
    document.querySelectorAll('.stab').forEach(s => s.classList.remove('active'));
    stab.classList.add('active');
    document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
    const content = document.getElementById('tab-' + tabId);
    if (content) content.classList.add('active');
  }
});

// ==================== 设置加载与保存 ====================
async function loadSettings() {
  try {
    const resp = await fetch(`${API}/ai/settings`);
    aiSettings = await resp.json();
    renderSettings();
  } catch (e) {
    showSettingsMsg('无法加载设置：' + e.message, 'error');
  }
}

function renderSettings() {
  if (!aiSettings) return;
  document.getElementById('set-baseUrl').value = aiSettings.baseUrl || '';
  document.getElementById('set-apiKey').value = aiSettings.apiKey || '';
  document.getElementById('set-temperature').value = aiSettings.temperature ?? 0.7;
  document.getElementById('set-maxTokens').value = aiSettings.maxTokens ?? 2048;

  const modelSelect = document.getElementById('set-model');
  if (aiSettings.model) {
    modelSelect.innerHTML = `<option value="${aiSettings.model}">${aiSettings.model}</option>`;
  }
}

async function saveSettings() {
  const updates = {
    baseUrl: document.getElementById('set-baseUrl').value.trim(),
    apiKey: document.getElementById('set-apiKey').value.trim(),
    model: document.getElementById('set-model').value,
    temperature: parseFloat(document.getElementById('set-temperature').value) || 0.7,
    maxTokens: parseInt(document.getElementById('set-maxTokens').value) || 2048,
  };

  try {
    const resp = await fetch(`${API}/ai/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    aiSettings = await resp.json();
    renderSettings();
    showSettingsMsg('✅ 设置已保存', 'success');
  } catch (e) {
    showSettingsMsg('❌ 保存失败：' + e.message, 'error');
  }
}

function showSettingsMsg(msg, type) {
  const el = document.getElementById('settings-msg');
  el.textContent = msg;
  el.className = 'settings-msg ' + type;
  setTimeout(() => { el.className = 'settings-msg'; }, 4000);
}

// ==================== 模型列表拉取 ====================
async function fetchModels() {
  const btn = document.getElementById('btn-fetch-models');
  const status = document.getElementById('models-status');
  btn.disabled = true;
  btn.textContent = '⏳ 拉取中...';
  status.textContent = '';

  const baseUrl = document.getElementById('set-baseUrl').value.trim();
  const apiKey = document.getElementById('set-apiKey').value.trim();

  try {
    const resp = await fetch(`${API}/ai/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey })
    });
    const data = await resp.json();

    if (data.models && data.models.length > 0) {
      const select = document.getElementById('set-model');
      select.innerHTML = data.models.map(m =>
        `<option value="${m.id}">${m.name || m.id}</option>`
      ).join('');
      status.textContent = `已获取 ${data.models.length} 个模型`;
    } else {
      status.textContent = '未获取到模型列表，请检查 API 地址和 Key';
    }
  } catch (e) {
    status.textContent = '拉取失败：' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 拉取模型';
  }
}

// ==================== 提示词列表（设置面板，只读） ====================
async function loadPrompts() {
  await loadPromptBar();
}

function renderSettingsPrompts() {
  const list = document.getElementById('prompts-list');
  if (!list) return;
  if (allPrompts.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#b2bec3">暂无提示词</div>';
    return;
  }

  list.innerHTML = allPrompts.map(p => `
    <div class="prompt-card">
      <div class="prompt-card-header">
        <span class="prompt-card-name">${escapeHtml(p.name)}</span>
        ${p.id === currentPromptId ? '<span class="badge-active">✓ 当前使用</span>' : ''}
      </div>
      <div class="prompt-card-preview" title="${escapeHtml(p.content || '')}">${escapeHtml((p.content || '').slice(0, 80))}${(p.content || '').length > 80 ? '...' : ''}</div>
    </div>
  `).join('');
}
