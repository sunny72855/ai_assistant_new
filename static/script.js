// =========================================================
//  DPKS AI — Smart Prompt System (v2.6)
//  Markdown rendering + safe AI responses + live stop
// =========================================================

console.log("✅ DPKS AI frontend loaded");

// -------------------- DOM References --------------------
const chatEl = document.querySelector("#chat");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const promptInput = document.getElementById("prompt");
const clearBtn = document.getElementById("clearBtn");
const themeToggleBtn = document.getElementById("themeToggle");
const categorySelect = document.getElementById("category");
const styleSelect = document.getElementById("style");
const languageSelect = document.getElementById("language");
const homeSection = document.getElementById("home");
const chatSection = document.getElementById("chat-screen");
const startChatBtn = document.getElementById("startChatBtn");
const homeBtn = document.getElementById("homeBtn");
const promptForm = document.getElementById("promptForm");
const patchBtn = document.getElementById("patchBtn");
const patchModal = document.getElementById("patchModal");
const closePatch = document.getElementById("closePatch");
const defaultPromptsEl = document.getElementById("defaultPrompts");

// -------------------- Global State --------------------
let isGenerating = false;
let typingTimeout;

// -------------------- Helpers --------------------
function scrollToBottom(smooth = true) {
  document.getElementById("bottom-anchor")?.scrollIntoView({
    behavior: smooth ? "smooth" : "instant",
    block: "end",
  });
}

// -------------------- Markdown Rendering --------------------
function renderMarkdown(text) {
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    text = text.replace(/\*\*\*/g, "**"); // normalize triple asterisks
    return DOMPurify.sanitize(marked.parse(text || ""));
  }
  return text;
}

// -------------------- Append Chat Bubble --------------------
function appendBubble(role, text = "", isTyping = false) {
  const bubble = document.createElement("div");
  bubble.classList.add("bubble", role);

  if (isTyping) {
    bubble.classList.add("typing");
    bubble.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
  } else {
    bubble.innerHTML = role === "assistant" ? renderMarkdown(text) : text || "";
  }

  chatEl.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

// -------------------- Clear Chat --------------------
function clearChat() {
  chatEl.innerHTML = "";
  fetch("/clear", { method: "POST" }).catch(() => {});
  appendBubble("assistant", "🧹 Chat cleared!");
}

// -------------------- Stop Generation --------------------
async function stopGeneration() {
  if (!isGenerating) return;
  isGenerating = false;

  stopBtn.disabled = true;
  sendBtn.disabled = false;
  promptInput.disabled = false;

  clearTimeout(typingTimeout);
  document.querySelector(".bubble.assistant.typing")?.remove();
  appendBubble("assistant", "⏹ Generation stopped.");

  try {
    await fetch("/api/stop", { method: "POST" });
  } catch {}
}

// -------------------- Typing Effect --------------------
function typeText(text) {
  const bubble = appendBubble("assistant", "", true);
  let index = 0;
  const speed = 15;
  isGenerating = true;
  stopBtn.disabled = false; // Keep stop active while typing

  function type() {
    if (index < text.length && isGenerating) {
      bubble.innerHTML = renderMarkdown(text.slice(0, index + 1));
      index++;
      chatEl.scrollTop = chatEl.scrollHeight;
      typingTimeout = setTimeout(type, speed);
    } else if (isGenerating) {
      // Completed typing naturally
      bubble.classList.remove("typing");
      bubble.innerHTML = renderMarkdown(text);
      isGenerating = false;
      stopBtn.disabled = true;
      sendBtn.disabled = false;
      promptInput.disabled = false;
    }
  }
  type();
}

// -------------------- Generate AI Message --------------------
async function generateMessage() {
  const prompt = promptInput.value.trim();
  if (!prompt || isGenerating) return;

  sendBtn.disabled = true;
  stopBtn.disabled = false; // Stop button active immediately
  promptInput.disabled = true;
  isGenerating = true;

  appendBubble("user", prompt);
  promptInput.value = "";

  const typingBubble = appendBubble("assistant", "", true);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        category: categorySelect.value,
        style: styleSelect.value,
        language: languageSelect.value,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    typingBubble.remove();

    if (!isGenerating) return; // stopped before API returned

    if (data.ok && data.assistant) {
      typeText(data.assistant);
    } else if (data.assistant) {
      appendBubble("assistant", data.assistant);
      isGenerating = false;
      stopBtn.disabled = true;
      sendBtn.disabled = false;
      promptInput.disabled = false;
    } else {
      appendBubble("assistant", "⚠️ There was an issue generating a response.");
      isGenerating = false;
      stopBtn.disabled = true;
      sendBtn.disabled = false;
      promptInput.disabled = false;
    }
  } catch (err) {
    typingBubble.remove();
    appendBubble("assistant", "🚧 The AI servers are busy. Please try again soon!");
    isGenerating = false;
    stopBtn.disabled = true;
    sendBtn.disabled = false;
    promptInput.disabled = false;
  }
}

// -------------------- Dark Mode --------------------
function applyDarkMode(enabled) {
  document.body.classList.toggle("dark", !!enabled);
  localStorage.setItem("theme", enabled ? "dark" : "light");
}
function initDarkMode() {
  const stored = localStorage.getItem("theme");
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyDarkMode(stored ? stored === "dark" : prefersDark);
}

// -------------------- Patch Notes --------------------
if (patchBtn && patchModal && closePatch) {
  patchBtn.addEventListener("click", () => patchModal.classList.remove("hidden"));
  closePatch.addEventListener("click", () => patchModal.classList.add("hidden"));
  patchModal.addEventListener("click", (e) => {
    if (e.target === patchModal) patchModal.classList.add("hidden");
  });
}

// -------------------- Navigation --------------------
function showChatScreen() {
  homeSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  scrollToBottom();
}
function showHomeScreen() {
  chatSection.classList.add("hidden");
  homeSection.classList.remove("hidden");
}

// -------------------- Smart Prompts --------------------
const allPrompts = [
  { text: "Viết một câu chuyện kỳ ảo về một con rồng cô đơn.", category: "story", style: "epic", language: "vi" },
  { text: "Compose a love song inspired by the rain.", category: "music", style: "poetic", language: "en" },
  { text: "Hãy viết một bài thơ về thành phố về đêm.", category: "story", style: "poetic", language: "vi" },
  { text: "Write a short horror story set in Tokyo.", category: "story", style: "dark", language: "en" },
  { text: "Tạo ra một giai điệu vui nhộn về một chú mèo biết nói.", category: "music", style: "funny", language: "vi" },
  { text: "Describe a future where dreams can be recorded.", category: "story", style: "normal", language: "en" },
  { text: "Viết một câu chuyện tình yêu vượt qua thời gian.", category: "story", style: "epic", language: "vi" },
  { text: "Create lyrics for a song about the ocean's memory.", category: "music", style: "poetic", language: "en" },
  { text: "Hãy tưởng tượng một thế giới nơi con người không cần ngủ.", category: "story", style: "normal", language: "vi" },
  { text: "Write a poem about the sound of silence.", category: "story", style: "poetic", language: "en" },
  { text: "Hãy viết truyện ngắn về một bức tranh biết nói.", category: "story", style: "funny", language: "vi" },
  { text: "Compose a sad ballad about a forgotten robot.", category: "music", style: "dark", language: "en" },
];

function loadRandomPrompts() {
  const shuffled = allPrompts.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 3);
  defaultPromptsEl.innerHTML = "";
  selected.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prompt-btn";
    btn.textContent = p.text;
    btn.addEventListener("click", () => {
      promptInput.value = p.text;
      categorySelect.value = p.category;
      styleSelect.value = p.style;
      languageSelect.value = p.language;
      promptInput.focus();
    });
    defaultPromptsEl.appendChild(btn);
  });
}

// -------------------- Event Wiring --------------------
promptForm.addEventListener("submit", (e) => {
  e.preventDefault();
  generateMessage();
});
sendBtn.addEventListener("click", generateMessage);
stopBtn.addEventListener("click", stopGeneration);
clearBtn.addEventListener("click", clearChat);
themeToggleBtn.addEventListener("click", () =>
  applyDarkMode(!document.body.classList.contains("dark"))
);
startChatBtn.addEventListener("click", showChatScreen);
homeBtn.addEventListener("click", showHomeScreen);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
    e.preventDefault();
    generateMessage();
  }
});

// -------------------- Init --------------------
initDarkMode();
loadRandomPrompts();

// -------------------- Render existing AI messages --------------------
document.querySelectorAll(".bubble.assistant[data-text]").forEach((el) => {
  const text = el.getAttribute("data-text") || "";
  el.innerHTML = renderMarkdown(text);
});

scrollToBottom();
console.log("🚀 Smart Prompts ready!");