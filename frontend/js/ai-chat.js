/* AI 分析助手 — 完整版 */

// ==================== 基础状态 ====================
let currentPromptId = 'query';
let allPrompts = [];
let editingPromptId = null;
let aiSettings = null;
let streamingEnabled = localStorage.getItem('ai-stream-enabled') !== 'false'; // 默认开启

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

  const activeId = currentPromptId || (allPrompts.length > 0 ? allPrompts[0].id : 'query');
  // Ensure selected prompt still exists
  if (!allPrompts.find(p => p.id === activeId) && allPrompts.length > 0) {
    currentPromptId = allPrompts[0].id;
  }

  bar.innerHTML = allPrompts.map(p => `
    <div class="prompt-chip ${p.id === currentPromptId ? 'active' : ''}"
         data-id="${p.id}" onclick="selectPrompt('${p.id}')" title="${escapeHtml(p.description || '')}">
      <span class="chip-name">${escapeHtml(p.name)}</span>
      <span class="chip-edit" onclick="event.stopPropagation();openPromptEditor('${p.id}')">✎</span>
    </div>
  `).join('') + `<button class="chip-add" onclick="openPromptEditor()" title="新建提示词">+</button>`;

  // Also update settings prompt list if open
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

// ==================== 内联提示词编辑 ====================
function openPromptEditor(id) {
  editingPromptId = id || null;
  const overlay = document.getElementById('prompt-editor-overlay');
  if (!overlay) return;

  document.getElementById('popup-title').textContent = id ? '编辑提示词' : '新建提示词';

  // Delete button: visible when editing existing prompt
  document.getElementById('btn-popup-delete').style.display = id ? '' : 'none';

  if (id) {
    const p = allPrompts.find(p => p.id === id);
    document.getElementById('popup-name').value = p?.name || '';
    document.getElementById('popup-desc').value = p?.description || '';
    document.getElementById('popup-content').value = p?.content || '';
  } else {
    document.getElementById('popup-name').value = '';
    document.getElementById('popup-desc').value = '';
    document.getElementById('popup-content').value = '';
  }

  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('popup-name').focus(), 150);
}

function closePromptEditor() {
  editingPromptId = null;
  const overlay = document.getElementById('prompt-editor-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function savePromptFromPopup() {
  const name = document.getElementById('popup-name').value.trim();
  const description = document.getElementById('popup-desc').value.trim();
  const content = document.getElementById('popup-content').value.trim();

  if (!name) { alert('请输入提示词名称'); return; }
  if (!content) { alert('请输入提示词内容'); return; }

  try {
    if (editingPromptId) {
      await fetch(`${API}/ai/prompts/${editingPromptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, name, description })
      });
    } else {
      const resp = await fetch(`${API}/ai/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, content })
      });
      const data = await resp.json();
      if (data.prompt) {
        currentPromptId = data.prompt.id; // Auto-select newly created
      }
    }
    closePromptEditor();
    await loadPromptBar();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function deletePromptFromPopup() {
  if (!editingPromptId) return;
  if (!confirm('确定删除该提示词？')) return;
  try {
    await fetch(`${API}/ai/prompts/${editingPromptId}`, { method: 'DELETE' });
    closePromptEditor();
    await loadPromptBar();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
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

  // 流式输出
  if (streamingEnabled) {
    return sendMessageStream(message);
  }

  // 非流式 fallback
  const chatDiv = document.getElementById('ai-chat');

  // 用户消息
  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = message;
  chatDiv.appendChild(userMsg);
  input.value = '';
  chatDiv.scrollTop = chatDiv.scrollHeight;

  // AI 回复
  const url = `${API}/ai/chat`;
  const body = { message, mode: currentPromptId };

  try {
    const resp = await fetch(url, {
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

  // 用户消息
  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = message;
  chatDiv.appendChild(userMsg);
  input.value = '';

  // 构建 AI 消息容器
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

  // 内容区
  const msgContent = document.createElement('div');
  msgContent.className = 'msg-content';
  aiMsg.appendChild(msgContent);

  // 光标
  const cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  cursor.innerHTML = '▌';
  cursor.style.display = 'none';
  aiMsg.appendChild(cursor);

  chatDiv.appendChild(aiMsg);

  // 滚动到最新的AI消息
  const scrollToChat = () => {
    chatDiv.scrollTop = chatDiv.scrollHeight;
  };
  scrollToChat();

  try {
    const resp = await fetch(`${API}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode: currentPromptId }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

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
              // 显示思考面板
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
              // 显示内容
              if (!hasContent) {
                // 首次出现内容时，自动折叠思考面板
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

    // 流结束，隐藏光标
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
  cancelEditPrompt();
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
  document.getElementById('set-provider').value = aiSettings.provider || 'openai';
  document.getElementById('set-baseUrl').value = aiSettings.baseUrl || '';
  document.getElementById('set-apiKey').value = aiSettings.apiKey || '';
  document.getElementById('set-temperature').value = aiSettings.temperature ?? 0.7;
  document.getElementById('set-maxTokens').value = aiSettings.maxTokens ?? 2048;

  // 模型下拉
  const modelSelect = document.getElementById('set-model');
  if (aiSettings.model) {
    modelSelect.innerHTML = `<option value="${aiSettings.model}">${aiSettings.model}</option>`;
  }
}

async function saveSettings() {
  const updates = {
    provider: document.getElementById('set-provider').value,
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

  const provider = document.getElementById('set-provider').value;
  const baseUrl = document.getElementById('set-baseUrl').value.trim();
  const apiKey = document.getElementById('set-apiKey').value.trim();

  try {
    const resp = await fetch(`${API}/ai/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, baseUrl, apiKey })
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

// ==================== 提示词管理（设置面板） ====================
async function loadPrompts() {
  await loadPromptBar(); // 同步刷新标签栏和设置面板列表
}

function renderSettingsPrompts() {
  const list = document.getElementById('prompts-list');
  if (!list) return;
  if (allPrompts.length === 0) {
    list.innerHTML = '<div class="prompts-info" style="padding:20px;text-align:center">暂无提示词模板</div>';
    return;
  }

  list.innerHTML = allPrompts.map(p => `
    <div class="prompt-card">
      <div class="prompt-card-header">
        <span class="prompt-card-name">${escapeHtml(p.name)}</span>
        <span class="prompt-card-badge ${p.isPreset ? 'badge-preset' : 'badge-custom'}">${p.isPreset ? '预设' : '自定义'}</span>
      </div>
      <div class="prompt-card-desc">${escapeHtml(p.description || '')}</div>
      <div class="prompt-card-preview" title="${escapeHtml(p.content)}">${escapeHtml(p.content?.slice(0, 80) || '')}${(p.content?.length || 0) > 80 ? '...' : ''}</div>
      <div class="prompt-card-actions">
        ${p.id === currentPromptId ? '<span class="badge-active">✓ 当前使用</span>' : ''}
        <button class="btn-sm-primary" onclick="editPrompt('${p.id}')">✏️ 编辑</button>
        <button class="btn-sm-danger" onclick="deletePrompt('${p.id}')">🗑 删除</button>
      </div>
    </div>
  `).join('');
}

function editPrompt(id) {
  const prompt = allPrompts.find(p => p.id === id);
  if (!prompt) return;

  editingPromptId = id;
  document.getElementById('prompt-editor').style.display = 'block';
  document.getElementById('prompt-editor-title').textContent = '编辑提示词';
  document.getElementById('prompt-name').value = prompt.name;
  document.getElementById('prompt-desc').value = prompt.description || '';
  document.getElementById('prompt-content').value = prompt.content || '';

  // Scroll to editor
  document.getElementById('prompt-editor').scrollIntoView({ behavior: 'smooth' });
}

function showAddPrompt() {
  editingPromptId = null;
  document.getElementById('prompt-editor').style.display = 'block';
  document.getElementById('prompt-editor-title').textContent = '新增提示词';
  document.getElementById('prompt-name').value = '';
  document.getElementById('prompt-desc').value = '';
  document.getElementById('prompt-content').value = '';
}

function cancelEditPrompt() {
  editingPromptId = null;
  document.getElementById('prompt-editor').style.display = 'none';
  document.getElementById('prompt-name').value = '';
  document.getElementById('prompt-desc').value = '';
  document.getElementById('prompt-content').value = '';
}

async function savePrompt() {
  const name = document.getElementById('prompt-name').value.trim();
  const description = document.getElementById('prompt-desc').value.trim();
  const content = document.getElementById('prompt-content').value.trim();

  if (!name) { alert('请输入提示词名称'); return; }
  if (!content) { alert('请输入提示词内容'); return; }

  try {
    if (editingPromptId) {
      await fetch(`${API}/ai/prompts/${editingPromptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, name, description })
      });
    } else {
      await fetch(`${API}/ai/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, content })
      });
    }
    cancelEditPrompt();
    await loadPromptBar();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function resetPrompt(id) {
  if (!confirm('确定恢复该提示词为默认内容？')) return;
  try {
    await fetch(`${API}/ai/prompts/${id}/reset`, { method: 'POST' });
    await loadPromptBar();
  } catch (e) {
    alert('恢复失败: ' + e.message);
  }
}

async function deletePrompt(id) {
  if (!confirm('确定删除该自定义提示词？')) return;
  try {
    await fetch(`${API}/ai/prompts/${id}`, { method: 'DELETE' });
    await loadPromptBar();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}
