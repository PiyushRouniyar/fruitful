import os
import base64
import json
import re
import logging
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
from requests_oauthlib import OAuth1

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

# FatSecret Credentials (OAuth 1.0)
FATSECRET_KEY = os.environ.get("FATSECRET_KEY")
FATSECRET_SECRET = os.environ.get("FATSECRET_SECRET")

def parse_nutrition_string(description):
    """
    Parses string like: "Per 100g - Calories: 200kcal | Fat: 10g | Carbs: 20g | Protein: 5g"
    """
    try:
        calories = 0
        protein = 0
        carbs = 0
        fat = 0
        
        cal_match = re.search(r'Calories:\s*([\d.]+)', description, re.IGNORECASE)
        if cal_match: calories = int(float(cal_match.group(1)))
        
        pro_match = re.search(r'Protein:\s*([\d.]+)g?', description, re.IGNORECASE)
        if pro_match: protein = int(float(pro_match.group(1)))
        
        carb_match = re.search(r'Carbs:\s*([\d.]+)g?', description, re.IGNORECASE)
        if carb_match: carbs = int(float(carb_match.group(1)))
        
        fat_match = re.search(r'Fat:\s*([\d.]+)g?', description, re.IGNORECASE)
        if fat_match: fat = int(float(fat_match.group(1)))
        
        return calories, protein, carbs, fat
    except Exception as e:
        logger.error(f"Error parsing nutrition string: {e}")
        return 0, 0, 0, 0

def get_fatsecret_nutrition(food_name):
    fatsecret_key = os.environ.get("FATSECRET_KEY", FATSECRET_KEY)
    fatsecret_secret = os.environ.get("FATSECRET_SECRET", FATSECRET_SECRET)
    
    if not fatsecret_key or not fatsecret_secret:
        logger.error("Missing FatSecret credentials")
        return None
    
    url = "https://platform.fatsecret.com/rest/server.api"
    auth = OAuth1(fatsecret_key, fatsecret_secret, signature_type='auth_header')
    
    params = {
        "method": "foods.search",
        "search_expression": food_name,
        "format": "json",
        "max_results": 1
    }
    
    try:
        response = requests.post(url, auth=auth, data=params, timeout=10)
        if response.status_code != 200:
            logger.error(f"FatSecret API HTTP error: {response.status_code} {response.text}")
            return None
            
        data = response.json()
        foods = data.get("foods", {}).get("food")
        
        if not foods:
            logger.info(f"No food found on FatSecret for query: {food_name}")
            return None
            
        food = foods[0] if isinstance(foods, list) else foods
        description = food.get("food_description", "")
        
        cals, pro, carb, fat = parse_nutrition_string(description)
        
        return {
            "name": food.get("food_name"),
            "calories": cals,
            "protein": pro,
            "carbs": carb,
            "fat": fat,
            "health": "Good",
            "tip": "Data from FatSecret"
        }
    except Exception as e:
        logger.error(f"FatSecret Exception: {e}")
        return None

def get_food_name_from_gemini(image_data):
    gemini_key = os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)
    if not gemini_key:
        logger.error("GEMINI_API_KEY is not configured")
        return None

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
        prompt = "Identify the food item in this image. Return ONLY the food name. No explanation."
        
        model_names = [
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash',
            'gemini-2.0-flash-exp',
            'gemini-1.5-pro-latest',
            'gemini-1.5-pro',
            'gemini-pro-vision'
        ]
        for model_name in model_names:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content([prompt, {"mime_type": mime_type, "data": image_bytes}])
                if response and response.text:
                    logger.info(f"Gemini success using model {model_name}: {response.text.strip()}")
                    return response.text.strip()
            except Exception as model_err:
                logger.warning(f"Gemini model {model_name} failed: {model_err}")
                continue

        return None
    except Exception as e:
        logger.error(f"Gemini Exception: {e}")
        return None

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "Fruitful Backend",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "fatsecret_configured": bool(os.environ.get("FATSECRET_KEY") and os.environ.get("FATSECRET_SECRET"))
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

        gemini_key = os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)
        if not gemini_key:
            logger.error("GEMINI_API_KEY is not configured on server")
            return jsonify({"error": "MISSING_API_KEY", "details": "GEMINI_API_KEY environment variable is not configured on Vercel"}), 200
        
        food_name = get_food_name_from_gemini(data['image'])
        
        if not food_name:
            return jsonify({"error": "AI_FAILED"}), 200

        fatsecret_key = os.environ.get("FATSECRET_KEY", FATSECRET_KEY)
        fatsecret_secret = os.environ.get("FATSECRET_SECRET", FATSECRET_SECRET)
        if not fatsecret_key or not fatsecret_secret:
            logger.error("FATSECRET keys are not configured on server")
            return jsonify({"error": "MISSING_API_KEY", "details": "FATSECRET credentials environment variables are not configured on Vercel"}), 200
        
        nutrition = get_fatsecret_nutrition(food_name)
        
        if not nutrition:
            return jsonify({"error": "NUTRITION_FAILED"}), 200
            
        return jsonify(nutrition), 200
    except Exception as e:
        logger.error(f"Route /analyze error: {e}")
        return jsonify({"error": "NUTRITION_FAILED"}), 200

@app.route('/analyze-text', methods=['POST'])
def analyze_text():
    try:
        data = request.get_json(silent=True)
        if not data or 'name' not in data or not data['name']:
            return jsonify({"error": "No food name provided"}), 400

        fatsecret_key = os.environ.get("FATSECRET_KEY", FATSECRET_KEY)
        fatsecret_secret = os.environ.get("FATSECRET_SECRET", FATSECRET_SECRET)
        if not fatsecret_key or not fatsecret_secret:
            logger.error("FATSECRET keys are not configured on server")
            return jsonify({"error": "MISSING_API_KEY", "details": "FATSECRET credentials environment variables are not configured on Vercel"}), 200
        
        nutrition = get_fatsecret_nutrition(data['name'])
        if not nutrition:
            return jsonify({"error": "NUTRITION_FAILED"}), 200
            
        return jsonify(nutrition), 200
    except Exception as e:
        logger.error(f"Route /analyze-text error: {e}")
        return jsonify({"error": "NUTRITION_FAILED"}), 200

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

