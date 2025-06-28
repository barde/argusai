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

export interface SplitReviewResult {
  mainReview: string;
  continuationComments: string[];
}

export class ReviewFormatter {
  // GitHub's maximum comment size limit
  static readonly GITHUB_COMMENT_LIMIT = 65536;

  // Reserve space for continuation notice
  static readonly CONTINUATION_BUFFER = 200;

  // Maximum number of continuation comments
  static readonly MAX_CONTINUATION_COMMENTS = 5;

  static parseAIResponse(responseText: string): AIReviewResponse {
    // Check if this is markdown from chunking mode
    if (responseText.startsWith('## 🔍 PR Review Summary')) {
      return this.parseMarkdownResponse(responseText);
    }

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
        responsePreview: responseText.substring(0, 200),
      });

      // Return a fallback response
      return {
        summary: {
          verdict: 'comment',
          confidence: 0.5,
          mainIssues: ['Failed to parse AI response'],
          positives: [],
        },
        comments: [],
        overallFeedback: 'An error occurred while processing the review.',
      };
    }
  }

  static parseMarkdownResponse(markdownText: string): AIReviewResponse {
    // Extract metadata from the summary header
    const titleMatch = markdownText.match(/\*\*Title:\*\* (.+)/);
    const authorMatch = markdownText.match(/\*\*Author:\*\* (.+)/);
    const filesMatch = markdownText.match(/\*\*Files:\*\* (\d+) files changed/);
    const skippedMatch = markdownText.match(/\*\*Skipped:\*\* (\d+) files/);

    const filesCount = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;
    const skippedCount = skippedMatch?.[1] ? parseInt(skippedMatch[1], 10) : 0;
    const reviewedCount = filesCount - skippedCount;

    // Extract file reviews
    const fileReviews = markdownText.split(/### 📄 /).slice(1);

    // Analyze the reviews to determine verdict
    let approveCount = 0;
    let requestChangesCount = 0;
    let criticalIssues = 0;
    let securityIssues = 0;
    let bugs = 0;
    const mainIssues: string[] = [];
    const positives: string[] = [];
    const fileResults: Array<{ filename: string; verdict: string; issues: number; review: any }> =
      [];
    const allComments: ReviewComment[] = [];

    fileReviews.forEach((review) => {
      const fileName = review.split('\n')[0]?.trim() || '';
      let fileIssues = 0;

      // Skip files that were too large
      if (review.includes('⚠️ File too large')) {
        fileResults.push({ filename: fileName, verdict: 'skipped', issues: 0, review: null });
        return;
      }

      // Try to parse JSON from the review
      try {
        const jsonMatch = review.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.summary) {
            const verdict = parsed.summary.verdict;
            if (verdict === 'approve') approveCount++;
            else if (verdict === 'request_changes') requestChangesCount++;

            if (parsed.comments) {
              parsed.comments.forEach((comment: any) => {
                if (comment.severity === 'critical') criticalIssues++;
                if (comment.category === 'security') securityIssues++;
                if (comment.category === 'bug') bugs++;
                fileIssues++;
              });
            }

            fileResults.push({ filename: fileName, verdict, issues: fileIssues, review: parsed });

            // Extract positives and issues
            if (parsed.summary.positives) {
              parsed.summary.positives.forEach((positive: string) => {
                if (!positives.includes(positive)) positives.push(positive);
              });
            }
            if (parsed.summary.mainIssues) {
              parsed.summary.mainIssues.forEach((issue: string) => {
                if (!mainIssues.includes(issue)) mainIssues.push(issue);
              });
            }

            // Extract comments for line-by-line suggestions
            if (parsed.comments && Array.isArray(parsed.comments)) {
              parsed.comments.forEach((comment: any) => {
                allComments.push({
                  path: fileName,
                  line: comment.line || 1,
                  side: 'RIGHT' as const,
                  body: this.formatCommentBody(
                    comment,
                    { critical: '🔴', important: '🟡', minor: '🟢' },
                    { bug: '🐛', security: '🔒', performance: '⚡', style: '✨', improvement: '💡' }
                  ),
                  severity:
                    comment.severity === 'critical'
                      ? 'error'
                      : comment.severity === 'important'
                        ? 'warning'
                        : 'info',
                  category: comment.category,
                });
              });
            }
          }
        }
      } catch (_e) {
        // If we can't parse JSON, analyze text
        if (
          review.toLowerCase().includes('critical') ||
          review.toLowerCase().includes('security')
        ) {
          requestChangesCount++;
          fileResults.push({
            filename: fileName,
            verdict: 'request_changes',
            issues: 1,
            review: null,
          });
        } else {
          fileResults.push({ filename: fileName, verdict: 'comment', issues: 0, review: null });
        }
      }
    });

    // Determine overall verdict
    let verdict: 'approve' | 'request_changes' | 'comment' = 'comment';
    let confidence = 0.7;

    if (requestChangesCount > 0 || criticalIssues > 0 || securityIssues > 0) {
      verdict = 'request_changes';
      confidence = 0.9;
      if (criticalIssues > 0) mainIssues.unshift(`🔴 ${criticalIssues} critical issues found`);
      if (securityIssues > 0)
        mainIssues.unshift(`🔒 ${securityIssues} security vulnerabilities detected`);
      if (bugs > 0) mainIssues.unshift(`🐛 ${bugs} potential bugs identified`);
    } else if (approveCount > requestChangesCount && approveCount > filesCount / 2) {
      verdict = 'approve';
      confidence = 0.8;
    }

    // Build formatted feedback
    const formattedFeedback = this.formatChunkedReview({
      title: titleMatch?.[1] || 'Pull Request',
      author: authorMatch?.[1] || 'Unknown',
      filesCount,
      reviewedCount,
      skippedCount,
      fileResults,
      verdict,
      criticalIssues,
      securityIssues,
      bugs,
      approveCount,
      requestChangesCount,
    });

    return {
      summary: {
        verdict,
        confidence,
        mainIssues: mainIssues.length > 0 ? mainIssues : ['Review completed'],
        positives:
          positives.length > 0 ? positives : [`Successfully reviewed ${reviewedCount} files`],
      },
      comments: allComments.map((comment) => ({
        file: comment.path,
        line: comment.line,
        severity:
          comment.severity === 'error'
            ? ('critical' as const)
            : comment.severity === 'warning'
              ? ('important' as const)
              : ('minor' as const),
        category: comment.category,
        message: comment.body,
        suggestion: undefined,
      })),
      overallFeedback: formattedFeedback,
    };
  }

  static formatChunkedReview(data: {
    title: string;
    author: string;
    filesCount: number;
    reviewedCount: number;
    skippedCount: number;
    fileResults: Array<{ filename: string; verdict: string; issues: number; review: any }>;
    verdict: string;
    criticalIssues: number;
    securityIssues: number;
    bugs: number;
    approveCount: number;
    requestChangesCount: number;
  }): string {
    const verdictEmoji = {
      approve: '✅',
      request_changes: '❌',
      comment: '💬',
    };

    // Removed unused verdictColor

    const verdictText = {
      approve: 'APPROVED',
      request_changes: 'CHANGES REQUESTED',
      comment: 'COMMENTED',
    };

    let markdown = `## ${verdictEmoji[data.verdict as keyof typeof verdictEmoji]} Code Review Summary\n\n`;

    // Verdict box
    markdown += `> ### ${verdictEmoji[data.verdict as keyof typeof verdictEmoji]} **${verdictText[data.verdict as keyof typeof verdictText]}**\n`;
    markdown += `> \n`;
    markdown += `> **${data.title}** by @${data.author}\n\n`;

    // Stats boxes
    markdown += `<table>\n<tr>\n`;
    markdown += `<td align="center">\n\n**📁 Files**<br/>${data.filesCount}\n\n</td>\n`;
    markdown += `<td align="center">\n\n**✅ Reviewed**<br/>${data.reviewedCount}\n\n</td>\n`;
    if (data.skippedCount > 0) {
      markdown += `<td align="center">\n\n**⚠️ Skipped**<br/>${data.skippedCount}\n\n</td>\n`;
    }
    if (data.criticalIssues > 0) {
      markdown += `<td align="center">\n\n**🔴 Critical**<br/>${data.criticalIssues}\n\n</td>\n`;
    }
    if (data.securityIssues > 0) {
      markdown += `<td align="center">\n\n**🔒 Security**<br/>${data.securityIssues}\n\n</td>\n`;
    }
    if (data.bugs > 0) {
      markdown += `<td align="center">\n\n**🐛 Bugs**<br/>${data.bugs}\n\n</td>\n`;
    }
    markdown += `</tr>\n</table>\n\n`;

    // File results summary
    if (data.fileResults.length > 0) {
      markdown += `### 📄 File Review Results\n\n`;
      markdown += `<details>\n<summary>Click to expand file-by-file results</summary>\n\n`;
      markdown += `| File | Status | Issues |\n`;
      markdown += `|------|--------|--------|\n`;

      data.fileResults.forEach((file) => {
        const statusEmoji =
          file.verdict === 'approve'
            ? '✅'
            : file.verdict === 'request_changes'
              ? '🔴'
              : file.verdict === 'skipped'
                ? '⚠️'
                : '💬';
        const issuesText =
          file.verdict === 'skipped' ? 'N/A' : file.issues === 0 ? '✓' : `${file.issues}`;
        markdown += `| ${file.filename} | ${statusEmoji} | ${issuesText} |\n`;
      });

      markdown += `\n</details>\n\n`;
    }

    // Summary stats
    if (data.approveCount > 0 || data.requestChangesCount > 0) {
      markdown += `### 📊 Review Statistics\n\n`;
      const total = data.approveCount + data.requestChangesCount;
      const approvePercent = Math.round((data.approveCount / total) * 100);
      const changesPercent = Math.round((data.requestChangesCount / total) * 100);

      markdown += `🟢 **Approved files:** ${data.approveCount} (${approvePercent}%)\n`;
      markdown += `🔴 **Changes requested:** ${data.requestChangesCount} (${changesPercent}%)\n\n`;
    }

    // Add action items based on verdict
    if (data.verdict === 'request_changes') {
      markdown += `### 🔧 Action Required\n\n`;
      markdown += `> **This PR requires changes before it can be merged.**\n`;
      markdown += `> \n`;
      if (data.criticalIssues > 0) {
        markdown += `> 🔴 Fix ${data.criticalIssues} critical issue${data.criticalIssues > 1 ? 's' : ''}\n`;
      }
      if (data.securityIssues > 0) {
        markdown += `> 🔒 Address ${data.securityIssues} security vulnerabilit${data.securityIssues > 1 ? 'ies' : 'y'}\n`;
      }
      if (data.bugs > 0) {
        markdown += `> 🐛 Resolve ${data.bugs} potential bug${data.bugs > 1 ? 's' : ''}\n`;
      }
      markdown += `\n`;
    } else if (data.verdict === 'approve') {
      markdown += `### ✅ Ready to Merge\n\n`;
      markdown += `> **This PR looks good and is ready to be merged!**\n`;
      markdown += `> \n`;
      markdown += `> All reviewed files passed the quality checks.\n\n`;
    } else {
      markdown += `### 💬 Review Notes\n\n`;
      markdown += `> **This PR has been reviewed with comments.**\n`;
      markdown += `> \n`;
      markdown += `> Please review the feedback and make improvements where appropriate.\n\n`;
    }

    // Add detailed file reviews section
    markdown += `### 📝 Detailed Review\n\n`;

    // Group files by verdict for better organization
    const criticalFiles = data.fileResults.filter(
      (f) => f.verdict === 'request_changes' && f.review
    );
    const warningFiles = data.fileResults.filter((f) => f.verdict === 'comment' && f.review);
    const approvedFiles = data.fileResults.filter((f) => f.verdict === 'approve' && f.review);

    if (criticalFiles.length > 0) {
      markdown += `#### ❌ Files Requiring Changes\n\n`;
      criticalFiles.forEach((file) => {
        markdown += this.formatFileReview(file);
      });
    }

    if (warningFiles.length > 0) {
      markdown += `#### ⚠️ Files with Suggestions\n\n`;
      warningFiles.forEach((file) => {
        markdown += this.formatFileReview(file);
      });
    }

    if (approvedFiles.length > 0) {
      markdown += `<details>\n<summary>✅ Approved Files (${approvedFiles.length})</summary>\n\n`;
      approvedFiles.forEach((file) => {
        markdown += this.formatFileReview(file);
      });
      markdown += `</details>\n\n`;
    }

    return markdown;
  }

  private static formatFileReview(file: {
    filename: string;
    verdict: string;
    issues: number;
    review: any;
  }): string {
    let markdown = `<details>\n<summary><b>${file.filename}</b>`;

    if (file.issues > 0) {
      markdown += ` - ${file.issues} issue${file.issues > 1 ? 's' : ''}`;
    }

    markdown += `</summary>\n\n`;

    if (!file.review) {
      markdown += `> ⚠️ Review data not available\n\n`;
      markdown += `</details>\n\n`;
      return markdown;
    }

    // Add overall feedback for the file
    if (file.review.overallFeedback) {
      markdown += `**Overall Assessment:**\n${file.review.overallFeedback}\n\n`;
    }

    // Add summary points
    if (file.review.summary) {
      if (file.review.summary.positives && file.review.summary.positives.length > 0) {
        markdown += `**✅ What looks good:**\n`;
        file.review.summary.positives.forEach((positive: string) => {
          markdown += `- ${positive}\n`;
        });
        markdown += `\n`;
      }

      if (file.review.summary.mainIssues && file.review.summary.mainIssues.length > 0) {
        markdown += `**🔍 Issues found:**\n`;
        file.review.summary.mainIssues.forEach((issue: string) => {
          markdown += `- ${issue}\n`;
        });
        markdown += `\n`;
      }
    }

    // Add specific line comments
    if (file.review.comments && file.review.comments.length > 0) {
      markdown += `**📍 Line-by-line feedback:**\n\n`;

      const severityEmoji: Record<string, string> = {
        critical: '🔴',
        important: '🟡',
        minor: '🟢',
      };

      const categoryEmoji: Record<string, string> = {
        bug: '🐛',
        security: '🔒',
        performance: '⚡',
        style: '✨',
        improvement: '💡',
      };

      file.review.comments.forEach((comment: any) => {
        markdown += `**Line ${comment.line}:** ${severityEmoji[comment.severity] || '💭'} ${categoryEmoji[comment.category] || ''} ${comment.message}\n`;

        if (comment.suggestion) {
          markdown += `\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\`\n`;
        }

        markdown += `\n`;
      });
    }

    markdown += `</details>\n\n`;
    return markdown;
  }

  static formatReview(
    aiResponse: AIReviewResponse,
    metadata: {
      model: string;
      tokensUsed: number;
      processingTime: number;
      reviewIteration?: number;
      previousReviewId?: number;
      chunked?: boolean;
      filesAnalyzed?: number;
      filesSkipped?: number;
      diffSize?: number;
    }
  ): Review {
    const severityEmoji = {
      critical: '🔴',
      important: '🟡',
      minor: '🟢',
    };

    const categoryEmoji = {
      bug: '🐛',
      security: '🔒',
      performance: '⚡',
      style: '✨',
      improvement: '💡',
    };

    // Format comments
    const comments: ReviewComment[] = aiResponse.comments.map((comment) => ({
      path: comment.file,
      line: comment.line,
      side: 'RIGHT' as const,
      body: this.formatCommentBody(comment, severityEmoji, categoryEmoji),
      severity:
        comment.severity === 'critical'
          ? 'error'
          : comment.severity === 'important'
            ? 'warning'
            : 'info',
      category: comment.category,
    }));

    // Format summary
    const summary: ReviewSummary = {
      verdict: aiResponse.summary.verdict,
      confidence: aiResponse.summary.confidence,
      mainIssues: aiResponse.summary.mainIssues,
      positives: aiResponse.summary.positives,
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
        reviewVersion: '1.0.0',
        reviewIteration: metadata.reviewIteration,
        previousReviewId: metadata.previousReviewId,
        features:
          metadata.chunked !== undefined
            ? {
                chunked: metadata.chunked,
                filesAnalyzed: metadata.filesAnalyzed || 0,
                filesSkipped: metadata.filesSkipped || 0,
              }
            : undefined,
        timestamp: Date.now(),
        diffSize: metadata.diffSize,
      },
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
    metadata: {
      model: string;
      tokensUsed: number;
      processingTime: number;
      reviewIteration?: number;
      previousReviewId?: number;
      chunked?: boolean;
      filesAnalyzed?: number;
      filesSkipped?: number;
      diffSize?: number;
    }
  ): string {
    const { summary } = aiResponse;
    const verdictEmoji = {
      approve: '✅',
      request_changes: '❌',
      comment: '💬',
    };

    // Check if this is a chunking mode response (formatted feedback)
    if (
      aiResponse.overallFeedback &&
      (aiResponse.overallFeedback.startsWith('## ✅') ||
        aiResponse.overallFeedback.startsWith('## ❌') ||
        aiResponse.overallFeedback.startsWith('## 💬'))
    ) {
      // For chunking mode, use the formatted markdown with header and footer
      let body = `# 🤖 ArgusAI Code Review\n\n`;
      body += aiResponse.overallFeedback;
      body += `\n---\n`;
      body += `<sub>🤖 Powered by ArgusAI • Model: ${metadata.model} • `;
      body += `⚡ Processing: ${Math.round(metadata.processingTime / 1000)}s • `;
      body += `🎯 Confidence: ${Math.round(summary.confidence * 100)}%</sub>`;
      return body;
    }

    // Standard JSON-based review format
    let body = `# 🤖 ArgusAI Code Review\n\n`;
    body += `## ${verdictEmoji[summary.verdict]} Review Summary\n\n`;
    body += `**Verdict**: ${summary.verdict.replace('_', ' ').toUpperCase()}\n`;
    body += `**Confidence**: ${Math.round(summary.confidence * 100)}%\n\n`;

    if (summary.positives.length > 0) {
      body += `### ✨ What looks good:\n`;
      summary.positives.forEach((positive) => {
        body += `- ${positive}\n`;
      });
      body += '\n';
    }

    if (summary.mainIssues.length > 0) {
      body += `### 🔍 Main concerns:\n`;
      summary.mainIssues.forEach((issue) => {
        body += `- ${issue}\n`;
      });
      body += '\n';
    }

    if (
      aiResponse.overallFeedback &&
      !aiResponse.overallFeedback.startsWith('## 🔍 PR Review Summary')
    ) {
      body += `### 💭 Overall Feedback\n${aiResponse.overallFeedback}\n\n`;
    }

    // Add metadata footer
    body += `---\n`;
    body += `<sub>🤖 Reviewed by ArgusAI using ${metadata.model} • `;
    body += `⚡ ${metadata.processingTime}ms • `;
    body += `🎯 ${metadata.tokensUsed} tokens`;

    if (metadata.reviewIteration && metadata.reviewIteration > 1) {
      body += ` • 🔄 Review #${metadata.reviewIteration}`;
    }

    if (metadata.chunked) {
      body += ` • 📊 ${metadata.filesAnalyzed || 0} files analyzed`;
      if ((metadata.filesSkipped || 0) > 0) {
        body += `, ${metadata.filesSkipped} skipped`;
      }
    }

    body += `</sub>`;

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

  /**
   * Validates if a comment body exceeds GitHub's size limit
   */
  static isCommentTooLarge(body: string): boolean {
    return body.length > this.GITHUB_COMMENT_LIMIT;
  }

  /**
   * Splits a large review into main review and continuation comments
   */
  static splitLargeReview(reviewBody: string): SplitReviewResult {
    if (!this.isCommentTooLarge(reviewBody)) {
      return {
        mainReview: reviewBody,
        continuationComments: [],
      };
    }

    const maxLength = this.GITHUB_COMMENT_LIMIT - this.CONTINUATION_BUFFER;
    const continuationComments: string[] = [];

    // Try to split at natural boundaries (paragraphs, sections)
    const sections = reviewBody.split(/\n\n+/);
    let currentContent = '';
    let isMainReview = true;

    for (const section of sections) {
      const sectionWithSeparator = section + '\n\n';

      // Check if adding this section would exceed the limit
      if ((currentContent + sectionWithSeparator).length > maxLength) {
        // Save current content
        if (isMainReview) {
          // Add continuation notice to main review
          currentContent +=
            "\n\n---\n\n📋 **Note**: This review exceeds GitHub's comment size limit. See continuation in follow-up comments below.";
          isMainReview = false;
        }

        if (continuationComments.length >= this.MAX_CONTINUATION_COMMENTS) {
          // We've hit the maximum number of continuation comments
          currentContent +=
            '\n\n⚠️ **Review truncated**: Additional content omitted due to size constraints.';
          break;
        }

        continuationComments.push(currentContent);
        currentContent = this.createContinuationHeader(continuationComments.length + 1);
      }

      currentContent += sectionWithSeparator;
    }

    // Handle remaining content
    if (currentContent.trim()) {
      if (isMainReview) {
        // The entire review fits in the main comment
        return {
          mainReview: currentContent.trim(),
          continuationComments: [],
        };
      } else {
        continuationComments.push(currentContent.trim());
      }
    }

    // Extract the main review from the first continuation comment if needed
    const mainReview = continuationComments.shift() || '';

    return {
      mainReview,
      continuationComments,
    };
  }

  /**
   * Creates a header for continuation comments
   */
  private static createContinuationHeader(partNumber: number): string {
    return (
      `## 📋 Review Continuation (Part ${partNumber})\n\n` +
      `*This is a continuation of the code review from the previous comment.*\n\n`
    );
  }

  /**
   * Truncates a comment to fit within GitHub's size limit
   */
  static truncateComment(body: string, preserveLines: number = 100): string {
    if (!this.isCommentTooLarge(body)) {
      return body;
    }

    const lines = body.split('\n');
    const truncationNotice =
      '\n\n---\n\n⚠️ **Comment truncated**: This review was too large to display in full. ' +
      'The most important findings are shown above.';

    // Calculate how many characters we can use
    const maxLength =
      this.GITHUB_COMMENT_LIMIT - truncationNotice.length - this.CONTINUATION_BUFFER;

    // Try to preserve the most important parts (header and first N lines)
    let truncatedContent = '';
    let lineCount = 0;

    for (const line of lines) {
      if ((truncatedContent + line + '\n').length > maxLength) {
        break;
      }
      truncatedContent += line + '\n';
      lineCount++;

      if (lineCount >= preserveLines) {
        // We've preserved enough lines, now try to find a good cutoff point
        const remainingSpace = maxLength - truncatedContent.length;
        if (remainingSpace < 1000) {
          break;
        }
      }
    }

    return truncatedContent.trim() + truncationNotice;
  }
}
