import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings } from '../mobile/src/ai.js';
import { speechConfig } from '../mobile/src/cloud-voice.js';

function settingsFor(value) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {getItem:()=>JSON.stringify(value)};
  try {return loadSettings();} finally {globalThis.localStorage=previous;}
}
test('new installs start with Crabo and her young female voice', () => {
  const s = settingsFor({});
  assert.equal(s.pet,'crab'); assert.equal(speechConfig(s).gender,'female');
});
test('Piggo always uses his young male voice even with a stale female preference', () => {
  const s = settingsFor({pet:'pig',voiceGender:'female',voiceName:'old-female-voice',voicePitch:1.3});
  assert.equal(speechConfig(s).gender,'male');
  assert.equal(speechConfig(s).voice,''); assert.equal(speechConfig(s).pitch,1);
});
test('Crabo always uses her female voice even with a stale male preference', () => {
  assert.equal(speechConfig(settingsFor({pet:'crab',voiceGender:'male'})).gender,'female');
});
test('the removed cat and invalid pets migrate to Crabo without losing API keys', () => {
  for(const pet of ['cat','xiaojing','unknown']) {
    const s = settingsFor({pet,preset:'qianwen',apiKey:'test-key',voiceRate:1.05});
    assert.equal(s.pet,'crab'); assert.equal(s.apiKey,'test-key'); assert.equal(s.voiceRate,1.05);
  }
});
