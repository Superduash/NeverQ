// backend/src/services/eta/reasons.js
// Reason catalogue for ETA change logging (§4.9)
// Note: text carries no sign and no minutes (the UI renders minutes separately).

export function formatReason(trigger, meta = {}) {
  switch (trigger) {
    case 'join':
      return meta.priority && meta.priority !== 'none'
        ? `A ${meta.priority} patient joined ahead of you`
        : 'A patient joined ahead of you';

    case 'cancel':
      return 'A patient ahead of you cancelled';

    case 'call':
    case 'start':
      return meta.counter
        ? `A consultation started at ${meta.counter}`
        : 'A consultation started at counter';

    case 'done':
      return meta.counter
        ? `${meta.counter} finished a consultation`
        : 'A consultation finished at counter';

    case 'skip':
      return 'A patient ahead was skipped';

    case 'expire':
      return 'A patient ahead was marked absent';

    case 'remove':
      return 'A patient ahead was removed';

    case 'delay_set': {
      const parts = [`${meta.counter || 'Counter'} reported a ${meta.minutes || ''} min delay`];
      if (meta.reason) parts.push(`— ${meta.reason}`);
      return parts.join(' ');
    }

    case 'delay_cleared':
      return `${meta.counter || 'Counter'} delay cleared`;

    case 'counter_open':
      return `${meta.counter || 'Counter'} opened`;

    case 'counter_paused':
      return `${meta.counter || 'Counter'} paused`;

    case 'counter_closed':
      return `${meta.counter || 'Counter'} closed`;

    case 'urgent': {
      const count = meta.count || 1;
      return `${count} urgent case(s) will be seen first`;
    }

    case 'requeue':
      return 'Missed the arrive-by time: moved to the back of the queue once';

    case 'nearly_up':
      return `You're nearly up: be at the hospital by ${meta.timeStr || ''}`;

    case 'drift':
    case 'sweep':
    case 'fast_forward':
      return meta.direction === 'shorter'
        ? 'Estimate updated: consultations are running shorter than expected'
        : 'Estimate updated: consultations are running longer than expected';

    default:
      return 'Queue update';
  }
}
