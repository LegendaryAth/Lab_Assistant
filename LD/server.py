import os
import base64
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise EnvironmentError("Please set GEMINI_API_KEY in your .env file.")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 15 * 1024 * 1024

PROMPT = (
    "Identify the laboratory equipment in this image and provide a short description "
    "of what it is used for. Format the output as:\n"
    "Name: <name>\nDescription: <description>"
)

# --- Page-Serving Routes ---

@app.route("/")
def index():
    """Serves the main index.html page."""
    return render_template("index.html")

@app.route("/about")
def about():
    """Serves the about.html page."""
    return render_template("about.html")

# --- API Route ---

@app.route("/api/identify", methods=["POST"])
def identify_api():
    """Accepts multipart/form-data with one or more files using field name 'images'."""
    if 'images' not in request.files:
        return jsonify({"error": "No images provided. Use field name 'images'."}), 400

    files = request.files.getlist('images')
    results = []

    for idx, f in enumerate(files):
        filename = secure_filename(f.filename or f"image_{idx}.jpg")
        if not filename:
            results.append({"index": idx, "filename": None, "error": "Empty filename."})
            continue

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        mime = "image/jpeg"
        if ext in ("png",): mime = "image/png"
        if ext in ("webp",): mime = "image/webp"

        try:
            image_bytes = f.read()
            if not image_bytes:
                results.append({"index": idx, "filename": filename, "error": "Empty file."})
                continue

            out = identify_lab_equipment_from_bytes(image_bytes, mime)
            out.update({"index": idx, "filename": filename})
            results.append(out)
        except Exception as e:
            results.append({"index": idx, "filename": filename, "error": str(e)})

    return jsonify({"results": results})


def identify_lab_equipment_from_bytes(image_bytes, mime_type="image/jpeg"):
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": mime_type, "data": image_base64}}]}]}

    r = requests.post(
        f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
        headers=headers,
        json=payload,
        timeout=60
    )
    if r.status_code != 200:
        return {"error": f"{r.status_code}: {r.text}"}

    result = r.json()
    try:
        text_output = result["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        return {"error": "Unexpected response format from model.", "raw": result}

    name, description = "", ""
    for line in text_output.splitlines():
        if line.lower().startswith("name:"): name = line.split(":", 1)[1].strip()
        elif line.lower().startswith("description:"): description = line.split(":", 1)[1].strip()
    
    return {"name": name or "Unknown", "description": description or text_output.strip()}


# This block is for local development and is ignored by Gunicorn on Render
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)