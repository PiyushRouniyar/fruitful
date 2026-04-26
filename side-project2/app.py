import os
import json
import base64
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY not found in environment variables.")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# Prompt for Food Analysis
PROMPT = """
Analyze this food image and return a JSON object with:
{
  "name": "Food Name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "health": "Excellent|Good|Fair|Poor",
  "tip": "Short healthy tip"
}
Only return the JSON.
"""

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({"error": "No image data provided"}), 400

        image_data = data['image']
        if "," in image_data:
            image_data = image_data.split(",")[1]

        image_parts = [{"mime_type": "image/jpeg", "data": image_data}]
        
        response = model.generate_content([PROMPT, image_parts[0]])
        text = response.text.strip()
        
        # Clean markdown if present
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        return json.loads(text)
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({
            "name": "Unknown Food",
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "health": "Unknown",
            "tip": "Could not analyze image. Please try again."
        })

if __name__ == '__main__':
    # For local development
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
