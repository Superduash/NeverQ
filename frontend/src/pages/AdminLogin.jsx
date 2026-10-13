import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Lock, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import { Button } from '../components/ui/index.js';
import { Logo } from '../components/brand/Logo.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Please enter your admin password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await api.adminLogin({ password: password.trim() });
      notify.success('Admin console authenticated');
      navigate('/admin');
    } catch (err) {
      setErrorMsg(err.message || 'Invalid administrator password.');
      notify.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 bg-[var(--bg)]">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <Link to="/" className="hover:opacity-80 transition-opacity mb-1">
            <Logo size={36} />
          </Link>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-bold tracking-wide">
            <ShieldCheck size={14} />
            <span>EXECUTIVE ADMIN CONSOLE</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-[var(--ink)] tracking-tight">
            Administrator Access
          </h1>
          <p className="text-xs text-[var(--ink-faint)]">
            Platform governance and Demo Director. Requires administrative clearance.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Lock size={14} className="text-[var(--brand)]" />
                <span>Admin Password (Demo: admin123)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] font-semibold text-[var(--brand)] hover:underline flex items-center gap-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Enter master password..."
              disabled={loading}
              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-[var(--wait-bad-bg)] border border-[var(--danger)]/30 text-[var(--wait-bad-text)] text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full h-11 mt-1 text-xs font-bold"
            loading={loading}
          >
            Sign In to Admin Console
          </Button>
        </form>

        {/* Back Link */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
          <Link
            to="/"
            className="font-semibold text-[var(--ink-faint)] hover:text-[var(--brand)] transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={13} />
            <span>Customer View</span>
          </Link>
          <span className="text-[11px] text-[var(--ink-faint)]">
            Demo: <strong>admin123</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

