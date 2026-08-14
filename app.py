import os
import base64
import json
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload size
CORS(app)

# Configure Gemini API safely
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY environment variable is missing.")

def analyze_food_with_gemini(image_data):
    gemini_key = os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)
    if not gemini_key:
        logger.error("GEMINI_API_KEY is not configured")
        return None, "MISSING_API_KEY"

    try:
        genai.configure(api_key=gemini_key)
        mime_type = "image/jpeg"
        if "," in image_data:
            header, image_data = image_data.split(",", 1)
            if "image/png" in header:
                mime_type = "image/png"
            elif "image/webp" in header:
                mime_type = "image/webp"
            elif "image/gif" in header:
                mime_type = "image/gif"
        
        image_bytes = base64.b64decode(image_data)
        prompt = (
            "Analyze the food item in this image and estimate its nutritional values.\n"
            "Return ONLY a valid JSON object without markdown formatting or code blocks with the following keys:\n"
            '{"name": "Food Name", "calories": 250, "protein": 15, "carbs": 30, "fat": 8, "health": "Good", "tip": "Brief tip"}\n'
            "Ensure calories, protein, carbs, and fat are integers."
        )
        
        model = genai.GenerativeModel('gemini-3.1-flash-lite')
        response = model.generate_content([prompt, {"mime_type": mime_type, "data": image_bytes}])
        
        if response and response.text:
            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()
            
            data = json.loads(raw_text)
            return {
                "name": str(data.get("name", "Scanned Food")),
                "calories": int(data.get("calories", 0)),
                "protein": int(data.get("protein", 0)),
                "carbs": int(data.get("carbs", 0)),
                "fat": int(data.get("fat", 0)),
                "health": str(data.get("health", "Good")),
                "tip": str(data.get("tip", "Nutritional estimate powered by Gemini AI"))
            }, None
        return None, "AI_FAILED"
    except Exception as e:
        logger.error(f"Gemini Exception: {e}")
        return None, "AI_FAILED"

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "Fruitful Backend",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "model": "gemini-3.1-flash-lite"
    }), 200

@app.route('/<path:path>')
def serve_static(path):
    static_file_path = os.path.join('static', path)
    if os.path.exists(static_file_path) and os.path.isfile(static_file_path):
        return send_from_directory('static', path)
    return send_from_directory('static', 'index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.get_json(silent=True)
        if not data or 'image' not in data or not data['image']:
            return jsonify({"error": "No image data provided"}), 400

        result, err_code = analyze_food_with_gemini(data['image'])
        if err_code:
            return jsonify({"error": err_code}), 200
            
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Route /analyze error: {e}")
        return jsonify({"error": "AI_FAILED"}), 200

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(413)
def request_entity_too_large(e):
    return jsonify({"error": "Payload size exceeds 16MB limit"}), 413

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")

