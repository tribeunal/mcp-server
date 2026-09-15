import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TOOL_DEFINITIONS } from '../src/core/tools.js';

/**
 * Every advertised parameter must carry its own description — the JSON Schema
 * is what a client actually shows the model, and a bare `{type: 'string'}`
 * leaves the model to guess. Walks nested array items / object properties too
 * (e.g. tribeunal_create_case's `sides[]`).
 */

type SchemaNode = {
  type?: string;
  description?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
};

function collectMissing(node: SchemaNode | undefined, path: string, missing: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (node.properties) {
    for (const [key, prop] of Object.entries(node.properties)) {
      const propPath = `${path}.${key}`;
      if (typeof prop?.description !== 'string' || prop.description.trim() === '') {
        missing.push(propPath);
      }
      if (prop?.type === 'object') collectMissing(prop, propPath, missing);
      if (prop?.type === 'array' && prop.items) collectMissing(prop.items, `${propPath}[]`, missing);
    }
  }
}

test('every inputSchema property (including nested array/object items) has a non-empty description', () => {
  const missing: string[] = [];
  for (const def of TOOL_DEFINITIONS) {
    collectMissing(def.inputSchema as SchemaNode, def.name, missing);
  }
  assert.deepEqual(missing, [], `these properties have no description: ${missing.join(', ')}`);
});

test('every tool has a non-empty top-level description', () => {
  for (const def of TOOL_DEFINITIONS) {
    assert.equal(typeof def.description, 'string');
    assert.ok(def.description.trim().length > 0, `${def.name} must have a non-empty description`);
  }
});
