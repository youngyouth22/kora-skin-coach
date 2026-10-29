import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRedFlags,
  isPrescriptionOrRegulated,
  isPregnancySafe,
  MEDICAL_DISCLAIMER,
} from '../src/mastra/domain/safety.ts';
import { RedFlagGuardProcessor } from '../src/mastra/processors/red-flag.processor.ts';

test('detectRedFlags returns false for standard skincare queries', () => {
  const q1 = 'What should I use for mild oily skin and pores?';
  const res1 = detectRedFlags(q1);
  assert.strictEqual(res1.hasRedFlag, false);
  assert.strictEqual(res1.matchedFlags.length, 0);

  const q2 = 'Can I use hyaluronic acid with niacinamide in the morning?';
  const res2 = detectRedFlags(q2);
  assert.strictEqual(res2.hasRedFlag, false);
});

test('detectRedFlags flags changing or irregular moles immediately', () => {
  const query = 'I noticed this dark mole on my cheek is growing and changing shape.';
  const res = detectRedFlags(query);
  assert.strictEqual(res.hasRedFlag, true);
  assert.ok(res.matchedFlags.includes('changing_mole'));
  assert.ok(res.referralMessage.includes('evaluation by a dermatologist'));
  assert.ok(res.referralMessage.includes(MEDICAL_DISCLAIMER));
});

test('detectRedFlags flags facial swelling, severe pain, and bleeding lesions', () => {
  const query1 = 'I woke up with sudden severe swelling of my lips and face.';
  const res1 = detectRedFlags(query1);
  assert.strictEqual(res1.hasRedFlag, true);
  assert.ok(res1.matchedFlags.includes('face_or_lip_swelling'));

  const query2 = 'The bump on my forehead is bleeding and has pus draining.';
  const res2 = detectRedFlags(query2);
  assert.strictEqual(res2.hasRedFlag, true);
  assert.ok(res2.matchedFlags.includes('bleeding_or_pus'));

  const query3 = 'I have unbearable pain on my face after this peel.';
  const res3 = detectRedFlags(query3);
  assert.strictEqual(res3.hasRedFlag, true);
  assert.ok(res3.matchedFlags.includes('severe_pain'));
});

test('isPrescriptionOrRegulated identifies Rx-only actives', () => {
  assert.strictEqual(isPrescriptionOrRegulated('tretinoin 0.05%'), true);
  assert.strictEqual(isPrescriptionOrRegulated('Adapalene gel'), true);
  assert.strictEqual(isPrescriptionOrRegulated('Hydroquinone 4%'), true);
  assert.strictEqual(isPrescriptionOrRegulated('Clindamycin solution'), true);

  // OTC non-prescription actives should be allowed
  assert.strictEqual(isPrescriptionOrRegulated('Niacinamide'), false);
  assert.strictEqual(isPrescriptionOrRegulated('Hyaluronic Acid'), false);
  assert.strictEqual(isPrescriptionOrRegulated('Azelaic Acid 10%'), false);
  assert.strictEqual(isPrescriptionOrRegulated('Centella Asiatica'), false);
});

test('isPregnancySafe only allows generally_ok ingredients', () => {
  assert.strictEqual(isPregnancySafe('generally_ok'), true);
  assert.strictEqual(isPregnancySafe('GENERALLY_OK'), true);
  assert.strictEqual(isPregnancySafe('avoid'), false);
  assert.strictEqual(isPregnancySafe('caution'), false);
  assert.strictEqual(isPregnancySafe(undefined), false);
});

test('RedFlagGuardProcessor injects safety override and triggers abort when red flag is present in user message', () => {
  const processor = new RedFlagGuardProcessor();
  const state: Record<string, unknown> = {};
  let abortReason: string | undefined;

  const inputWithFlag = {
    messages: [
      { id: '1', role: 'user', content: 'My mole is bleeding and has an irregular border.' },
    ] as any,
    systemMessages: [
      { role: 'system', content: 'You are a skincare coach.' } as any,
    ],
    state,
    messageList: {} as any,
    retryCount: 0,
    abort: ((reason: string) => { abortReason = reason; }) as any,
  };

  const result = processor.processInput(inputWithFlag);

  assert.strictEqual(state.redFlagDetected, true);
  assert.ok(state.referralMessage);
  assert.ok(abortReason?.includes('evaluation by a dermatologist'));
  const sysMsgs = (result as any).systemMessages;
  assert.ok(sysMsgs.length >= 2);
  assert.ok(sysMsgs[0].content.includes('URGENT MEDICAL SAFETY OVERRIDE'));
  assert.ok(sysMsgs[0].content.includes('changing_mole'));
});
