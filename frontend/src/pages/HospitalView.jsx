import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Navigation, Star, CornerUpRight, Share2,
  Users, Footprints, Bike, Car, ShieldAlert, Clock, Monitor
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLiveData } from '../lib/socket.js';
import { storage, DEMO_HOME, DEFAULT_SAVED_HOME, LOCATION_PRESETS, estimateTravel, waitStatus } from '../lib/mock.js';
import { notify } from '../lib/notify.js';
import { NOTIFICATION_MESSAGES } from '../lib/messages.js';
import { shareLink } from '../lib/utils.js';
import {
  Button, IconButton, Badge, Segmented, Skeleton, ErrorState
} from '../components/ui/index.js';
import { MapView } from '../components/map/index.js';

export default function HospitalView() {
  const { orgId } = useParams();
  const navigate = useNavigate();

  const [travelMode, setTravelMode] = useState('car');
  const [savedOrgIds, setSavedOrgIds] = useState(() => storage.getSavedOrgs());

  const userOrigin = useMemo(() => {
    const lastPreset = storage.getLastLocationPreset();
    if (lastPreset === 'saved_home') {
      return storage.getSavedHome() || DEFAULT_SAVED_HOME;
    }
    const preset = LOCATION_PRESETS.find((p) => p.id === lastPreset);
    return preset || DEMO_HOME;
  }, []);

  const isGPS = userOrigin?.type === 'gps' || userOrigin?.id === 'gps';
  const isSavedHome = userOrigin?.type === 'saved' || userOrigin?.id === 'saved_home';
  const hasRealDistance = isGPS || isSavedHome;

  const fetcher = useCallback(async () => {
    return api.getOrg(orgId);
  }, [orgId]);

  const { data: hospital, loading, error, refresh } = useLiveData(fetcher, {
    room: `org:${orgId}`,
    event: 'queue:update',
    interval: 10000,
  });

  const isSaved = savedOrgIds.includes(orgId);

  const toggleSave = () => {
    if (!hospital) return;
    const next = storage.toggleSavedOrg(hospital.id);
    setSavedOrgIds(next);
    if (next.includes(hospital.id)) {
      notify.success(NOTIFICATION_MESSAGES.SAVED_ORG(hospital.name));
    } else {
      notify.info(NOTIFICATION_MESSAGES.UNSAVED_ORG(hospital.name));
    }
  };

  const travel = useMemo(() => {
    if (!hospital) return { km: 0, minutes: 0 };
    return estimateTravel(userOrigin, { lat: hospital.lat, lng: hospital.lng }, travelMode);
  }, [hospital, travelMode, userOrigin]);

  const handleShare = () => {
    if (!hospital) return;
    shareLink({
      title: `${hospital.name} — Live Queue Waits`,
      text: `Live hospital queues and wait times for ${hospital.name}`,
      url: window.location.href,
    });
  };

  const directionsUrl = hospital
    ? `https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lng}`
    : '#';

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        <Skeleton height="40px" width="120px" />
        <Skeleton height="140px" />
        <Skeleton height="80px" />
        <Skeleton height="200px" />
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <ErrorState
          title="Hospital not found"
          message={error?.message || 'Unable to load live details for this hospital.'}
          onRetry={refresh}
        />
      </div>
    );
  }

  const isRemoteDisabled = hospital.rules && hospital.rules.remoteEnabled === false;

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-2xl mx-auto w-full flex flex-col gap-5 pb-20">
      {/* Top Nav Row */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ArrowLeft size={16} />}
          onClick={() => navigate('/')}
        >
          Back to Map
        </Button>

        <div className="flex items-center gap-1.5">
          <IconButton
            icon={<Share2 size={16} />}
            label="Share hospital"
            onClick={handleShare}
            variant="ghost"
          />
          <IconButton
            icon={<Star size={16} className={isSaved ? 'fill-[var(--accent-2)] text-[var(--accent-2)]' : ''} />}
            label={isSaved ? 'Unsave hospital' : 'Save hospital'}
            onClick={toggleSave}
            variant="ghost"
          />
        </div>
      </div>

      {/* Hospital Header Card */}
      <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-lg sm:text-xl text-[var(--ink)]">
                {hospital.name}
              </h1>
              {hospital.demo && <Badge variant="demo">DEMO</Badge>}
            </div>
            <p className="text-xs text-[var(--ink-faint)] mt-1 flex items-center gap-1.5">
              <MapPin size={13} className="text-[var(--brand)] shrink-0" />
              <span>{hospital.address || `${hospital.area}, Chennai`}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--ink-faint)] pt-2 border-t border-[var(--border)]">
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-[var(--ink)]" />
            <span className="font-medium text-[var(--ink)]">{hospital.hours || 'Open today'}</span>
          </span>
          {hasRealDistance ? (
            <span className="tnum font-medium text-[var(--brand)]">
              ~{travel.minutes} min ({travel.km} km {isSavedHome ? 'from saved Home' : 'away'})
            </span>
          ) : (
            <span className="font-medium text-[var(--ink-muted)]">
              Chennai demo area · GPS needed for live distance
            </span>
          )}
        </div>
      </div>

      {/* Travel Mode Toggle & Directions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented
          value={travelMode}
          onChange={setTravelMode}
          options={[
            { value: 'walk', label: 'Walk', icon: <Footprints size={14} /> },
            { value: 'bike', label: 'Bike', icon: <Bike size={14} /> },
            { value: 'car', label: 'Car', icon: <Car size={14} /> },
          ]}
        />

        <div className="flex items-center gap-2">
          <Link
            to={`/board/${hospital.id}`}
            className="touch-target px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--ink)] inline-flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Monitor size={14} />
            <span>Wait Board</span>
          </Link>

          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-target px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--ink)] inline-flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <CornerUpRight size={14} />
            <span>Directions</span>
          </a>
        </div>
      </div>

      {/* Hospital Location Interactive Map Preview */}
      {typeof hospital.lat === 'number' && typeof hospital.lng === 'number' && (
        <div className="rounded-3xl overflow-hidden border border-[var(--border)] shadow-xs h-48 sm:h-56 relative">
          <MapView
            markers={[hospital]}
            selected={hospital.id}
            user={userOrigin}
            mode="browse"
            interactive={true}
            center={[hospital.lng, hospital.lat]}
            zoom={13.2}
          />
        </div>
      )}

      {/* Departments Live Queues Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-sm text-[var(--ink)]">
            Live Departments ({hospital.departments?.length || 0})
          </h2>
          <span className="text-[11px] text-[var(--ink-faint)]">
            Updated live
          </span>
        </div>

        {isRemoteDisabled && (
          <div className="p-3 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-xs text-[var(--ink)] flex items-center gap-2">
            <ShieldAlert size={15} className="text-[var(--accent)] shrink-0" />
            <span>Remote joining is temporarily disabled for this hospital. Walk-in only.</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {hospital.departments?.map((dept) => {
            const status = waitStatus(dept.eta?.mid || 15);
            const badgeVariant = status === 'good' ? 'good' : status === 'mid' ? 'mid' : 'bad';

            return (
              <div
                key={dept.id}
                className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-2.5 transition-all hover:border-[var(--brand)]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-[var(--ink)]">
                      {dept.name}
                    </h3>
                    <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">
                      {dept.confidence || 'Live queue'}
                    </p>
                  </div>

                  <Badge variant={badgeVariant}>
                    ~{dept.eta?.low}–{dept.eta?.high}m wait
                  </Badge>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]/60 text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--ink-faint)] text-[11px]">
                    <Users size={13} className="shrink-0" />
                    <span>{dept.countersOpen}/{dept.countersTotal} counters open</span>
                  </span>

                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isRemoteDisabled}
                    onClick={() => navigate(`/join/${hospital.id}/${dept.id}`)}
                  >
                    {isRemoteDisabled ? 'Walk-in Only' : 'Join Queue'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
