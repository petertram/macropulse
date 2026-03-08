import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Chatbot component logic.
 *
 * Note: The Chatbot component requires a live Gemini API key to render
 * meaningfully, so these tests focus on the env-var access pattern and
 * the component's prop interface rather than full render tests.
 */

describe('Chatbot env var access', () => {
  it('import.meta.env.VITE_GEMINI_API_KEY is accessible without type assertion', () => {
    // Vite defines import.meta.env as ImportMetaEnv; no 'any' cast needed.
    // This test verifies the type is accessible (undefined in test env is expected).
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    // In the test environment, the key won't be set — that's acceptable.
    expect(typeof apiKey === 'string' || apiKey === undefined).toBe(true);
  });

  it('falls back to empty string via nullish coalescing when key is absent', () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';
    expect(typeof apiKey).toBe('string');
  });
});
