import { describe, expect, it } from 'vitest';
import { greeting } from './greeting';

describe('greeting', () => {
  it('says bonjour', () => {
    expect(greeting()).toBe('Bonjour');
  });
});
