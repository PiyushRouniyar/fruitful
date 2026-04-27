import os
import base64
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini API
# Make sure to set your GEMINI_API_KEY in .env or environment variables
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

def get_gemini_response(image_data):
    prompt = """
    Analyze this food image and provide nutritional information.
    Return ONLY a JSON object with the following structure:
    {
        "name": "Food Name",
        "calories": 250,
        "protein": 10,
        "carbs": 30,
        "fat": 8,
        "health": "Excellent/Good/Fair/Poor",
        "tip": "A short healthy tip about this meal."
    }
    Be accurate but concise. Do not include any other text or formatting.
    -Foods are mostly nepali,indian and other international food and fruits
    """
    
    # Extract base64 content if it has the prefix
    if "," in image_data:
        image_data = image_data.split(",")[1]
    
    image_parts = [
        {
            "mime_type": "image/jpeg",
            "data": image_data
        }
    ]

    # 🥇 FIRST TRY: 3.1 Flash Lite (your current model)
    try:
        print("Trying 3.1 Flash Lite...")
        model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
        response = model.generate_content([prompt, image_parts[0]])

        text = response.text.strip()

        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()

        return json.loads(text)

    except Exception as e:
        print("3.1 failed:", e)

    # 🥈 FALLBACK: 2.5 Flash (only if first fails)
    try:
        print("Trying 2.5 Flash fallback...")
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content([prompt, image_parts[0]])

        text = response.text.strip()

        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()

        return json.loads(text)

    except Exception as e:
        print("2.5 also failed:", e)

    # 🧯 FINAL SAFE RESPONSE (unchanged style)
    return {
        "name": "Unknown Food",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "health": "Unknown",
        "tip": "Could not analyze this image. Please try again."
    }
from flask import send_from_directory

@app.route("/")
def home():
    return send_from_directory("static", "index.html")
    
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    if not data or 'image' not in data:
        return jsonify({"error": "No image data provided"}), 400
    
    analysis = get_gemini_response(data['image'])
    return jsonify(analysis)

if __name__ == '__main__':
    app.run()
