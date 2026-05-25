let aiMode = 'query';

function setMode(mode) {
  aiMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.mode-btn[onclick="setMode('${mode}')"]`).classList.add('active');
}

async function sendMessage() {
  const input = document.getElementById('ai-input');
  const message = input.value.trim();
  if (!message) return;

  const chatDiv = document.getElementById('ai-chat');
  chatDiv.innerHTML += `<div class="msg user">${message}</div>`;
  input.value = '';

  const url = aiMode === 'report' ? `${API}/ai/report` : `${API}/ai/chat`;
  const body = aiMode === 'report' ? {} : { message, mode: aiMode };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  const reply = data.reply || data.report || '(无回复)';
  chatDiv.innerHTML += `<div class="msg ai">${reply.replace(/\n/g, '<br>')}</div>`;
  chatDiv.scrollTop = chatDiv.scrollHeight;
}
