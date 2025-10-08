let jwtToken = null;

// Use dedicated Function App URL
const API_BASE_URL = 'https://kickoffapi-b9gabefrbsc5bre5.italynorth-01.azurewebsites.net/api';

// Security: HTML escaping to prevent XSS
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Session management functions
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
  window.location.href = 'index.html';
}

// Input validation
function validateUsername(username) {
  const errors = [];
  
  if (!username || username.length < 3 || username.length > 20) {
    errors.push('Username must be between 3 and 20 characters');
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, hyphens, and underscores');
  }
  
  // Silly rule: Username must contain at least one vowel
  if (!/[aeiouAEIOU]/.test(username)) {
    errors.push('Username must contain at least one vowel (a, e, i, o, u)');
  }
  
  // Silly rule: Username cannot be all lowercase
  if (username === username.toLowerCase() && username.length > 0) {
    errors.push('Username must contain at least one uppercase letter');
  }
  
  return errors.length > 0 ? errors.join(' ') : null;
}

function validatePassword(password, username) {
  const errors = [];
  
  // Basic requirement
  if (!password || password.length < 10) {
    errors.push('🔒 Password must be at least 10 characters');
  }
  
  // Must have uppercase
  if (!/[A-Z]/.test(password)) {
    errors.push('🔤 Password must contain at least one uppercase letter');
  }
  
  // Must have lowercase
  if (!/[a-z]/.test(password)) {
    errors.push('🔡 Password must contain at least one lowercase letter');
  }
  
  // Must have number
  if (!/[0-9]/.test(password)) {
    errors.push('🔢 Password must contain at least one number');
  }
  
  // Silly rule: Must contain a special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('✨ Password must contain at least one special character (!@#$%^&*)');
  }
  
  // Silly rule: Must contain a letter from the username
  if (username && username.length > 0) {
    const usernameChars = username.toLowerCase().split('');
    const hasUsernameChar = usernameChars.some(char => password.toLowerCase().includes(char));
    if (!hasUsernameChar) {
      errors.push('👤 Password must contain at least one letter from your username');
    }
  }
  
  // Silly rule: The digits must sum to at least 20
  const digits = password.match(/\d/g);
  if (digits) {
    const sum = digits.reduce((acc, d) => acc + parseInt(d), 0);
    if (sum < 20) {
      errors.push(`🧮 The digits in your password must sum to at least 20 (current: ${sum})`);
    }
  }
  
  // Silly rule: Cannot contain the word "password"
  if (password.toLowerCase().includes('password')) {
    errors.push('🚫 Password cannot contain the word "password"');
  }
  
  // Silly rule: Must include the current month number
  const currentMonth = new Date().getMonth() + 1; // October = 10
  if (!password.includes(String(currentMonth))) {
    errors.push(`📅 Password must include the current month number (${currentMonth})`);
  }
  
  return errors.length > 0 ? errors : null;
}

function validateFlag(flag) {
  if (!flag) {
    return 'Flag cannot be empty';
  }
  if (!/^FLAG\{.+\}$/.test(flag)) {
    return 'Flag must be in format: FLAG{text_here}';
  }
  return null;
}

// Message display
function showMessage(elementId, message, type) {
  const messageDiv = document.getElementById(elementId);
  if (!messageDiv) return;
  
  messageDiv.innerHTML = message; // Use innerHTML to support HTML formatting
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';
  
  // Auto-hide after 8 seconds (longer for password errors)
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 8000);
}

// Check if user is logged in (for protected pages)
function checkAuth() {
  const currentPage = window.location.pathname.split('/').pop();
  const publicPages = ['index.html', 'login.html', ''];
  
  if (!publicPages.includes(currentPage)) {
    if (!loadSession()) {
      window.location.href = 'index.html';
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  
  // Toggle between login and register forms (index.html)
  const showLoginBtn = document.getElementById('showLogin');
  const showRegisterBtn = document.getElementById('showRegister');
  const registerCard = document.getElementById('registerCard');
  const loginCard = document.getElementById('loginCard');
  
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      registerCard.style.display = 'none';
      loginCard.style.display = 'block';
    });
  }
  
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loginCard.style.display = 'none';
      registerCard.style.display = 'block';
    });
  }
  
  // Real-time password validation feedback
  const registerPassword = document.getElementById('registerPassword');
  const registerUsername = document.getElementById('registerUsername');
  if (registerPassword && registerUsername) {
    registerPassword.addEventListener('input', () => {
      const username = registerUsername.value.trim();
      const password = registerPassword.value.trim();
      const errors = validatePassword(password, username);
      
      const helpText = document.getElementById('passwordHelp');
      if (helpText && errors) {
        helpText.innerHTML = errors.map(err => `<div style="margin:4px 0;">${err}</div>`).join('');
        helpText.style.color = 'rgba(234, 67, 53, 0.9)';
      } else if (helpText) {
        helpText.innerHTML = '✅ Password meets all requirements!';
        helpText.style.color = 'rgba(15, 157, 88, 0.9)';
      }
    });
  }
  
  // Register form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
  
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Flag submission form
  const flagForm = document.getElementById('flagForm');
  if (flagForm) {
    flagForm.addEventListener('submit', handleFlagSubmit);
  }
  
  // Logout buttons
  const logoutButtons = document.querySelectorAll('#navLogout, #logoutBtn');
  logoutButtons.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        clearSession();
      });
    }
  });
  
  // Refresh scoreboard button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadScoreboard);
  }
  
  // Load scoreboard if on dashboard
  if (document.getElementById('scoreboardTable')) {
    loadScoreboard();
    loadUserStats();
  }
  
  if (window.location.pathname.includes('events.html')) {
    console.log('%cFLAG{console_log_detective}', 'color: #3285F5; font-size: 20px; font-weight: bold;');
  }

  if (window.location.pathname.includes('about.html')) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, config = {}] = args;
      config.headers = config.headers || {};
      config.headers['X-Girona-History'] = 'Gustave Eiffel built Pont de les Peixateries Velles in 1877, before his famous tower!';
      config.headers['X-Secret-Flag'] = 'FLAG{pont_de_ferro_1877}';
      return originalFetch(url, config);
    };
    
    // Trigger a fetch so they can see the headers
    fetch(`${API_BASE_URL}/scoreboard`).catch(() => {});
  }
});

// Register handler
async function handleRegister(e) {
  e.preventDefault();
  
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  
  // Validate username
  const usernameError = validateUsername(username);
  if (usernameError) {
    showMessage('message', usernameError, 'error');
    return;
  }
  
  // Validate password
  const passwordErrors = validatePassword(password, username);
  if (passwordErrors) {
    const errorHTML = '<strong>Password requirements not met:</strong><br>' + 
                      passwordErrors.map(err => `• ${err}`).join('<br>');
    showMessage('message', errorHTML, 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
      showMessage('message', '🎉 Registration successful! You can now log in.', 'success');
      // Auto-switch to login form
      setTimeout(() => {
        document.getElementById('registerCard').style.display = 'none';
        document.getElementById('loginCard').style.display = 'block';
      }, 1500);
    } else {
      const text = await res.text();
      showMessage('message', `Registration failed: ${text}`, 'error');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showMessage('message', 'Network error. Please try again.', 'error');
  }
}

// Login handler
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  
  // Simple validation for login (no silly rules)
  if (!username || !password) {
    showMessage('message', 'Please enter both username and password', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
      const data = await res.json();
      saveSession(data.token);
      window.location.href = 'dashboard.html';
    } else {
      const text = await res.text();
      showMessage('message', `Login failed: ${text}`, 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    showMessage('message', 'Network error. Please try again.', 'error');
  }
}

// Flag submission handler
async function handleFlagSubmit(e) {
  e.preventDefault();
  
  const flag = document.getElementById('flagInput').value.trim();
  
  // Validate flag format
  const flagError = validateFlag(flag);
  if (flagError) {
    showMessage('scoreboardMessage', flagError, 'error');
    return;
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
    
    if (res.ok) {
      const data = await res.json();
      showMessage('scoreboardMessage', 
        `🎯 Flag accepted! +${data.points} points. New score: ${data.newScore}`, 
        'success');
      document.getElementById('flagInput').value = '';
      loadScoreboard();
      loadUserStats();
    } else {
      const text = await res.text();
      showMessage('scoreboardMessage', `Flag submission failed: ${text}`, 'error');
    }
  } catch (err) {
    console.error('Flag submission error:', err);
    showMessage('scoreboardMessage', 'Network error. Please try again.', 'error');
  }
}

// Load scoreboard
async function loadScoreboard() {
  try {
    const res = await fetch(`${API_BASE_URL}/scoreboard`);
    
    if (res.ok) {
      const data = await res.json();
      const tbody = document.querySelector('#scoreboardTable tbody');
      
      if (!tbody) return;
      
      tbody.innerHTML = '';
      
      const scoreboardData = Array.isArray(data) ? data : (data.scoreboard || []);
      
      if (scoreboardData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:2rem;color:rgba(255,255,255,0.5);">No players yet. Be the first!</td></tr>';
        return;
      }
      
      scoreboardData.forEach((row, i) => {
        const tr = document.createElement('tr');
        const rank = i + 1;
        
        // Add medal emoji for top 3
        let rankDisplay = rank;
        if (rank === 1) rankDisplay = '🥇 1';
        else if (rank === 2) rankDisplay = '🥈 2';
        else if (rank === 3) rankDisplay = '🥉 3';
        
        tr.innerHTML = `
          <td>${rankDisplay}</td>
          <td>${escapeHTML(row.username)}</td>
          <td><strong>${escapeHTML(String(row.score))}</strong></td>
        `;
        
        // Highlight current user
        if (jwtToken) {
          try {
            const payload = JSON.parse(atob(jwtToken.split('.')[1]));
            if (payload.username === row.username) {
              tr.style.background = 'rgba(50, 133, 245, 0.1)';
              tr.style.borderLeft = '3px solid var(--color-google-blue)';
            }
          } catch (e) {}
        }
        
        tbody.appendChild(tr);
      });
    } else {
      showMessage('scoreboardMessage', 'Failed to load scoreboard.', 'error');
    }
  } catch (err) {
    console.error('Scoreboard error:', err);
    showMessage('scoreboardMessage', 'Network error loading scoreboard.', 'error');
  }
}

// Load user stats for dashboard
async function loadUserStats() {
  if (!jwtToken) return;
  
  try {
    // Get current user's username from JWT
    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
    const username = payload.username;
    
    // Fetch scoreboard to get user stats
    const res = await fetch(`${API_BASE_URL}/scoreboard`);
    if (res.ok) {
      const data = await res.json();
      const scoreboardData = Array.isArray(data) ? data : (data.scoreboard || []);
      
      const userIndex = scoreboardData.findIndex(u => u.username === username);
      
      if (userIndex !== -1) {
        const user = scoreboardData[userIndex];
        
        // Update stat cards
        const totalPointsEl = document.getElementById('totalPoints');
        const flagsFoundEl = document.getElementById('flagsFound');
        const globalRankEl = document.getElementById('globalRank');
        
        if (totalPointsEl) totalPointsEl.textContent = user.score || 0;
        if (flagsFoundEl) {
          // Calculate flags found (50pts + 50pts + 100pts*2 + 150pts*2 = 650 total)
          const score = user.score || 0;
          let flagsFound = 0;
          if (score >= 50) flagsFound++;
          if (score >= 100) flagsFound++;
          if (score >= 200) flagsFound++;
          if (score >= 300) flagsFound++;
          if (score >= 450) flagsFound++;
          if (score >= 600) flagsFound = 6;
          flagsFoundEl.textContent = flagsFound;
        }
        if (globalRankEl) globalRankEl.textContent = `#${userIndex + 1}`;
      }
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}