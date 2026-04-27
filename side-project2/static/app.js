/**
 * Fruitful - AI Food Scanner & Nutrition Tracker
 * Firebase Integrated Version (Modular SDK)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCSWPh8t9CFg2WPnDZxXxVzekTS1EaLULE",
    authDomain: "fruitful-fe90a.firebaseapp.com",
    projectId: "fruitful-fe90a",
    storageBucket: "fruitful-fe90a.firebasestorage.app",
    messagingSenderId: "720221158217",
    appId: "1:720221158217:web:bad3bc26fa98300bc1b898"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const BACKEND_URL = '/analyze';

// Global State
let state = {
    uid: null,
    user: { name: "" },
    goals: {
        mode: 'maintain',
        calories: 2000,
        protein: 100,
        carbs: 200,
        fat: 70
    },
    currentDayData: { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] },
    weight: {},
    lang: 'EN',
    selectedDate: getFormattedDate(new Date())
};

let weeklyChart = null;

// Translations
const translations = {
    EN: {
        greeting: "Hello,",
        upload: "Upload",
        scan: "Scan Meal",
        daily_tracker: "Daily Tracker",
        protein: "Protein",
        carbs: "Carbs",
        fat: "Fat",
        set_goals: "Set Goals",
        history: "History",
        no_meals: "No meals tracked yet today.",
        weight_tracker: "Weight Tracker",
        analyzing: "Analyzing your meal...",
        add_to_log: "Add to Tracker",
        improve_meal: "Improve Meal",
        weekly_report: "Weekly Report",
        save: "Save",
        cancel: "Cancel",
        view_report: "View Weekly Report"
    },
    NP: {
        greeting: "नमस्ते,",
        upload: "अपलोड",
        scan: "खाना स्क्यान",
        daily_tracker: "दैनिक ट्र्याकर",
        protein: "प्रोटिन",
        carbs: "कार्ब्स",
        fat: "फ्याट",
        set_goals: "लक्ष्य निर्धारण",
        history: "इतिहास",
        no_meals: "आज कुनै खाना ट्र्याक गरिएको छैन।",
        weight_tracker: "तौल ट्र्याकर",
        analyzing: "तपाईंको खाना विश्लेषण गर्दै...",
        add_to_log: "ट्र्याकरमा थप्नुहोस्",
        improve_meal: "खाना सुधार्नुहोस्",
        weekly_report: "साप्ताहिक रिपोर्ट",
        save: "बचत गर्नुहोस्",
        cancel: "रद्द गर्नुहोस्",
        view_report: "साप्ताहिक रिपोर्ट हेर्नुहोस्"
    }
};

// DOM Elements
const video = document.getElementById('camera-preview');
const canvas = document.getElementById('capture-canvas');
const scanBtn = document.getElementById('scan-btn');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const resultModal = document.getElementById('result-modal');
const goalModal = document.getElementById('goal-modal');
const weeklyModal = document.getElementById('weekly-modal');
const nameModal = document.getElementById('name-modal');
const calendarWeek = document.getElementById('calendar-week');
const historyList = document.getElementById('history-list');

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.uid = user.uid;
            console.log("Authenticated as:", state.uid);
            await syncUserData();
            initCamera();
            initCalendar();
            updateUI();
            checkFirstVisit();
            setupEventListeners();
        } else {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Auth error:", error);
                alert("Failed to authenticate with Firebase.");
            }
        }
    });
}

async function syncUserData() {
    if (!state.uid) return;

    const userRef = doc(db, 'users', state.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
        const data = userDoc.data();
        state.user.name = data.name || "";
        state.goals = data.goals || state.goals;
    } else {
        await setDoc(userRef, {
            createdAt: serverTimestamp(),
            goals: state.goals,
            name: ""
        });
    }

    await fetchHistoryForDate(state.selectedDate);
}

async function fetchHistoryForDate(dateStr) {
    const historyRef = doc(db, 'users', state.uid, 'history', dateStr);
    const historyDoc = await getDoc(historyRef);
    
    if (historyDoc.exists()) {
        state.currentDayData = historyDoc.data();
    } else {
        state.currentDayData = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] };
    }
}

function checkFirstVisit() {
    if (!state.user.name) {
        nameModal.classList.add('active');
        nameModal.style.display = 'flex';
    }
}

// --- CAMERA & ANALYSIS ---
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
    } catch (err) {
        console.error("Camera error:", err);
    }
}

function captureImage() {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
}

async function analyzeMeal(imageData) {
    showLoading(true);
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        if (!response.ok) throw new Error("Backend error");
        const data = await response.json();
        showResult(data, imageData);
    } catch (err) {
        console.error("Analysis failed:", err);
        alert("Many People are using! Server is busy....);
    } finally {
        showLoading(false);
    }
}

// --- UI UPDATES ---
function updateUI() {
    const dayData = state.currentDayData;
    document.getElementById('username-val').textContent = state.user.name || "Guest";
    
    updateProgress('cal', dayData.calories, state.goals.calories);
    updateProgress('pro', dayData.protein, state.goals.protein);
    updateProgress('carb', dayData.carbs, state.goals.carbs);
    updateProgress('fat', dayData.fat, state.goals.fat);

    updateInsight(dayData);
    renderHistory(dayData.meals);
    
    document.getElementById('lang-text').textContent = state.lang;
    document.getElementById('greeting-text').textContent = translations[state.lang].greeting;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[state.lang][key]) el.textContent = translations[state.lang][key];
    });

    updateStreakDisplay();
}

function updateProgress(type, current, goal) {
    const percent = Math.min((current / goal) * 100, 100);
    if (type === 'cal') {
        document.getElementById('cal-current').textContent = Math.round(current);
        document.getElementById('cal-goal').textContent = goal;
        document.getElementById('cal-progress-ring').style.strokeDashoffset = 283 - (283 * percent) / 100;
    } else {
        document.getElementById(`${type}-current`).textContent = Math.round(current);
        document.getElementById(`${type}-goal`).textContent = goal;
        const bar = document.querySelector(`.${type}-bar`);
        if (bar) bar.style.width = `${percent}%`;
    }
}

function updateInsight(dayData) {
    const insightEl = document.getElementById('daily-insight');
    const span = insightEl.querySelector('span');
    if (dayData.meals.length === 0) {
        span.textContent = "Scan your first meal to start!";
        insightEl.className = "insight-pill";
        return;
    }
    const calPct = (dayData.calories / state.goals.calories) * 100;
    if (calPct > 100) {
        span.textContent = "Too many calories detected! ⚠️";
        insightEl.className = "insight-pill danger";
    } else if (calPct > 80) {
        span.textContent = "Almost at your limit. Eat light! 🥗";
        insightEl.className = "insight-pill warning";
    } else {
        span.textContent = "Great job! Your nutrition is balanced. ✨";
        insightEl.className = "insight-pill";
    }
}

function renderHistory(meals) {
    if (!meals || meals.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><p>No meals tracked yet today.</p></div>`;
        return;
    }
    historyList.innerHTML = meals.map(meal => `
        <div class="meal-card animate-pop" onclick="this.classList.toggle('expanded')">
            <div class="meal-main-info">
                <img src="${meal.image || 'https://via.placeholder.com/60'}" class="meal-img">
                <div class="meal-info">
                    <h4>${meal.name}</h4>
                    <span>${meal.time} • ${meal.type}</span>
                </div>
                <div class="meal-cal">${meal.calories} kcal</div>
            </div>
            <div class="meal-details">
                <div class="meal-macros">
                    <div class="macro-pill">P: ${meal.protein}g</div>
                    <div class="macro-pill">C: ${meal.carbs}g</div>
                    <div class="macro-pill">F: ${meal.fat}g</div>
                </div>
                <div class="meal-footer">
                    <span class="badge ${meal.health.toLowerCase()}">${meal.health}</span>
                    <p class="meal-tip-small">${meal.tip}</p>
                </div>
            </div>
        </div>
    `).reverse().join('');
}

function showResult(data, imageData) {
    document.getElementById('res-food-name').textContent = data.name;
    document.getElementById('res-cal').textContent = data.calories;
    document.getElementById('res-pro').textContent = data.protein;
    document.getElementById('res-carb').textContent = data.carbs;
    document.getElementById('res-fat').textContent = data.fat;
    document.getElementById('res-tip').textContent = data.tip;
    document.getElementById('result-img').src = imageData;
    const badge = document.getElementById('res-health-badge');
    badge.textContent = data.health;
    badge.className = 'badge ' + data.health.toLowerCase();
    document.getElementById('improve-panel').classList.remove('active');
    resultModal.dataset.currentMeal = JSON.stringify(data);
    resultModal.dataset.currentImg = imageData;
    resultModal.classList.add('active');
}

function showLoading(show) {
    document.getElementById('scan-loading').style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('loading', show);
}

// --- DATA PERSISTENCE ---
async function addMealToHistory(meal, imageData) {
    const today = getFormattedDate(new Date());
    const newDayData = { ...state.currentDayData };
    
    const entry = {
        ...meal,
        image: imageData,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: getMealType()
    };
    
    newDayData.meals.push(entry);
    newDayData.calories += Number(meal.calories);
    newDayData.protein += Number(meal.protein);
    newDayData.carbs += Number(meal.carbs);
    newDayData.fat += Number(meal.fat);

    await setDoc(doc(db, 'users', state.uid, 'history', today), newDayData);
    
    if (state.selectedDate === today) {
        state.currentDayData = newDayData;
        updateUI();
        initCalendar();
    }
}

async function saveGoals() {
    state.goals.calories = parseInt(document.getElementById('goal-cal-input').value);
    state.goals.protein = parseInt(document.getElementById('goal-pro-input').value);
    state.goals.carbs = parseInt(document.getElementById('goal-carb-input').value);
    state.goals.fat = parseInt(document.getElementById('goal-fat-input').value);

    await updateDoc(doc(db, 'users', state.uid), { goals: state.goals });
    goalModal.classList.remove('active');
    updateUI();
}

async function saveWeight() {
    const weight = parseFloat(document.getElementById('weight-input').value);
    if (!isNaN(weight)) {
        await setDoc(doc(db, 'users', state.uid, 'weight', state.selectedDate), { weight });
        alert("Weight saved! ⚖️");
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    scanBtn.onclick = () => analyzeMeal(captureImage());
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => analyzeMeal(event.target.result);
            reader.readAsDataURL(file);
        }
    };
    document.getElementById('close-result').onclick = () => resultModal.classList.remove('active');
    document.getElementById('add-to-log-btn').onclick = () => addMealToHistory(JSON.parse(resultModal.dataset.currentMeal), resultModal.dataset.currentImg);
    document.getElementById('set-goals-btn').onclick = () => {
        document.getElementById('goal-cal-input').value = state.goals.calories;
        document.getElementById('goal-pro-input').value = state.goals.protein;
        document.getElementById('goal-carb-input').value = state.goals.carbs;
        document.getElementById('goal-fat-input').value = state.goals.fat;
        
        // Set active mode card
        document.querySelectorAll('.mode-card').forEach(c => {
            c.classList.toggle('active', c.dataset.mode === state.goals.mode);
        });

        goalModal.classList.add('active');
    };
    document.getElementById('close-goals').onclick = () => goalModal.classList.remove('active');
    document.getElementById('save-goals').onclick = saveGoals;
    document.getElementById('save-weight-btn').onclick = saveWeight;
    document.getElementById('save-name').onclick = async () => {
        const name = document.getElementById('name-input').value.trim();
        if (name) {
            state.user.name = name;
            await updateDoc(doc(db, 'users', state.uid), { name });
            nameModal.classList.remove('active');
            nameModal.style.display = 'none';
            updateUI();
        }
    };
    document.getElementById('view-weekly-btn').onclick = () => {
        weeklyModal.classList.add('active');
        renderWeeklyChart();
    };
    document.getElementById('close-weekly').onclick = () => weeklyModal.classList.remove('active');
    document.getElementById('improve-meal-btn').onclick = () => {
        const panel = document.getElementById('improve-panel');
        const list = document.getElementById('suggestions-list');
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            const suggestions = generateSuggestions(JSON.parse(resultModal.dataset.currentMeal));
            list.innerHTML = suggestions.map((s, i) => `<div class="suggestion-card" style="animation-delay: ${i * 0.1}s"><i class="${s.icon}"></i><span>${s.text}</span></div>`).join('');
        }
    };

    // Mode Card Clicks
    document.querySelectorAll('.mode-card').forEach(card => {
        card.onclick = () => {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            applyGoalMode(card.dataset.mode);
        };
    });

    // Language Toggle Click
    document.getElementById('lang-toggle').onclick = () => {
        state.lang = state.lang === 'EN' ? 'NP' : 'EN';
        updateUI();
    };

    // Initialize Floating Foods Interaction
    initFloatingFoods();

    // Watermark Surprise
    const watermark = document.getElementById('watermark');
    if (watermark) {
        watermark.onclick = () => {
            watermark.classList.add('surprised');
            createConfetti();
            setTimeout(() => watermark.classList.remove('surprised'), 5000);
        };
    }
}

function createConfetti() {
    const colors = ['#4CAF50', '#FF6F61', '#FFA726', '#FFEB3B', '#2196F3'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0%';
        document.body.appendChild(confetti);
        
        // Remove after animation
        setTimeout(() => confetti.remove(), 5000);
    }
}

function initFloatingFoods() {
    const wrappers = document.querySelectorAll('.food-wrapper');
    
    wrappers.forEach(wrapper => {
        const x = Math.random() * (window.innerWidth - 60);
        const y = Math.random() * (window.innerHeight - 60);
        
        wrapper.style.left = `${x}px`;
        wrapper.style.top = `${y}px`;
        
        wrapper.dataset.x = x;
        wrapper.dataset.y = y;
    });

    window.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const radius = 150;
        
        wrappers.forEach(wrapper => {
            const item = wrapper.querySelector('.food-item');
            const foodX = parseFloat(wrapper.dataset.x) + 25;
            const foodY = parseFloat(wrapper.dataset.y) + 25;
            
            const dx = foodX - mouseX;
            const dy = foodY - mouseY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < radius) {
                const force = (radius - distance) / radius;
                const moveX = (dx / distance) * force * 120;
                const moveY = (dy / distance) * force * 120;
                
                item.style.transform = `translate(${moveX}px, ${moveY}px) rotate(${moveX}deg)`;
            } else {
                item.style.transform = `translate(0, 0) rotate(0deg)`;
            }
        });
    });
}

function applyGoalMode(mode) {
    state.goals.mode = mode;
    if (mode === 'loss') {
        state.goals.calories = 1600;
        state.goals.protein = 120;
        state.goals.carbs = 150;
        state.goals.fat = 50;
    } else if (mode === 'gain') {
        state.goals.calories = 2800;
        state.goals.protein = 180;
        state.goals.carbs = 350;
        state.goals.fat = 90;
    } else {
        state.goals.calories = 2000;
        state.goals.protein = 140;
        state.goals.carbs = 200;
        state.goals.fat = 70;
    }
    
    // Update inputs in UI
    document.getElementById('goal-cal-input').value = state.goals.calories;
    document.getElementById('goal-pro-input').value = state.goals.protein;
    document.getElementById('goal-carb-input').value = state.goals.carbs;
    document.getElementById('goal-fat-input').value = state.goals.fat;
}

// --- CALENDAR & WEEKLY ---
function initCalendar() {
    const today = new Date();
    calendarWeek.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateStr = getFormattedDate(date);
        const dayItem = document.createElement('div');
        dayItem.className = `day-item ${dateStr === state.selectedDate ? 'active' : ''}`;
        dayItem.innerHTML = `
            <span class="day-name">${date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span class="day-num">${date.getDate()}</span>
            <div class="day-dot"></div>
        `;
        dayItem.onclick = async () => {
            state.selectedDate = dateStr;
            await fetchHistoryForDate(dateStr);
            initCalendar();
            updateUI();
        };
        calendarWeek.appendChild(dayItem);
    }
}

async function renderWeeklyChart() {
    const ctx = document.getElementById('weekly-chart').getContext('2d');
    const last7Days = [];
    const calories = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateStr = getFormattedDate(date);
        last7Days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        const historyDoc = await getDoc(doc(db, 'users', state.uid, 'history', dateStr));
        calories.push(historyDoc.exists() ? historyDoc.data().calories : 0);
    }
    if (weeklyChart) weeklyChart.destroy();
    weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last7Days,
            datasets: [{ label: 'Calories', data: calories, backgroundColor: '#4CAF50', borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// --- HELPERS ---
function getFormattedDate(date) { return date.toISOString().split('T')[0]; }
function getMealType() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'Breakfast';
    if (h >= 11 && h < 16) return 'Lunch';
    if (h >= 16 && h < 22) return 'Dinner';
    return 'Snack';
}
function generateSuggestions(meal) {
    const s = [];
    if (meal.protein < 10) s.push({ icon: 'fas fa-egg', text: 'Add an egg for protein' });
    if (meal.calories > 500) s.push({ icon: 'fas fa-leaf', text: 'Add more greens' });
    if (s.length < 2) s.push({ icon: 'fas fa-apple-whole', text: 'Add a fruit' });
    return s.slice(0, 3);
}
function updateStreakDisplay() {
    document.getElementById('streak-count').textContent = "1";
    document.getElementById('streak-count-header').textContent = "1";
}
