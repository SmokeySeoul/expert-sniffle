import { MockExplainProvider, MockProposalProvider } from './mock-provider';
import { OpenAIExplainProvider } from './openai-provider';
import { ExplainProvider, ProposalProvider } from './types';

export function createExplainProvider(): ExplainProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    return new OpenAIExplainProvider(apiKey, process.env.OPENAI_MODEL);
  }

  return new MockExplainProvider();
}

export function createProposalProvider(): ProposalProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    return new OpenAIExplainProvider(apiKey, process.env.OPENAI_MODEL);
  }

  return new MockProposalProvider();
}
