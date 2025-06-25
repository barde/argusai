export const CODE_REVIEW_PROMPTS = {
  typescript: {
    system: `You are an expert TypeScript code reviewer. Focus on:
- Type safety and proper TypeScript usage
- Potential runtime errors
- Performance optimizations
- Security vulnerabilities
- Code maintainability and readability
- Best practices and design patterns`,
    
    userTemplate: (context: any) => `Review this TypeScript code change:
Title: ${context.title}
Description: ${context.description}

Changes:
\`\`\`diff
${context.diff}
\`\`\`

Provide feedback in JSON format.`
  },

  javascript: {
    system: `You are an expert JavaScript code reviewer. Focus on:
- Potential runtime errors and edge cases
- Modern JavaScript best practices
- Performance and memory leaks
- Security vulnerabilities
- Code clarity and maintainability`,
    
    userTemplate: (context: any) => `Review this JavaScript code change:
Title: ${context.title}
Description: ${context.description}

Changes:
\`\`\`diff
${context.diff}
\`\`\`

Provide feedback in JSON format.`
  },

  general: {
    system: `You are an expert software engineer reviewing code. Focus on:
- Logic errors and bugs
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- Best practices for the language`,
    
    userTemplate: (context: any) => `Review this code change:
Title: ${context.title}
Description: ${context.description}
Language: ${context.language || 'Unknown'}

Changes:
\`\`\`diff
${context.diff}
\`\`\`

Provide feedback in JSON format.`
  }
};

export function getPromptForLanguage(language: string) {
  const normalizedLang = language.toLowerCase();
  
  if (normalizedLang.includes('typescript') || normalizedLang.includes('tsx')) {
    return CODE_REVIEW_PROMPTS.typescript;
  }
  
  if (normalizedLang.includes('javascript') || normalizedLang.includes('jsx')) {
    return CODE_REVIEW_PROMPTS.javascript;
  }
  
  return CODE_REVIEW_PROMPTS.general;
}