let jwtToken = null;

// Use dedicated Function App URL
const API_BASE_URL = 'https://kickoffapi-b9gabefrbsc5bre5.italynorth-01.azurewebsites.net/api';

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

const messageDiv = document.getElementById('message');
const scoreboardMessage = document.getElementById('scoreboardMessage');

document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  try {
    const res = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    console.log('Register response status:', res.status);
    console.log('Register response headers:', res.headers);
    
    const text = await res.text();
    console.log('Register response body:', text);
    
    if (res.ok) {
      messageDiv.textContent = "Registration successful. You can now log in.";
      messageDiv.className = "success";
    } else {
      messageDiv.textContent = "Registration failed (" + res.status + "): " + (text || "No error message");
      messageDiv.className = "error";
    }
  } catch (err) {
    console.error("Registration error:", err);
    messageDiv.textContent = "Error: " + err.message;
    messageDiv.className = "error";
  }
});

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json();
      jwtToken = data.token;
      document.getElementById('landingView').style.display = 'none';
      document.getElementById('scoreboardView').style.display = 'block';
      loadScoreboard();
    } else {
      const text = await res.text();
      messageDiv.textContent = "Login failed: " + text;
      messageDiv.className = "error";
    }
  } catch (err) {
    messageDiv.textContent = "Error: " + err.message;
    messageDiv.className = "error";
  }
});

async function loadScoreboard() {
  try {
    const res = await fetch(`${API_BASE_URL}/scoreboard`);
    if (res.ok) {
      const data = await res.json();
      const tbody = document.querySelector('#scoreboardTable tbody');
      tbody.innerHTML = "";
      // Handle response as array directly
      const scoreboardData = Array.isArray(data) ? data : (data.scoreboard || []);
      scoreboardData.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          "<td>" + (i+1) + "</td>" +
          "<td>" + escapeHTML(row.username) + "</td>" +
          "<td>" + escapeHTML(String(row.score)) + "</td>";
        tbody.appendChild(tr);
      });
    } else {
      scoreboardMessage.textContent = "Failed to load scoreboard.";
      scoreboardMessage.className = "error";
    }
  } catch (err) {
    scoreboardMessage.textContent = "Error: " + err.message;
    scoreboardMessage.className = "error";
  }
}

document.getElementById('flagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const flag = document.getElementById('flagInput').value.trim();
  try {
    const res = await fetch(`${API_BASE_URL}/submitFlag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + jwtToken
      },
      body: JSON.stringify({ flag })
    });
    if (res.ok) {
      scoreboardMessage.textContent = "Flag submitted successfully!";
      scoreboardMessage.className = "success";
      document.getElementById('flagInput').value = "";
      loadScoreboard();
    } else {
      const text = await res.text();
      scoreboardMessage.textContent = "Flag submission failed: " + text;
      scoreboardMessage.className = "error";
    }
  } catch (err) {
    scoreboardMessage.textContent = "Error: " + err.message;
    scoreboardMessage.className = "error";
  }
});