import { Logger } from '../utils/logger';
import type { Env } from '../types/env';

const logger = new Logger('github-models');

export interface ModelResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class GitHubModelsService {
  private readonly apiUrl = 'https://models.inference.ai.azure.com/chat/completions';
  private readonly model: string;
  
  constructor(private env: Env) {
    this.model = env.GITHUB_MODEL || 'gpt-4o-mini';
  }

  async analyzeCode(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    } = {}
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Calling GitHub Models API', {
        model: this.model,
        messageCount: messages.length,
        temperature: options.temperature
      });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.max_tokens ?? 2000,
          top_p: options.top_p ?? 0.95,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          logger.warn('Rate limited by GitHub Models API', {
            retryAfter,
            status: response.status
          });
          throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
        }

        logger.error('GitHub Models API error', undefined, {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ModelResponse;
      
      const processingTime = Date.now() - startTime;
      logger.info('GitHub Models API response received', {
        model: this.model,
        tokensUsed: data.usage.total_tokens,
        processingTime,
        finishReason: data.choices[0]?.finish_reason
      });

      return data;
    } catch (error) {
      logger.error('Failed to call GitHub Models API', error as Error, {
        model: this.model
      });
      throw error;
    }
  }

  async generateReview(
    diff: string,
    prContext: {
      title: string;
      description: string;
      author: string;
      targetBranch: string;
    }
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt()
      },
      {
        role: 'user',
        content: this.formatUserPrompt(diff, prContext)
      }
    ];

    const response = await this.analyzeCode(messages);
    return response.choices[0].message.content;
  }

  private getSystemPrompt(): string {
    return `You are an expert code reviewer providing constructive feedback on pull requests.

Your role is to:
1. Identify potential bugs, security issues, and performance problems
2. Suggest improvements for code quality and maintainability
3. Ensure best practices are followed
4. Be constructive and educational in your feedback
5. Acknowledge good patterns and well-written code

Guidelines:
- Be specific and provide examples when suggesting changes
- Prioritize issues by severity (🔴 Critical, 🟡 Important, 🟢 Minor)
- Keep feedback concise and actionable
- Don't nitpick on style unless it significantly impacts readability
- Consider the context and purpose of the changes

Format your response as structured JSON with the following schema:
{
  "summary": {
    "verdict": "approve" | "request_changes" | "comment",
    "confidence": 0.0-1.0,
    "mainIssues": ["issue1", "issue2"],
    "positives": ["positive1", "positive2"]
  },
  "comments": [
    {
      "file": "path/to/file",
      "line": number,
      "severity": "critical" | "important" | "minor",
      "category": "bug" | "security" | "performance" | "style" | "improvement",
      "message": "Your feedback here",
      "suggestion": "Optional code suggestion"
    }
  ],
  "overallFeedback": "General feedback about the PR"
}`;
  }

  private formatUserPrompt(
    diff: string,
    context: {
      title: string;
      description: string;
      author: string;
      targetBranch: string;
    }
  ): string {
    return `Please review this pull request:

**Title**: ${context.title}
**Description**: ${context.description || 'No description provided'}
**Author**: ${context.author}
**Target Branch**: ${context.targetBranch}

**Changes**:
\`\`\`diff
${diff}
\`\`\`

Please analyze the code changes and provide a comprehensive review following the guidelines in your system prompt.`;
  }
}