#!/usr/bin/env node

import crypto from 'crypto';

// Configuration
const WORKER_URL = process.env.WORKER_URL || 'https://argus.vogel.yoga';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';
const REPO_NAME = process.env.REPO_NAME || 'test-org/test-repo';

// Test payload
const payload = {
  action: 'opened',
  pull_request: {
    number: Math.floor(Math.random() * 1000),
    title: 'Test PR: Add new feature',
    body: 'This PR adds a new feature with potential issues for testing ArgusAI',
    draft: false,
    state: 'open',
    user: {
      login: 'testuser',
      type: 'User'
    },
    head: {
      ref: 'feature/test-' + Date.now(),
      sha: crypto.randomBytes(20).toString('hex')
    },
    base: {
      ref: 'main'
    },
    additions: 150,
    deletions: 50,
    changed_files: 5,
    diff_url: 'https://github.com/' + REPO_NAME + '/pull/1.diff',
    patch_url: 'https://github.com/' + REPO_NAME + '/pull/1.patch'
  },
  repository: {
    full_name: REPO_NAME,
    owner: {
      login: REPO_NAME.split('/')[0]
    },
    name: REPO_NAME.split('/')[1]
  },
  installation: {
    id: 12345
  }
};

// Generate signature
const payloadString = JSON.stringify(payload, null, 2);
const signature = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payloadString)
  .digest('hex');

// Send webhook
async function testWebhook() {
  console.log('🚀 Testing ArgusAI webhook...');
  console.log('📍 URL:', WORKER_URL + '/webhooks/github');
  console.log('📦 Repository:', REPO_NAME);
  console.log('🔢 PR Number:', payload.pull_request.number);
  console.log('');

  try {
    const response = await fetch(WORKER_URL + '/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-' + Date.now(),
        'X-Hub-Signature-256': signature
      },
      body: payloadString
    });

    const responseData = await response.json();
    
    console.log('📨 Response Status:', response.status, response.statusText);
    console.log('📄 Response:', JSON.stringify(responseData, null, 2));
    
    if (response.ok) {
      console.log('\n✅ Webhook accepted! Check logs for processing status:');
      console.log('   wrangler tail --env development');
    } else {
      console.log('\n❌ Webhook failed!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Check worker health first
async function checkHealth() {
  try {
    const response = await fetch(WORKER_URL + '/health');
    const data = await response.json();
    console.log('🏥 Health Check:', data);
    return response.ok;
  } catch (error) {
    console.error('❌ Worker not responding:', error.message);
    return false;
  }
}

// Main
async function main() {
  console.log('🤖 ArgusAI Webhook Tester\n');
  
  const healthy = await checkHealth();
  if (!healthy) {
    console.log('\n⚠️  Worker might not be running. Deploy with:');
    console.log('   wrangler deploy --env development');
    process.exit(1);
  }
  
  console.log('');
  await testWebhook();
}

main().catch(console.error);