// ===== Configuration =====
const API_BASE_URL = 'https://kickoffapi-b9gabefrbsc5bre5.italynorth-01.azurewebsites.net/api';
let jwtToken = null;

// ===== Utility Functions =====
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function showMessage(elementId, text, type) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.textContent = text;
  element.className = `message ${type}`;
  element.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

// ===== Session Management =====
function saveSession(token) {
  sessionStorage.setItem('jwtToken', token);
  jwtToken = token;
}

function loadSession() {
  const token = sessionStorage.getItem('jwtToken');
  if (token) {
    jwtToken = token;
    return true;
  }
  return false;
}

function clearSession() {
  sessionStorage.removeItem('jwtToken');
  jwtToken = null;
}

function checkAuth() {
  const hasToken = loadSession();
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  
  // If on a protected page without token, redirect to login
  if (!hasToken && currentPage !== 'index.html' && currentPage !== '') {
    window.location.href = 'index.html';
    return false;
  }
  
  // If on landing page with token, redirect to dashboard
  if (hasToken && (currentPage === 'index.html' || currentPage === '')) {
    // Only redirect if we're on the actual landing view
    const landingView = document.getElementById('landingView');
    if (landingView && landingView.style.display !== 'none') {
      window.location.href = 'dashboard.html';
      return false;
    }
  }
  
  return hasToken;
}

// ===== Navigation Functions =====
function setupNavigation() {
  const isAuthenticated = loadSession();
  const nav = document.getElementById('mainNav');
  
  if (nav) {
    nav.style.display = isAuthenticated ? 'block' : 'none';
  }
  
  // Setup mobile menu toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-container')) {
        navLinks.classList.remove('active');
      }
    });
  }
  
  // Setup logout buttons
  const logoutBtns = document.querySelectorAll('#logoutBtn, #navLogout');
  logoutBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', logout);
    }
  });
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

// ===== API Functions =====
async function register(username, password) {
  try {
    const res = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const text = await res.text();
    
    if (res.ok) {
      return { success: true, message: 'Registration successful! You can now log in.' };
    } else {
      return { success: false, message: `Registration failed: ${text || 'Unknown error'}` };
    }
  } catch (err) {
    console.error('Registration error:', err);
    return { success: false, message: `Error: ${err.message}` };
  }
}

async function login(username, password) {
  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
      const data = await res.json();
      saveSession(data.token);
      return { success: true, token: data.token };
    } else {
      const text = await res.text();
      return { success: false, message: `Login failed: ${text || 'Invalid credentials'}` };
    }
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, message: `Error: ${err.message}` };
  }
}

async function loadScoreboard() {
  const tbody = document.querySelector('#scoreboardTable tbody');
  if (!tbody) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/scoreboard`);
    
    if (res.ok) {
      const data = await res.json();
      tbody.innerHTML = '';
      
      const scoreboardData = Array.isArray(data) ? data : (data.scoreboard || []);
      
      if (scoreboardData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">No players yet. Be the first!</td></tr>';
        return;
      }
      
      scoreboardData.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${escapeHTML(row.username)}</td>
          <td>${escapeHTML(String(row.score || 0))}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">Failed to load scoreboard</td></tr>';
    }
  } catch (err) {
    console.error('Scoreboard error:', err);
    tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">Error loading scoreboard</td></tr>';
  }
}

async function submitFlag(flag) {
  if (!jwtToken) {
    return { success: false, message: 'Not authenticated. Please log in.' };
  }
  
  try {
    const res = await fetch(`${API_BASE_URL}/submitFlag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ flag })
    });
    
    const text = await res.text();
    
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        return { 
          success: true, 
          message: `ðŸŽ‰ Correct! You earned ${data.points} points! Total: ${data.newScore}` 
        };
      } catch {
        return { success: true, message: 'ðŸŽ‰ Flag accepted!' };
      }
    } else {
      let errorMessage = 'Invalid flag';
      if (text.includes('already_claimed')) {
        errorMessage = 'âš ï¸ You already submitted this flag!';
      } else if (text.includes('invalid_flag')) {
        errorMessage = 'âŒ Invalid flag. Keep searching!';
      } else if (text.includes('invalid_token')) {
        errorMessage = 'ðŸ”’ Session expired. Please log in again.';
        setTimeout(() => logout(), 2000);
      }
      return { success: false, message: errorMessage };
    }
  } catch (err) {
    console.error('Submit flag error:', err);
    return { success: false, message: `Error: ${err.message}` };
  }
}

// ===== Page-Specific Initialization =====

// Landing Page (index.html)
function initLandingPage() {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const registerCard = document.getElementById('registerCard');
  const loginCard = document.getElementById('loginCard');
  const showLoginLink = document.getElementById('showLogin');
  const showRegisterLink = document.getElementById('showRegister');
  
  // Check if user is already logged in
  if (loadSession()) {
    window.location.href = 'dashboard.html';
    return;
  }
  
  // Toggle between register and login forms
  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      registerCard.style.display = 'none';
      loginCard.style.display = 'block';
    });
  }
  
  if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
      e.preventDefault();
      loginCard.style.display = 'none';
      registerCard.style.display = 'block';
    });
  }
  
  // Register form handler
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value.trim();
      
      if (!username || !password) {
        showMessage('message', 'Please enter both username and password', 'error');
        return;
      }
      
      const result = await register(username, password);
      showMessage('message', result.message, result.success ? 'success' : 'error');
      
      if (result.success) {
        registerForm.reset();
        // Switch to login form
        setTimeout(() => {
          registerCard.style.display = 'none';
          loginCard.style.display = 'block';
        }, 1500);
      }
    });
  }
  
  // Login form handler
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      
      if (!username || !password) {
        showMessage('message', 'Please enter both username and password', 'error');
        return;
      }
      
      const result = await login(username, password);
      
      if (result.success) {
        showMessage('message', 'Login successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      } else {
        showMessage('message', result.message, 'error');
      }
    });
  }
}

// Dashboard Page
function initDashboardPage() {
  if (!checkAuth()) return;
  
  // Load scoreboard on page load
  loadScoreboard();
  
  // Auto-refresh scoreboard every 30 seconds
  setInterval(loadScoreboard, 30000);
  
  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.style.animation = 'none';
      setTimeout(() => {
        refreshBtn.style.animation = '';
      }, 10);
      loadScoreboard();
    });
  }
  
  // Flag submission form
  const flagForm = document.getElementById('flagForm');
  if (flagForm) {
    flagForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const flagInput = document.getElementById('flagInput');
      const flag = flagInput.value.trim();
      
      if (!flag) {
        showMessage('scoreboardMessage', 'Please enter a flag', 'error');
        return;
      }
      
      if (!flag.startsWith('FLAG{') || !flag.endsWith('}')) {
        showMessage('scoreboardMessage', 'Flag must be in format: FLAG{...}', 'error');
        return;
      }
      
      const result = await submitFlag(flag);
      showMessage('scoreboardMessage', result.message, result.success ? 'success' : 'error');
      
      if (result.success) {
        flagInput.value = '';
        // Refresh scoreboard after successful submission
        setTimeout(loadScoreboard, 1000);
      }
    });
  }
  
  // Display welcome message with username (if available)
  const welcomeMessage = document.getElementById('welcomeMessage');
  if (welcomeMessage) {
    // You could decode the JWT to get username, but for simplicity:
    welcomeMessage.textContent = 'Welcome back, hacker! ðŸš€';
  }
}

// About/Events Pages
function initStaticPage() {
  if (!checkAuth()) return;
  // No special initialization needed for static pages
}

// ===== Main Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  // Setup navigation for all pages
  setupNavigation();
  
  // Determine current page and initialize accordingly
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  
  switch (currentPage) {
    case 'index.html':
    case '':
      initLandingPage();
      break;
    case 'dashboard.html':
      initDashboardPage();
      break;
    case 'about.html':
    case 'events.html':
      initStaticPage();
      break;
    default:
      // Unknown page, setup basic auth check
      checkAuth();
  }
  
  // Add smooth scrolling to all anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
});

// ===== Error Handling =====
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// ===== Console Easter Egg =====
console.log('%cðŸ” Welcome, CTF Hunter! ðŸ”', 'color: #3285F5; font-size: 24px; font-weight: bold;');
console.log('%cLooks like you know your way around developer tools!', 'color: #57CAFF; font-size: 14px;');
console.log('%cKeep exploring... there are more flags hidden around here! ðŸš©', 'color: #F9AB00; font-size: 14px;');