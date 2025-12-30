export function classifyInterrupt(reason) {
  const r = String(reason || '').trim();
  const manualPause = r === 'user_stop' || r === 'escape';

  // Interrupts that should allow "continue" to resume the same stop.
  const softPause =
    manualPause ||
    r === 'new_question' ||
    r === 'queue_takeover' ||
    r === 'high_priority' ||
    r === 'tour_question' ||
    r === 'tour_interrupt_for_question';

  // Hard resets that should clear cached tour pipeline store.
  const hardStop =
    r === 'tour_reset' ||
    r === 'tour_start' ||
    r === 'tour_prev' ||
    r === 'tour_next' ||
    r === 'tour_jump' ||
    r === 'mode_switch';

  return {
    kind: hardStop ? 'hard' : softPause ? 'pause' : 'hard',
    captureResume: softPause, // capture remaining audio/text for smoother continue
    manualPause,
    reason: r || 'interrupt',
  };
}
