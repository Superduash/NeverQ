import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Eye, EyeOff, Building2, KeyRound, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import { Button, Input } from '../components/ui/index.js';
import { Logo } from '../main.jsx';

export default function StaffLogin() {
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('harbour');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Load available hospitals
  useEffect(() => {
    let mounted = true;
    api.listOrgs()
      .then((data) => {
        if (mounted && data?.length) {
          setOrgs(data);
          const savedOrg = localStorage.getItem('nq-staff-org');
          if (savedOrg && data.some((o) => o.id === savedOrg)) {
            setSelectedOrgId(savedOrg);
          } else {
            setSelectedOrgId(data[0].id);
          }
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLockedOut) {
      notify.error('Too many failed attempts. Please wait 15 seconds.');
      return;
    }

    if (!pin.trim()) {
      setErrorMsg('Please enter your staff PIN.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await api.staffLogin({
        orgId: selectedOrgId,
        pin: pin.trim(),
      });

      notify.success(`Welcome to ${res.orgName || 'Staff Console'}`);
      navigate('/staff');
    } catch (err) {
      const nextFails = failCount + 1;
      setFailCount(nextFails);

      if (nextFails >= 5) {
        setIsLockedOut(true);
        notify.error('5 failed attempts. Console locked for 15 seconds.');
        setTimeout(() => {
          setIsLockedOut(false);
          setFailCount(0);
        }, 15000);
      } else {
        setErrorMsg(err.message || 'Invalid staff PIN. Please try again.');
        notify.error(err.message || 'Invalid staff PIN');
      }
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
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-bold tracking-wide">
            <Shield size={14} />
            <span>STAFF CONSOLE LOGIN</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-[var(--ink)] tracking-tight">
            Clinic Desk Authentication
          </h1>
          <p className="text-xs text-[var(--ink-faint)]">
            Authorized personnel only. Enter your hospital and designated console PIN.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Hospital Select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
              <Building2 size={14} className="text-[var(--brand)]" />
              <span>Select Hospital / Facility</span>
            </label>
            <div className="relative">
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold text-[var(--ink)] focus:outline-none focus:border-[var(--brand)] transition-colors cursor-pointer"
                disabled={loading || isLockedOut}
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.area || 'Chennai'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PIN Input with Show/Hide Toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                <KeyRound size={14} className="text-[var(--brand)]" />
                <span>Desk PIN (Demo: 1234)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] font-semibold text-[var(--brand)] hover:underline flex items-center gap-1"
                tabIndex={-1}
              >
                {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showPin ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Enter numeric PIN..."
              disabled={loading || isLockedOut}
              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold tracking-widest text-[var(--ink)] focus:outline-none focus:border-[var(--brand)] transition-colors"
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
            disabled={isLockedOut}
          >
            {isLockedOut ? 'Locked Out (15s)' : 'Sign In to Console'}
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
            Demo PIN: <strong>1234</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
