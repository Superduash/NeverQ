import { toast } from 'sonner';
import { getErrorMessage } from './messages.js';

/**
 * Central NeverQ Toast Notification API (Phase B.1)
 * Wraps Sonner with standardized durations, deduplication, action buttons, and error code mapping.
 */
function getDedupeId(message, options = {}) {
  if (options.id) return options.id;
  const str = typeof message === 'string' ? message : JSON.stringify(message);
  return `nq-${str.slice(0, 32).replace(/\s+/g, '_')}`;
}

export const notify = {
  success: (message, options = {}) => {
    const id = getDedupeId(message, options);
    return toast.success(message, {
      id,
      duration: 3000, // Phase B.1: 3 seconds
      dismissible: true,
      ...options,
    });
  },

  error: (codeOrError, options = {}) => {
    const text = getErrorMessage(codeOrError);
    const id = getDedupeId(text, options);
    return toast.error(text, {
      id,
      duration: 6000, // Phase B.1: 6 seconds
      dismissible: true,
      ...options,
    });
  },

  info: (message, options = {}) => {
    const id = getDedupeId(message, options);
    return toast.info(message, {
      id,
      duration: 3500,
      dismissible: true,
      ...options,
    });
  },

  warning: (message, options = {}) => {
    const id = getDedupeId(message, options);
    return toast.warning(message, {
      id,
      duration: 5000,
      dismissible: true,
      ...options,
    });
  },

  loading: (message, options = {}) => {
    const id = getDedupeId(message, options);
    return toast.loading(message, {
      id,
      dismissible: true,
      ...options,
    });
  },

  promise: (promise, { loading, success, error }) => {
    return toast.promise(promise, {
      loading: loading || 'Processing...',
      success: (data) => (typeof success === 'function' ? success(data) : success || 'Success'),
      error: (err) => (typeof error === 'function' ? error(err) : getErrorMessage(err)),
    });
  },

  dismiss: (id) => toast.dismiss(id),
};
