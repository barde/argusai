import { Context } from 'hono';
import { Env } from '../types/env';
import { verifyJWT, extractJWTFromCookie } from '../utils/jwt';
import { statusHandler } from './status';

/**
 * Enhanced dashboard that shows status and user repositories
 */
export async function dashboardHandler(c: Context<{ Bindings: Env }>) {
  // Check if user is authenticated
  const jwt = extractJWTFromCookie(c.req.header('Cookie') || null);
  let user = null;
  let repositories = [];

  if (jwt && c.env.JWT_SECRET) {
    const payload = await verifyJWT(jwt, c.env.JWT_SECRET);
    if (payload) {
      user = {
        id: payload.sub,
        login: payload.login,
        name: payload.name,
        avatar_url: payload.avatar_url,
      };

      // Fetch user's repositories if authenticated
      try {
        const reposResponse = await fetch(`${new URL(c.req.url).origin}/api/user/repos`, {
          headers: {
            Cookie: c.req.header('Cookie') || '',
          },
        });

        if (reposResponse.ok) {
          const reposData = (await reposResponse.json()) as { repositories?: any[] };
          repositories = reposData.repositories || [];
        }
      } catch (error) {
        console.error('Failed to fetch repositories:', error);
      }
    }
  }

  // Get status data
  const statusResponse = await statusHandler(c);
  const statusData = (await statusResponse.json()) as any;

  // Generate enhanced HTML
  const html = generateDashboardHTML(statusData, user, repositories);
  return c.html(html, statusData.status === 'healthy' ? 200 : 503);
}

function generateDashboardHTML(statusData: any, user: any, repositories: any[]): string {
  const statusIcon = statusData.status === 'healthy' ? '✅' : '⚠️';
  const statusColor = statusData.status === 'healthy' ? '#22c55e' : '#f59e0b';

  const checkIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ArgusAI Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f9fafb;
    }
    .header {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 600;
      background: ${statusColor}20;
      color: ${statusColor};
    }
    .auth-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .github-login-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #24292e;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .github-login-btn:hover {
      background: #1a1e22;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid #e5e7eb;
    }
    .user-dropdown {
      position: relative;
    }
    .user-menu {
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 8px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      min-width: 200px;
      display: none;
      z-index: 10;
    }
    .user-dropdown:hover .user-menu {
      display: block;
    }
    .user-menu a {
      display: block;
      padding: 8px 16px;
      text-decoration: none;
      color: #333;
      transition: background 0.2s;
    }
    .user-menu a:hover {
      background: #f3f4f6;
    }
    .logout-btn {
      color: #ef4444 !important;
      border-top: 1px solid #e5e7eb;
      cursor: pointer;
    }
    .section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 24px;
    }
    .section h2 {
      margin-top: 0;
      margin-bottom: 16px;
      color: #1f2937;
    }
    .repo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .repo-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .repo-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .repo-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 8px;
    }
    .repo-name {
      font-weight: 600;
      color: #0969da;
      text-decoration: none;
      font-size: 16px;
    }
    .repo-name:hover {
      text-decoration: underline;
    }
    .repo-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toggle-switch {
      position: relative;
      width: 48px;
      height: 24px;
      cursor: pointer;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
      border-radius: 24px;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }
    input:checked + .toggle-slider {
      background-color: #22c55e;
    }
    input:checked + .toggle-slider:before {
      transform: translateX(24px);
    }
    .repo-description {
      color: #6b7280;
      font-size: 14px;
      margin: 8px 0;
    }
    .repo-meta {
      display: flex;
      gap: 16px;
      font-size: 14px;
      color: #6b7280;
    }
    .check-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .check-item:last-child {
      border-bottom: none;
    }
    .check-icon {
      font-size: 20px;
      margin-right: 12px;
    }
    .check-name {
      flex: 1;
      font-weight: 500;
    }
    .check-message {
      color: #6b7280;
      font-size: 14px;
    }
    .check-details {
      margin-left: 32px;
      margin-top: 4px;
      padding: 8px;
      background: #f3f4f6;
      border-radius: 6px;
      font-size: 13px;
      font-family: 'Consolas', 'Monaco', monospace;
      color: #ef4444;
    }
    .check-solution {
      margin-left: 32px;
      margin-top: 8px;
      padding: 12px;
      background: #dbeafe;
      border-radius: 6px;
      font-size: 14px;
      color: #1e40af;
      border: 1px solid #93c5fd;
    }
    .footer {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      margin-top: 48px;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .meta-info {
      display: flex;
      gap: 24px;
      margin-top: 12px;
      font-size: 14px;
      color: #6b7280;
      align-items: center;
    }
    .refresh-btn {
      margin-left: auto;
      padding: 6px 12px;
      background: #0969da;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .refresh-btn:hover {
      background: #0860ca;
    }
    .refresh-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .refresh-btn.spinning svg {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .cache-indicator {
      font-size: 12px;
      color: #9ca3af;
      margin-left: 8px;
    }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: #6b7280;
    }
    .empty-state h3 {
      color: #1f2937;
      margin-bottom: 8px;
    }
    .loading {
      opacity: 0.6;
      pointer-events: none;
    }
  </style>
  <script>
    // Cache management
    const CACHE_KEY = 'argusai_status_cache';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const RATE_LIMIT_KEY = 'argusai_refresh_rate_limit';
    const RATE_LIMIT_DURATION = 30 * 1000; // 30 seconds
    
    function getCachedStatus() {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;
      
      if (age > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      
      return data;
    }
    
    function setCachedStatus(data) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ...data,
        timestamp: Date.now(),
        cached: true
      }));
    }
    
    function canRefresh() {
      const lastRefresh = localStorage.getItem(RATE_LIMIT_KEY);
      if (!lastRefresh) return true;
      
      const timeSinceRefresh = Date.now() - parseInt(lastRefresh);
      return timeSinceRefresh > RATE_LIMIT_DURATION;
    }
    
    function setRefreshTime() {
      localStorage.setItem(RATE_LIMIT_KEY, Date.now().toString());
    }
    
    function formatDate(date) {
      return new Date(date).toLocaleString(navigator.language || 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    }
    
    async function refreshStatus() {
      const btn = document.getElementById('refresh-btn');
      const icon = btn.querySelector('svg');
      const statusSection = document.getElementById('status-section');
      
      if (!canRefresh()) {
        const lastRefresh = parseInt(localStorage.getItem(RATE_LIMIT_KEY));
        const remainingTime = Math.ceil((RATE_LIMIT_DURATION - (Date.now() - lastRefresh)) / 1000);
        alert('Please wait ' + remainingTime + ' seconds before refreshing again.');
        return;
      }
      
      btn.disabled = true;
      btn.classList.add('spinning');
      
      try {
        const response = await fetch('/status?format=json&refresh=true');
        const data = await response.json();
        
        setCachedStatus(data);
        setRefreshTime();
        
        // Update the display
        window.location.reload();
      } catch (error) {
        alert('Failed to refresh status');
      } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
      }
    }
    
    async function toggleRepo(owner, repo, enabled) {
      const toggle = document.getElementById('toggle-' + owner + '-' + repo);
      const card = toggle.closest('.repo-card');
      card.classList.add('loading');
      
      try {
        const method = enabled ? 'POST' : 'DELETE';
        const response = await fetch('/api/user/repos/' + owner + '/' + repo + '/enable', {
          method: method,
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
        });
        
        if (!response.ok) {
          throw new Error('Failed to update repository');
        }
      } catch (error) {
        alert('Failed to update repository status');
        toggle.checked = !enabled;
      } finally {
        card.classList.remove('loading');
      }
    }
    
    async function logout() {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.reload();
    }
  </script>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1 style="margin: 0;">🔍 ArgusAI</h1>
      <span class="status-badge">${statusIcon} ${statusData.status.toUpperCase()}</span>
    </div>
    <div class="auth-section">
      ${
        user
          ? `
        <div class="user-dropdown">
          <div class="user-info">
            <img src="${user.avatar_url}" alt="${user.login}" class="user-avatar">
            <span>${user.name || user.login}</span>
          </div>
          <div class="user-menu">
            <a href="https://github.com/${user.login}" target="_blank">GitHub Profile</a>
            <a href="#" onclick="logout(); return false;" class="logout-btn">Logout</a>
          </div>
        </div>
      `
          : `
        <a href="/auth/login" class="github-login-btn">
          <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Login with GitHub
        </a>
      `
      }
    </div>
  </div>

  ${
    user && repositories.length > 0
      ? `
  <div class="section">
    <h2>📚 Your Repositories</h2>
    <p style="color: #6b7280; margin-bottom: 16px;">
      Enable ArgusAI on your repositories to get automated code reviews.
    </p>
    <div class="repo-grid">
      ${repositories
        .map(
          (repo) => `
        <div class="repo-card">
          <div class="repo-header">
            <a href="${repo.html_url}" target="_blank" class="repo-name">
              ${repo.name}
            </a>
            <div class="repo-status">
              ${repo.argusai_installed ? '<span style="color: #22c55e; font-size: 12px;">Installed</span>' : ''}
              <label class="toggle-switch">
                <input type="checkbox" 
                  id="toggle-${repo.owner.login}-${repo.name}"
                  ${repo.user_config.enabled ? 'checked' : ''} 
                  onchange="toggleRepo('${repo.owner.login}', '${repo.name}', this.checked)"
                  ${!repo.argusai_installed ? 'disabled title="ArgusAI app must be installed on this repository"' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          ${repo.description ? `<p class="repo-description">${repo.description}</p>` : ''}
          <div class="repo-meta">
            ${repo.language ? `<span>📝 ${repo.language}</span>` : ''}
            <span>⭐ ${repo.stargazers_count}</span>
            ${repo.private ? '<span>🔒 Private</span>' : '<span>🌐 Public</span>'}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : user
        ? `
  <div class="section">
    <div class="empty-state">
      <h3>No Repositories Found</h3>
      <p>You don't have any repositories yet. Create one on GitHub to get started!</p>
    </div>
  </div>
  `
        : ''
  }

  <div class="section" id="status-section">
    <h2>🔧 System Status</h2>
    <div class="meta-info">
      <span>📍 Environment: ${statusData.environment}</span>
      <span>🕐 Last updated: <span id="last-updated">${new Date(statusData.timestamp).toLocaleString()}</span></span>
      <span id="cache-indicator" class="cache-indicator" style="display: none;">(cached)</span>
      <button id="refresh-btn" class="refresh-btn" onclick="refreshStatus()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
    </div>
    <div style="margin-top: 16px;">
      ${statusData.checks
        .map(
          (check: any) => `
        <div class="check-item">
          <span class="check-icon">${checkIcon(check.status)}</span>
          <div style="flex: 1;">
            <div class="check-name">${check.name}</div>
            <div class="check-message">${check.message}</div>
            ${
              check.details && (check.status === 'error' || check.status === 'warning')
                ? `<div class="check-details">${
                    typeof check.details === 'string'
                      ? check.details
                      : JSON.stringify(check.details, null, 2)
                  }</div>`
                : ''
            }
            ${check.solution ? `<div class="check-solution">💡 ${check.solution}</div>` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>

  <div class="footer">
    <p>
      <a href="https://github.com/barde/argusai" target="_blank">📚 View on GitHub</a> | 
      <a href="/status?format=json">🔗 JSON Format</a> | 
      <a href="/health">💚 Health Check</a>
    </p>
    <p>Powered by Cloudflare Workers ⚡</p>
  </div>
  
  <script>
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
      // Update date format to browser locale
      const lastUpdatedEl = document.getElementById('last-updated');
      if (lastUpdatedEl) {
        const timestamp = '${statusData.timestamp}';
        lastUpdatedEl.textContent = formatDate(timestamp);
      }
      
      // Check if this is cached data
      const cached = getCachedStatus();
      if (cached && cached.timestamp) {
        const cacheIndicator = document.getElementById('cache-indicator');
        if (cacheIndicator) {
          cacheIndicator.style.display = 'inline';
        }
      }
      
      // Cache the current status data if not already cached
      if (!cached) {
        setCachedStatus(${JSON.stringify(statusData)});
      }
    });
  </script>
</body>
</html>
  `;

  return html;
}
