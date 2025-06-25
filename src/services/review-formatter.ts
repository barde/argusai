import { Logger } from '../utils/logger';
import type { Review, ReviewComment, ReviewSummary } from '../types/github';

const logger = new Logger('review-formatter');

interface AIReviewResponse {
  summary: {
    verdict: 'approve' | 'request_changes' | 'comment';
    confidence: number;
    mainIssues: string[];
    positives: string[];
  };
  comments: Array<{
    file: string;
    line: number;
    severity: 'critical' | 'important' | 'minor';
    category: 'bug' | 'security' | 'performance' | 'style' | 'improvement';
    message: string;
    suggestion?: string;
  }>;
  overallFeedback: string;
}

export class ReviewFormatter {
  static parseAIResponse(responseText: string): AIReviewResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.summary || !parsed.comments) {
        throw new Error('Invalid response structure');
      }

      return parsed as AIReviewResponse;
    } catch (error) {
      logger.error('Failed to parse AI response', error as Error, {
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200)
      });
      
      // Return a fallback response
      return {
        summary: {
          verdict: 'comment',
          confidence: 0.5,
          mainIssues: ['Failed to parse AI response'],
          positives: []
        },
        comments: [],
        overallFeedback: 'An error occurred while processing the review.'
      };
    }
  }

  static formatReview(aiResponse: AIReviewResponse, metadata: {
    model: string;
    tokensUsed: number;
    processingTime: number;
  }): Review {
    const severityEmoji = {
      critical: '🔴',
      important: '🟡',
      minor: '🟢'
    };

    const categoryEmoji = {
      bug: '🐛',
      security: '🔒',
      performance: '⚡',
      style: '✨',
      improvement: '💡'
    };

    // Format comments
    const comments: ReviewComment[] = aiResponse.comments.map(comment => ({
      path: comment.file,
      line: comment.line,
      side: 'RIGHT' as const,
      body: this.formatCommentBody(comment, severityEmoji, categoryEmoji),
      severity: comment.severity === 'critical' ? 'error' : 
               comment.severity === 'important' ? 'warning' : 'info',
      category: comment.category
    }));

    // Format summary
    const summary: ReviewSummary = {
      verdict: aiResponse.summary.verdict,
      confidence: aiResponse.summary.confidence,
      mainIssues: aiResponse.summary.mainIssues,
      positives: aiResponse.summary.positives
    };

    // Format overall review body
    const body = this.formatReviewBody(aiResponse, metadata);

    return {
      body,
      comments,
      summary,
      metadata: {
        model: metadata.model,
        tokensUsed: metadata.tokensUsed,
        processingTime: metadata.processingTime,
        reviewVersion: '1.0.0'
      }
    };
  }

  private static formatCommentBody(
    comment: AIReviewResponse['comments'][0],
    severityEmoji: Record<string, string>,
    categoryEmoji: Record<string, string>
  ): string {
    let body = `${severityEmoji[comment.severity]} ${categoryEmoji[comment.category]} **${comment.severity.toUpperCase()}**: ${comment.message}`;
    
    if (comment.suggestion) {
      body += `\n\n**Suggestion:**\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
    }
    
    return body;
  }

  private static formatReviewBody(
    aiResponse: AIReviewResponse,
    metadata: { model: string; tokensUsed: number; processingTime: number }
  ): string {
    const { summary } = aiResponse;
    const verdictEmoji = {
      approve: '✅',
      request_changes: '❌',
      comment: '💬'
    };

    let body = `# 🤖 ArgusAI Code Review\n\n`;
    body += `## ${verdictEmoji[summary.verdict]} Review Summary\n\n`;
    body += `**Verdict**: ${summary.verdict.replace('_', ' ').toUpperCase()}\n`;
    body += `**Confidence**: ${Math.round(summary.confidence * 100)}%\n\n`;

    if (summary.positives.length > 0) {
      body += `### ✨ What looks good:\n`;
      summary.positives.forEach(positive => {
        body += `- ${positive}\n`;
      });
      body += '\n';
    }

    if (summary.mainIssues.length > 0) {
      body += `### 🔍 Main concerns:\n`;
      summary.mainIssues.forEach(issue => {
        body += `- ${issue}\n`;
      });
      body += '\n';
    }

    if (aiResponse.overallFeedback) {
      body += `### 💭 Overall Feedback\n${aiResponse.overallFeedback}\n\n`;
    }

    // Add metadata footer
    body += `---\n`;
    body += `<sub>🤖 Reviewed by ArgusAI using ${metadata.model} • `;
    body += `⚡ ${metadata.processingTime}ms • `;
    body += `🎯 ${metadata.tokensUsed} tokens</sub>`;

    return body;
  }

  static validateReview(review: Review): boolean {
    try {
      // Check required fields
      if (!review.body || !review.summary || !review.metadata) {
        return false;
      }

      // Validate summary
      if (!['approve', 'request_changes', 'comment'].includes(review.summary.verdict)) {
        return false;
      }

      // Validate comments
      for (const comment of review.comments) {
        if (!comment.path || !comment.line || !comment.body) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Review validation failed', error as Error);
      return false;
    }
  }
}