import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { ApiHealthSamplePage, Overview } from './platform-owner/OverviewPage';
import { ApiMonitorPage } from './platform-owner/ApiMonitorPage';
import { Properties } from './platform-owner/PropertiesPage';
import { Integrations, IntegrationSamplePage } from './platform-owner/IntegrationsPage';
import { PlatformUsers } from './platform-owner/UsersPage';
import { SystemLogs } from './platform-owner/SystemLogsPage';
import {
  samplePlatformPropertyDetail,
  samplePlatformPropertyId,
  sampleTwoChannelPropertyDetail,
  sampleTwoChannelPropertyId,
  withSamplePlatformProperty,
} from './platform-owner/sampleData';
import { ConfirmUserDeleteModal, titleForSection } from './platform-owner/shared';
import type { PlatformApiTrace, PlatformHealth, PlatformLogs, PlatformProperty, PlatformPropertyDetail, PlatformSection, PlatformIntegrationSummary, PlatformUser } from './platform-owner/types';

export function PlatformOwnerPage({ section }: { section: PlatformSection }) {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [properties, setProperties] = useState<PlatformProperty[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<PlatformPropertyDetail | null>(null);
  const [integrations, setIntegrations] = useState<PlatformIntegrationSummary | null>(null);
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [logs, setLogs] = useState<PlatformLogs | null>(null);
  const [apiTraces, setApiTraces] = useState<PlatformApiTrace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [userDeleteCandidate, setUserDeleteCandidate] = useState<Pick<PlatformUser, 'id' | 'email'> | null>(null);

  async function reloadPlatformProperties(nextSelectedId?: string) {
    const [healthResponse, propertiesResponse, tracesResponse] = await Promise.all([
      api.get<PlatformHealth>('/platform-admin/health'),
      api.get<PlatformProperty[]>('/platform-admin/properties'),
      api.get<{ data: PlatformApiTrace[] }>('/api-call-traces?limit=500'),
    ]);
    const nextProperties = withSamplePlatformProperty(propertiesResponse.data);
    setHealth(healthResponse.data);
    setProperties(nextProperties);
    setApiTraces(tracesResponse.data.data);
    setSelectedId(nextSelectedId ?? nextProperties[0]?.id ?? '');
  }

  async function reloadApiMonitor() {
    setLoading(true);
    setError(null);
    try {
      const [healthResponse, integrationsResponse, logsResponse, tracesResponse] = await Promise.all([
        api.get<PlatformHealth>('/platform-admin/health'),
        api.get<PlatformIntegrationSummary>('/platform-admin/integrations'),
        api.get<PlatformLogs>('/platform-admin/system-logs'),
        api.get<{ data: PlatformApiTrace[] }>('/api-call-traces?limit=500'),
      ]);
      setHealth(healthResponse.data);
      setIntegrations(integrationsResponse.data);
      setLogs(logsResponse.data);
      setApiTraces(tracesResponse.data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      setLoading(true);
      setError(null);
      try {
        const [healthResponse, propertiesResponse, tracesResponse] = await Promise.all([
          api.get<PlatformHealth>('/platform-admin/health'),
          api.get<PlatformProperty[]>('/platform-admin/properties'),
          api.get<{ data: PlatformApiTrace[] }>('/api-call-traces?limit=500'),
        ]);
        if (cancelled) return;
        const nextProperties = withSamplePlatformProperty(propertiesResponse.data);
        setHealth(healthResponse.data);
        setProperties(nextProperties);
        setApiTraces(tracesResponse.data.data);
        setSelectedId((current) => current || nextProperties[0]?.id || '');
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBase();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (section !== 'platform-api-monitor') return;

    let cancelled = false;

    async function loadApiMonitorData() {
      try {
        const [healthResponse, integrationsResponse, logsResponse, tracesResponse] = await Promise.all([
          api.get<PlatformHealth>('/platform-admin/health'),
          api.get<PlatformIntegrationSummary>('/platform-admin/integrations'),
          api.get<PlatformLogs>('/platform-admin/system-logs'),
          api.get<{ data: PlatformApiTrace[] }>('/api-call-traces?limit=500'),
        ]);
        if (!cancelled) {
          setHealth(healthResponse.data);
          setIntegrations(integrationsResponse.data);
          setLogs(logsResponse.data);
          setApiTraces(tracesResponse.data.data);
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      }
    }

    void loadApiMonitorData();
    return () => { cancelled = true; };
  }, [section]);

  useEffect(() => {
    let cancelled = false;

    async function loadSectionData() {
      try {
        if (section === 'platform-integrations' && !integrations) {
          const response = await api.get<PlatformIntegrationSummary>('/platform-admin/integrations');
          if (!cancelled) setIntegrations(response.data);
        }
        if (section === 'platform-users' && !users) {
          const response = await api.get<PlatformUser[]>('/platform-admin/users');
          if (!cancelled) setUsers(response.data);
        }
        if (section === 'platform-logs' && !logs) {
          const response = await api.get<PlatformLogs>('/platform-admin/system-logs');
          if (!cancelled) setLogs(response.data);
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      }
    }

    void loadSectionData();
    return () => { cancelled = true; };
  }, [integrations, logs, section, users]);

  useEffect(() => {
    if (!selectedId || section !== 'platform-properties') return;

    let cancelled = false;
    async function loadDetail() {
      setDetailLoading(true);
      setDetail(null);
      try {
        if (selectedId === samplePlatformPropertyId) {
          if (!cancelled) setDetail(samplePlatformPropertyDetail);
          return;
        }
        if (selectedId === sampleTwoChannelPropertyId) {
          if (!cancelled) setDetail(sampleTwoChannelPropertyDetail);
          return;
        }
        const response = await api.get<PlatformPropertyDetail>(`/platform-admin/properties/${selectedId}`);
        if (!cancelled) setDetail(response.data);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => { cancelled = true; };
  }, [section, selectedId]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedId) ?? null,
    [properties, selectedId],
  );
  const selectedDetail = detail?.id === selectedId ? detail : null;

  async function deleteProperty(property: PlatformProperty) {
    if (!window.confirm(`Delete ${property.name}? This is permanent and only works when no operational records block deletion.`)) return;

    setPendingDelete(`property:${property.id}`);
    setError(null);
    try {
      await api.delete(`/platform-admin/properties/${property.id}`);
      const nextProperty = properties.find((candidate) => candidate.id !== property.id);
      setDetail(null);
      await reloadPlatformProperties(nextProperty?.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPendingDelete(null);
    }
  }

  function deleteUser(user: Pick<PlatformUser, 'id' | 'email'>) {
    setUserDeleteCandidate(user);
  }

  async function confirmDeleteUser() {
    if (!userDeleteCandidate) return;

    setPendingDelete(`user:${userDeleteCandidate.id}`);
    setError(null);
    try {
      await api.delete(`/platform-admin/users/${userDeleteCandidate.id}`);
      setUsers((current) => current ? current.filter((platformUser) => platformUser.id !== userDeleteCandidate.id) : current);
      setDetail((current) => current
        ? { ...current, users: current.users.filter((detailUser) => detailUser.id !== userDeleteCandidate.id) }
        : current);
      setUserDeleteCandidate(null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Platform owner</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{titleForSection(section)}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            if (section === 'platform-overview') {
              void reloadPlatformProperties(selectedId);
              return;
            }
            if (section === 'platform-api-monitor') {
              void reloadApiMonitor();
              return;
            }
            window.location.reload();
          }}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      {section === 'platform-overview' && <Overview health={health} properties={properties} traces={apiTraces ?? []} loading={loading} />}
      {section === 'platform-api-sample' && <ApiHealthSamplePage />}
      {section === 'platform-api-monitor' && <ApiMonitorPage health={health} integrations={integrations} logs={logs} traces={apiTraces ?? []} loading={loading} />}
      {section === 'platform-properties' && (
        <Properties
          properties={properties}
          selectedId={selectedId}
          selectedProperty={selectedProperty}
          detail={selectedDetail}
          detailLoading={detailLoading}
          loading={loading}
          onSelect={setSelectedId}
          onDeleteProperty={deleteProperty}
          onDeleteUser={deleteUser}
          pendingDelete={pendingDelete}
        />
      )}
      {section === 'platform-integrations' && <Integrations data={integrations} properties={properties} />}
      {section === 'platform-integration-sample' && <IntegrationSamplePage />}
      {section === 'platform-users' && <PlatformUsers users={users} onDeleteUser={deleteUser} pendingDelete={pendingDelete} />}
      {section === 'platform-logs' && <SystemLogs logs={logs} properties={properties} />}

      {userDeleteCandidate && (
        <ConfirmUserDeleteModal
          user={userDeleteCandidate}
          pending={pendingDelete === `user:${userDeleteCandidate.id}`}
          onCancel={() => setUserDeleteCandidate(null)}
          onConfirm={() => void confirmDeleteUser()}
        />
      )}
    </div>
  );
}
