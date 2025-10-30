import os
import requests
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
from datetime import timedelta

# =========================================================
#  App Setup
# =========================================================
load_dotenv()

app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), "../templates"),
    static_folder=os.path.join(os.path.dirname(__file__), "../static")
)

app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
app.permanent_session_lifetime = timedelta(days=7)

# =========================================================
#  Gemini API Configuration
# =========================================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "models/gemini-2.5-flash"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# Track ongoing generations by client
generation_active = {}


# =========================================================
#  Helpers
# =========================================================
def ensure_session():
    """Ensure the user's session has a message list."""
    session.permanent = True
    if "messages" not in session:
        session["messages"] = []


# =========================================================
#  Routes
# =========================================================
@app.route("/")
def index():
    ensure_session()
    return render_template("index.html", messages=session.get("messages", []))


@app.route("/api/generate", methods=["POST"])
def api_generate():
    ensure_session()
    data = request.get_json(force=True) or {}

    prompt = (data.get("prompt") or "").strip()
    category = data.get("category", "story")
    style = data.get("style", "normal")
    language = data.get("language", "vi")
    client_id = request.remote_addr or "default"

    if not prompt:
        return jsonify({"ok": False, "error": "Empty prompt"}), 400

    # Mark generation active
    generation_active[client_id] = True

    # Language + style hints
    lang_prompts = {
        "vi": "Hãy trả lời bằng tiếng Việt.",
        "en": "Please respond in English.",
        "ja": "日本語で答えてください。"
    }

    style_prompts = {
        "normal": {"vi": "Viết theo phong cách bình thường.", "en": "Write in a normal style."},
        "funny": {"vi": "Hãy làm cho nội dung trở nên hài hước và vui nhộn.", "en": "Make it funny and playful."},
        "dark": {"vi": "Viết theo phong cách u tối, bí ẩn và có chiều sâu.", "en": "Write in a dark, mysterious style."},
        "poetic": {"vi": "Viết theo phong cách thơ ca, đầy cảm xúc và hình ảnh.", "en": "Write in a poetic, vivid style."},
        "epic": {"vi": "Viết theo phong cách sử thi, mạnh mẽ và hoành tráng.", "en": "Write in an epic, grand style."}
    }

    # Category-specific prompt
    if category == "story":
        base = f"Hãy viết một câu chuyện dựa trên ý tưởng: {prompt}." if language == "vi" else f"Write a story based on this idea: {prompt}."
    elif category == "music":
        base = f"Hãy sáng tác lời bài hát hoặc gợi ý nhạc dựa trên: {prompt}." if language == "vi" else f"Compose song lyrics or music ideas based on: {prompt}."
    else:
        base = prompt

    # Combine everything with a hard 500-word limit
    limit_text = "Giới hạn: tối đa 500 từ." if language == "vi" else "Limit: maximum 500 words."
    user_input = f"{lang_prompts.get(language, '')} {style_prompts.get(style, {}).get(language, '')} {base}\n\n{limit_text}"

    # Store user message
    messages = session.get("messages", [])
    messages.append({"role": "user", "text": prompt})
    session["messages"] = messages

    payload = {"contents": [{"parts": [{"text": user_input}]}]}
    headers = {"Content-Type": "application/json"}

    # =========================================================
    #  Call Gemini API
    # =========================================================
    try:
        if not generation_active.get(client_id):
            return jsonify({"ok": False, "error": "Generation cancelled."})

        res = requests.post(GEMINI_API_URL, json=payload, headers=headers, timeout=90)
        res.raise_for_status()
        data = res.json()

    except (requests.exceptions.Timeout, requests.exceptions.ReadTimeout):
        generation_active.pop(client_id, None)
        message = "🚦 The AI is currently experiencing heavy traffic. Please wait a moment and try again."
        return jsonify({"ok": True, "assistant": message})

    except requests.RequestException:
        generation_active.pop(client_id, None)
        message = "⚠️ The AI service is temporarily unavailable due to network issues. Please try again later."
        return jsonify({"ok": True, "assistant": message})

    except Exception:
        generation_active.pop(client_id, None)
        message = "⚠️ Unexpected server error occurred. Please try again shortly."
        return jsonify({"ok": True, "assistant": message})

    # =========================================================
    #  Extract Model Response
    # =========================================================
    assistant_text = ""
    try:
        if "candidates" in data and data["candidates"]:
            candidate = data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                assistant_text = candidate["content"]["parts"][0].get("text", "")
        if not assistant_text:
            assistant_text = "⚠️ No response received from the AI."
    except Exception:
        assistant_text = "⚠️ Error parsing AI response."

    # Enforce 500-word limit
    assistant_text = " ".join(assistant_text.split()[:500])

    # Save assistant message
    messages.append({"role": "assistant", "text": assistant_text})
    session["messages"] = messages

    # Mark generation complete
    generation_active.pop(client_id, None)

    return jsonify({"ok": True, "assistant": assistant_text})


@app.route("/api/stop", methods=["POST"])
def api_stop():
    """Stop generation manually."""
    client_id = request.remote_addr or "default"
    generation_active.pop(client_id, None)
    return jsonify({"ok": True, "stopped": True})


@app.route("/clear", methods=["POST"])
def clear():
    """Clear chat history for the current session."""
    session.pop("messages", None)
    return jsonify({"ok": True})


# =========================================================
#  Main
# =========================================================
if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print("⚠️  GEMINI_API_KEY not set in .env!")
    app.run(debug=True)
