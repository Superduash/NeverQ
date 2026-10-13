import { toast } from 'sonner';
import { getErrorMessage } from './messages.js';

export const notify = {
  success: (message, options = {}) => {
    return toast.success(message, {
      duration: 3500,
      ...options,
    });
  },

  error: (codeOrError, options = {}) => {
    const text = getErrorMessage(codeOrError);
    return toast.error(text, {
      duration: 6000,
      ...options,
    });
  },

  info: (message, options = {}) => {
    return toast.info(message, {
      duration: 3500,
      ...options,
    });
  },

  warning: (message, options = {}) => {
    return toast.warning(message, {
      duration: 5000,
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
