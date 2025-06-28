import { Context } from 'hono';
import { Octokit } from '@octokit/rest';
import { Env } from '../types/env';
import { StorageServiceFactory } from '../storage';

interface StatusCheck {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
  details?: any;
  solution?: string;
}

interface ModelQuota {
  model: string;
  usage?: {
    requests?: number;
    tokens?: number;
    remaining?: number;
  };
  error?: string;
}

export async function statusHandler(c: Context<{ Bindings: Env }>) {
  const format = c.req.query('format') || 'json';
  const checks: StatusCheck[] = [];
  const modelQuotas: ModelQuota[] = [];

  // Check GitHub App Private Key
  try {
    const hasPrivateKey = !!c.env.GITHUB_APP_PRIVATE_KEY;
    checks.push({
      name: 'GitHub App Private Key',
      status: hasPrivateKey ? 'ok' : 'error',
      message: hasPrivateKey ? 'Configured' : 'Missing',
    });
  } catch (error) {
    checks.push({
      name: 'GitHub App Private Key',
      status: 'error',
      message: 'Error checking secret',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check GitHub Webhook Secret
  try {
    const hasWebhookSecret = !!c.env.GITHUB_WEBHOOK_SECRET;
    checks.push({
      name: 'GitHub Webhook Secret',
      status: hasWebhookSecret ? 'ok' : 'error',
      message: hasWebhookSecret ? 'Configured' : 'Missing',
    });
  } catch (error) {
    checks.push({
      name: 'GitHub Webhook Secret',
      status: 'error',
      message: 'Error checking secret',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check GitHub Token (for Models API)
  try {
    const hasToken = !!c.env.GITHUB_TOKEN;
    checks.push({
      name: 'GitHub Token (Models API)',
      status: hasToken ? 'ok' : 'error',
      message: hasToken ? 'Configured' : 'Missing',
    });

    // Test GitHub API connection if token exists
    if (hasToken) {
      try {
        const octokit = new Octokit({ auth: c.env.GITHUB_TOKEN });
        const { data: user } = await octokit.users.getAuthenticated();
        checks.push({
          name: 'GitHub API Connection',
          status: 'ok',
          message: `Authenticated as ${user.login}`,
          details: {
            user: user.login,
            scopes: user.plan?.name || 'Unknown',
          },
        });
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const is401 = errorMessage.includes('Bad credentials') || error.status === 401;

        checks.push({
          name: 'GitHub API Connection',
          status: 'error',
          message: 'Failed to authenticate',
          details: errorMessage,
          solution: is401
            ? 'Create a GitHub Personal Access Token with "Models" permission (read-only) at https://github.com/settings/tokens/new and add it to .dev.vars as GITHUB_TOKEN=your_token'
            : 'Check your network connection and GitHub API status',
        });
      }
    }
  } catch (error) {
    checks.push({
      name: 'GitHub Token',
      status: 'error',
      message: 'Error checking secret',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check KV Namespaces
  const kvNamespaces = [
    { name: 'CACHE', binding: c.env.CACHE },
    { name: 'RATE_LIMITS', binding: c.env.RATE_LIMITS },
    { name: 'CONFIG', binding: c.env.CONFIG },
  ];

  // Initialize storage service before using it
  const storageFactory = new StorageServiceFactory();
  const storage = storageFactory.create(c.env);

  for (const kv of kvNamespaces) {
    try {
      if (kv.binding) {
        // Try to use storage service generic operations to verify access
        try {
          await storage.list({ prefix: '', limit: 1 });
          checks.push({
            name: `KV Namespace: ${kv.name}`,
            status: 'ok',
            message: 'Connected',
          });
        } catch (kvError) {
          checks.push({
            name: `KV Namespace: ${kv.name}`,
            status: 'error',
            message: 'Connection failed',
            details: kvError instanceof Error ? kvError.message : 'Unknown error',
          });
        }
      } else {
        const isLocal = c.env.ENVIRONMENT === 'development' || !c.env.ENVIRONMENT;
        checks.push({
          name: `KV Namespace: ${kv.name}`,
          status: isLocal ? 'warning' : 'error',
          message: 'Not configured',
          solution: isLocal
            ? `Run: wrangler kv:namespace create "${kv.name}" --preview`
            : 'Configure KV namespace bindings in wrangler.toml',
        });
      }
    } catch (error) {
      checks.push({
        name: `KV Namespace: ${kv.name}`,
        status: 'error',
        message: 'Connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Check GitHub Models API and Quota
  if (c.env.GITHUB_TOKEN) {
    const models = ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview'];

    for (const model of models) {
      try {
        // Try a minimal completion to test the model
        const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1,
          }),
        });

        if (response.ok) {
          // Check rate limit headers for quota info
          const remaining = response.headers.get('x-ratelimit-remaining');
          const limit = response.headers.get('x-ratelimit-limit');

          modelQuotas.push({
            model,
            usage: {
              remaining: remaining ? parseInt(remaining) : undefined,
              requests: limit ? parseInt(limit) : undefined,
            },
          });
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          modelQuotas.push({
            model,
            error: `Rate limited. Retry after: ${retryAfter}s`,
          });
        } else {
          const error = await response.text();
          modelQuotas.push({
            model,
            error: `API error: ${response.status} - ${error}`,
          });
        }
      } catch (error) {
        modelQuotas.push({
          model,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Get recent activity from storage
  let recentActivity: any = {};
  try {
    const errorData = await storage.getDebugData('error');
    const webhookData = await storage.getDebugData('webhook');
    const apiCallData = await storage.getDebugData('api-call');

    if (errorData) recentActivity['debug:error'] = errorData;
    if (webhookData) recentActivity['debug:webhook'] = webhookData;
    if (apiCallData) recentActivity['debug:api-call'] = apiCallData;
  } catch (_error) {
    recentActivity.error = 'Failed to fetch recent activity';
  }

  // Overall status
  const allOk = checks.every((check) => check.status === 'ok' || check.status === 'warning');

  const statusData = {
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
    checks,
    modelQuotas: modelQuotas.length > 0 ? modelQuotas : undefined,
    recentActivity: Object.keys(recentActivity).length > 0 ? recentActivity : undefined,
  };

  // Return HTML if requested
  if (format === 'html') {
    const html = generateStatusHTML(statusData);
    return c.html(html, allOk ? 200 : 503);
  }

  // Default to JSON
  return c.json(statusData, allOk ? 200 : 503);
}

function generateStatusHTML(data: any): string {
  const statusIcon = data.status === 'healthy' ? '✅' : '⚠️';
  const statusColor = data.status === 'healthy' ? '#22c55e' : '#f59e0b';

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
  <title>ArgusAI Status</title>
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
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 600;
      background: ${statusColor}20;
      color: ${statusColor};
      margin-left: 12px;
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
    .model-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }
    .model-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
    }
    .model-name {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .model-error {
      color: #ef4444;
      font-size: 14px;
    }
    .model-usage {
      font-size: 14px;
      color: #6b7280;
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
    }
    .activity-log {
      background: #f9fafb;
      border-radius: 6px;
      padding: 12px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      max-height: 200px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; display: inline-flex; align-items: center;">
      🔍 ArgusAI Status
      <span class="status-badge">${statusIcon} ${data.status.toUpperCase()}</span>
    </h1>
    <div class="meta-info">
      <span>📍 Environment: ${data.environment}</span>
      <span>🕐 Last updated: ${new Date(data.timestamp).toLocaleString()}</span>
    </div>
  </div>

  <div class="section">
    <h2>🔧 System Checks</h2>
    ${data.checks
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

  ${
    data.modelQuotas
      ? `
  <div class="section">
    <h2>🤖 GitHub Models Quota</h2>
    <div class="model-grid">
      ${data.modelQuotas
        .map(
          (model: any) => `
        <div class="model-card">
          <div class="model-name">${model.model}</div>
          ${
            model.error
              ? `<div class="model-error">${model.error}</div>`
              : `<div class="model-usage">
              ${model.usage?.remaining !== undefined ? `Remaining: ${model.usage.remaining}` : ''}
              ${model.usage?.requests !== undefined ? ` / ${model.usage.requests} requests` : ''}
            </div>`
          }
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

  ${
    data.recentActivity && Object.keys(data.recentActivity).length > 0
      ? `
  <div class="section">
    <h2>📊 Recent Activity</h2>
    <div class="activity-log">
      <pre>${JSON.stringify(data.recentActivity, null, 2)}</pre>
    </div>
  </div>
  `
      : ''
  }

  <div class="footer">
    <p>
      <a href="https://github.com/barde/argusai" target="_blank">📚 View on GitHub</a> | 
      <a href="/status?format=json">🔗 JSON Format</a> | 
      <a href="/health">💚 Health Check</a>
    </p>
    <p>Powered by Cloudflare Workers ⚡</p>
  </div>
</body>
</html>
  `;

  return html;
}
