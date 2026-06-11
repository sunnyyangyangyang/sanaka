import { describe, expect, it } from 'vitest';
import { transformWebModeArgs } from './webModeApi';

describe('webModeApi', () => {
  it('transforms structured payload styles for web mode rpc', () => {
    expect(transformWebModeArgs('saveSaka', ['/tmp/demo.saka', 'abc'])).toEqual([
      { path: '/tmp/demo.saka', content: 'abc' }
    ]);
    expect(transformWebModeArgs('renamePath', ['/tmp/a', '/tmp/b'])).toEqual([
      { oldPath: '/tmp/a', newPath: '/tmp/b' }
    ]);
    expect(transformWebModeArgs('passthrough-single', [{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(transformWebModeArgs('spread', ['a', 'b'])).toEqual(['a', 'b']);
  });
});
