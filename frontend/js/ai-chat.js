/* AI 分析助手 — 完整版 */

// ==================== 基础状态 ====================
let aiMode = 'query';
let aiSettings = null;
let allPrompts = [];
let editingPromptId = null;

// ==================== 模式切换 ====================
function setMode(mode) {
  aiMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
  if (btn) btn.classList.add('active');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn[data-mode]');
  if (btn) setMode(btn.dataset.mode);
});

// ==================== 发送消息 ====================
async function sendMessage() {
  const input = document.getElementById('ai-input');
  const message = input.value.trim();
  if (!message) return;

  const chatDiv = document.getElementById('ai-chat');

  // 用户消息
  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = message;
  chatDiv.appendChild(userMsg);
  input.value = '';
  chatDiv.scrollTop = chatDiv.scrollHeight;

  // AI 回复
  const url = aiMode === 'report' ? `${API}/ai/report` : `${API}/ai/chat`;
  const body = aiMode === 'report' ? {} : { message, mode: aiMode };

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

// ==================== API Key 显示切换 ====================
function toggleApiKeyVisibility() {
  const input = document.getElementById('set-apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

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

// ==================== 提示词管理 ====================
async function loadPrompts() {
  try {
    const resp = await fetch(`${API}/ai/prompts`);
    const data = await resp.json();
    allPrompts = data.prompts || [];
    renderPrompts();
  } catch (e) {
    console.error('加载提示词失败:', e);
  }
}

function renderPrompts() {
  const list = document.getElementById('prompts-list');
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
        <button class="btn-sm-primary" onclick="editPrompt('${p.id}')">✏️ 编辑</button>
        ${!p.isPreset ? `<button class="btn-sm-danger" onclick="deletePrompt('${p.id}')">🗑 删除</button>` : ''}
        ${p.isPreset ? `<button class="btn-sm-reset" onclick="resetPrompt('${p.id}')">↩ 恢复默认</button>` : ''}
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
      // 更新已有提示词
      await fetch(`${API}/ai/prompts/${editingPromptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    } else {
      // 新增自定义提示词
      await fetch(`${API}/ai/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, content })
      });
    }
    cancelEditPrompt();
    await loadPrompts();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function resetPrompt(id) {
  if (!confirm('确定恢复该提示词为默认内容？')) return;
  try {
    await fetch(`${API}/ai/prompts/${id}/reset`, { method: 'POST' });
    await loadPrompts();
  } catch (e) {
    alert('恢复失败: ' + e.message);
  }
}

async function deletePrompt(id) {
  if (!confirm('确定删除该自定义提示词？')) return;
  try {
    await fetch(`${API}/ai/prompts/${id}`, { method: 'DELETE' });
    await loadPrompts();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}
