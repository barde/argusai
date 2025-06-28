import { Context } from 'hono';
import type { Env } from '../types/env';
import { GitHubAPIService } from '../services/github-api';

export async function testAuthHandler(c: Context<{ Bindings: Env }>) {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in production' }, 404);
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test 1: Check configuration
  results.tests.push({
    name: 'Configuration Check',
    passed: true,
    details: {
      hasAppId: !!c.env.GITHUB_APP_ID,
      appId: c.env.GITHUB_APP_ID,
      hasPrivateKey: !!c.env.GITHUB_APP_PRIVATE_KEY,
      privateKeyLength: c.env.GITHUB_APP_PRIVATE_KEY?.length || 0,
      hasToken: !!c.env.GITHUB_TOKEN
    }
  });

  // Test 2: Try to authenticate and fetch PR
  try {
    console.log('=== TEST AUTH: Creating GitHub API client ===');
    const githubAPI = new GitHubAPIService(c.env, 72940228); // Using the installation ID from webhook
    
    console.log('=== TEST AUTH: Fetching PR #23 ===');
    const pr = await githubAPI.getPullRequest('barde', 'argusai', 23);
    
    results.tests.push({
      name: 'GitHub API Authentication',
      passed: true,
      details: {
        pr: {
          title: pr.title,
          author: pr.author,
          state: pr.state
        }
      }
    });
  } catch (error) {
    console.error('=== TEST AUTH ERROR ===', error);
    results.tests.push({
      name: 'GitHub API Authentication',
      passed: false,
      error: {
        message: (error as Error).message,
        status: (error as any).status,
        response: (error as any).response?.data,
        stack: (error as Error).stack
      }
    });
  }

  // Test 3: Try GitHub Models API
  try {
    console.log('=== TEST AUTH: Testing GitHub Models ===');
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "test ok"' }],
        max_tokens: 10
      })
    });

    const data = await response.json();
    
    results.tests.push({
      name: 'GitHub Models API',
      passed: response.ok,
      details: {
        status: response.status,
        response: response.ok ? data.choices?.[0]?.message?.content : data
      }
    });
  } catch (error) {
    results.tests.push({
      name: 'GitHub Models API',
      passed: false,
      error: {
        message: (error as Error).message
      }
    });
  }

  return c.json(results);
}