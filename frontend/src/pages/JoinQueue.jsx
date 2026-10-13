import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldAlert, CheckCircle2, AlertCircle, Heart,
  User, Sparkles, Building2
} from 'lucide-react';
import { api } from '../lib/api.js';
import { storage } from '../lib/mock.js';
import { notify } from '../lib/notify.js';
import { NOTIFICATION_MESSAGES } from '../lib/messages.js';
import { useDeviceId } from '../lib/utils.js';
import {
  Button, Input, PhoneInput, Select, RadioCard,
  Banner, Skeleton, ErrorState
} from '../components/ui/index.js';

export default function JoinQueue() {
  const { orgId, deptId } = useParams();
  const navigate = useNavigate();
  const deviceId = useDeviceId();

  const [hospital, setHospital] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgError, setOrgError] = useState(null);

  // Form State
  const [selectedDeptId, setSelectedDeptId] = useState(deptId || 'gen');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [priority, setPriority] = useState('none');

  // Submission & Error State
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [duplicateToken, setDuplicateToken] = useState(null);
  const [isCooldown, setIsCooldown] = useState(false);

  // Fetch Hospital details
  useEffect(() => {
    setLoadingOrg(true);
    api.getOrg(orgId)
      .then((data) => {
        setHospital(data);
        if (!selectedDeptId && data.departments?.[0]?.id) {
          setSelectedDeptId(data.departments[0].id);
        }
      })
      .catch((err) => {
        setOrgError(err);
      })
      .finally(() => {
        setLoadingOrg(false);
      });
  }, [orgId]);

  // Sync selectedDeptId if deptId param changes
  useEffect(() => {
    if (deptId) {
      setSelectedDeptId(deptId);
    }
  }, [deptId]);

  // Validation
  const isNameValid = name.trim().length >= 2 && name.trim().length <= 40;
  const isPhoneValid = phone.trim().length === 10 && /^\d{10}$/.test(phone.trim());
  const isFormValid = isNameValid && isPhoneValid && !submitting && !isCooldown;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setFormError(null);
    setDuplicateToken(null);

    try {
      const ticket = await api.createTicket({
        orgId,
        deptId: selectedDeptId,
        name: name.trim(),
        phone: phone.trim(),
        priority,
        deviceId,
      });

      // Save active ticket to local storage
      storage.setActiveTicket(ticket);
      notify.success(NOTIFICATION_MESSAGES.TICKET_CREATED(ticket.label || ticket.token));
      navigate(`/t/${ticket.token}`, { replace: true });
    } catch (err) {
      setFormError(err);
      if (err.code === 'DUPLICATE_TICKET' && err.token) {
        setDuplicateToken(err.token);
      } else if (err.code === 'COOLDOWN') {
        setIsCooldown(true);
      }
      notify.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingOrg) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <Skeleton height="36px" width="100px" />
        <Skeleton height="80px" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (orgError || !hospital) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <ErrorState
          title="Hospital not found"
          message={orgError?.message || 'Unable to open queue join form.'}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const deptOptions = hospital.departments?.map((d) => ({
    value: d.id,
    label: `${d.name} (~${d.eta?.low || 10}–${d.eta?.high || 25}m wait)`,
  })) || [];

  const currentDept = hospital.departments?.find((d) => d.id === selectedDeptId);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-xl mx-auto w-full flex flex-col gap-4 pb-24">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ArrowLeft size={16} />}
          onClick={() => navigate(`/hospital/${orgId}`)}
        >
          Back to Hospital
        </Button>
      </div>

      {/* Emergency Notice */}
      <div
        role="alert"
        className="p-3 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 flex items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <ShieldAlert size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-[var(--ink)] leading-snug">Medical emergency?</p>
            <p className="text-[11px] text-[var(--ink-faint)] leading-tight">
              Call 112 or visit an emergency department immediately.
            </p>
          </div>
        </div>
        <a
          href="tel:112"
          className="touch-target px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 font-bold text-xs shrink-0 shadow-xs"
        >
          Call 112
        </a>
      </div>

      {/* Form Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-heading font-extrabold text-lg text-[var(--ink)]">
              Join Remote Queue
            </h1>
            {hospital.demo && <Badge variant="demo">DEMO</Badge>}
          </div>
          <p className="text-xs text-[var(--ink-faint)] flex items-center gap-1.5">
            <Building2 size={13} className="text-[var(--brand)]" />
            <span>{hospital.name}</span>
          </p>
        </div>

        {/* Error Banners */}
        {duplicateToken && (
          <Banner
            variant="warn"
            title="Active Ticket Already Exists"
            action={
              <Link to={`/t/${duplicateToken}`}>
                <Button size="sm" variant="primary">
                  Open Existing Ticket
                </Button>
              </Link>
            }
          >
            You already have an active ticket in line at this hospital.
          </Banner>
        )}

        {isCooldown && (
          <Banner variant="error" title="Remote Joining Paused">
            A 24-hour cooldown is active due to repeated missed deadlines. Walk-ins are still accepted at the hospital reception.
          </Banner>
        )}

        {formError && !duplicateToken && !isCooldown && (
          <Banner variant="error" title="Unable to Join Queue">
            {formError.message || 'An error occurred while creating your queue ticket.'}
          </Banner>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Department Selection */}
          <Select
            label="Department"
            value={selectedDeptId}
            onChange={setSelectedDeptId}
            options={deptOptions}
            required
          />

          {/* Patient Name */}
          <Input
            label="Patient Full Name"
            placeholder="e.g. S. Ramanathan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            helper="Enter the name of the person seeking consultation (2–40 characters)"
            error={name && !isNameValid ? 'Name must be between 2 and 40 characters' : undefined}
          />

          {/* Patient Phone */}
          <PhoneInput
            label="Phone Number"
            value={phone}
            onChange={setPhone}
            required
            helper="10 digits required for queue alerts and arrival verification"
            error={phone && !isPhoneValid ? 'Please enter a valid 10-digit mobile number' : undefined}
          />

          {/* Who is this for */}
          <Input
            label="Who is this for? (Optional)"
            placeholder="e.g. Self, Father, Daughter"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            helper="Leave blank if joining for yourself"
          />

          {/* Priority Claim Options */}
          <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]">
            <label className="text-xs font-semibold text-[var(--ink)]">
              Priority Category
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <RadioCard
                name="priority"
                value="none"
                selected={priority === 'none'}
                onChange={setPriority}
                title="Standard Queue"
                description="General consultation order"
              />
              <RadioCard
                name="priority"
                value="senior"
                selected={priority === 'senior'}
                onChange={setPriority}
                title="Senior Citizen (60+)"
                description="20 min queue priority credit"
              />
              <RadioCard
                name="priority"
                value="pregnant"
                selected={priority === 'pregnant'}
                onChange={setPriority}
                title="Expectant Mother"
                description="20 min queue priority credit"
              />
              <RadioCard
                name="priority"
                value="disabled"
                selected={priority === 'disabled'}
                onChange={setPriority}
                title="Person with Disability"
                description="20 min queue priority credit"
              />
            </div>
            <p className="text-[11px] text-[var(--ink-faint)] italic">
              Note: Hospital staff will verify priority claims at the consultation desk.
            </p>
          </div>

          {/* Privacy Notice */}
          <p className="text-[11px] text-[var(--ink-faint)] bg-[var(--surface-2)] p-2.5 rounded-xl leading-relaxed">
            NeverQ stores only your temporary token and phone number for queue coordination. All data is automatically deleted after 24 hours.
          </p>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              variant="primary"
              className="w-full"
              loading={submitting}
              disabled={!isFormValid}
            >
              Confirm & Join Queue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
