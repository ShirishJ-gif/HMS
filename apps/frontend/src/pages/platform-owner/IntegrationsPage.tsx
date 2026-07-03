import { Maximize2, Minimize2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CustomSelect } from '../../components/CustomSelect';
import { DataPanel, Metric, Row, TinyStat, formatDate, formatLabel, propertyLabel } from './shared';
import { integrationSampleProperties, sampleIntegrationSummary } from './sampleData';
import type { IntegrationProviderNode, IntegrationStatus, PlatformIntegrationSummary, PlatformProperty } from './types';

export function Integrations({ data, properties }: { data: PlatformIntegrationSummary | null; properties: PlatformProperty[] }) {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [otaFilter, setOtaFilter] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const propertyFilterOptions = useMemo(() => [
    { label: 'All properties', value: '' },
    ...properties.map((property) => ({
      label: property.name,
      value: property.id,
    })),
  ], [properties]);
  const otaFilterOptions = useMemo(() => {
    const labels = Array.from(new Set((data?.channels ?? []).map(integrationProviderLabelForChannel))).sort();
    return [
      { label: 'All OTAs', value: '' },
      ...labels.map((label) => ({ label, value: label })),
    ];
  }, [data]);
  const filteredChannels = (data?.channels ?? [])
    .filter((channel) => (propertyFilter ? channel.property?.id === propertyFilter : true))
    .filter((channel) => (otaFilter ? integrationProviderLabelForChannel(channel) === otaFilter : true));
  const filteredSyncIssues = (data?.recent_sync_issues ?? [])
    .filter((issue) => (propertyFilter ? issue.channel.property?.id === propertyFilter : true))
    .filter((issue) => (otaFilter ? integrationProviderLabelForIssueChannel(issue.channel) === otaFilter : true));
  const filteredWebhookIssues = (data?.webhook_issues ?? [])
    .filter((event) => (propertyFilter ? event.property?.id === propertyFilter : true))
    .filter((event) => (otaFilter ? integrationProviderLabel(event.provider) === otaFilter : true));
  const providerNodes = buildIntegrationProviderNodes(filteredChannels, filteredSyncIssues, filteredWebhookIssues);
  const selectedNode = providerNodes.find((node) => node.provider === selectedProvider) ?? providerNodes[0] ?? null;
  const activeConnections = filteredChannels.filter((channel) => channel.status === 'ACTIVE').length;
  const unhealthyConnections = filteredChannels.filter((channel) => channel.status !== 'ACTIVE').length;
  const needsAttention = buildIntegrationAttentionItems(filteredChannels, filteredSyncIssues, filteredWebhookIssues);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Active connections" value={activeConnections} tone={activeConnections > 0 ? 'good' : 'neutral'} compact />
        <Metric label="Needs review" value={unhealthyConnections} tone={unhealthyConnections > 0 ? 'bad' : 'neutral'} compact />
        <Metric label="Failed syncs" value={filteredSyncIssues.length} tone={filteredSyncIssues.length > 0 ? 'bad' : 'neutral'} compact />
        <Metric label="Webhook errors" value={filteredWebhookIssues.length} tone={filteredWebhookIssues.length > 0 ? 'bad' : 'neutral'} compact />
      </div>

      <div>
        <IntegrationHealthMap
          nodes={providerNodes}
          selectedProvider={selectedNode?.provider ?? null}
          onSelectProvider={setSelectedProvider}
          propertyFilterOptions={propertyFilterOptions}
          propertyFilter={propertyFilter}
          onPropertyFilterChange={setPropertyFilter}
          otaFilterOptions={otaFilterOptions}
          otaFilter={otaFilter}
          onOtaFilterChange={setOtaFilter}
          onClearFilters={() => {
            setPropertyFilter('');
            setOtaFilter('');
          }}
        />
      </div>

      <DataPanel title="Needs attention">
        {needsAttention.map((item) => (
          <Row key={item.id} title={item.title} meta={item.meta} value={item.value} />
        ))}
      </DataPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <IntegrationIssuePanel title="Failed syncs" type="sync" items={filteredSyncIssues} />
        <IntegrationIssuePanel title="Webhook errors" type="webhook" items={filteredWebhookIssues} />
      </div>
    </div>
  );
}

export function IntegrationSamplePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
        <p className="text-[12px] font-bold text-sky-800">Frontend sample only</p>
        <p className="mt-1 text-[12px] text-sky-700">
          This shows multiple properties and OTA connections without creating channels, hotels, sync logs, or webhooks in the database.
        </p>
      </div>
      <Integrations data={sampleIntegrationSummary} properties={integrationSampleProperties} />
    </div>
  );
}

function IntegrationHealthMap({
  nodes,
  selectedProvider,
  onSelectProvider,
  propertyFilterOptions,
  propertyFilter,
  onPropertyFilterChange,
  otaFilterOptions,
  otaFilter,
  onOtaFilterChange,
  onClearFilters,
}: {
  nodes: IntegrationProviderNode[];
  selectedProvider: string | null;
  onSelectProvider: (provider: string) => void;
  propertyFilterOptions: Array<{ label: string; value: string }>;
  propertyFilter: string;
  onPropertyFilterChange: (value: string) => void;
  otaFilterOptions: Array<{ label: string; value: string }>;
  otaFilter: string;
  onOtaFilterChange: (value: string) => void;
  onClearFilters: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const positions = integrationProviderPositions(nodes.length);
  const platformPosition = { x: 50, y: 10 };
  const gatewayPosition = { x: 50, y: 25 };
  const gatewayStatus = integrationGatewayStatus(nodes);
  const gatewayIssueCount = nodes.reduce((total, node) => total + node.syncIssues.length + node.webhookIssues.length + (node.status === 'critical' ? 1 : 0), 0);

  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${expanded ? 'fixed inset-4 z-50 flex flex-col shadow-2xl shadow-slate-900/20' : ''}`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-slate-900">Provider health map</h3>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Filter this map by hotel or OTA connection.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-48">
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400">Hotel</span>
            <div className="mt-1 [&_button]:min-h-8 [&_button]:rounded-md [&_button]:px-2 [&_button]:py-1 [&_button]:text-[11px] [&_button_span]:text-[11px] [&_button_span_span]:text-[11px]">
              <CustomSelect
                options={propertyFilterOptions}
                value={propertyFilter}
                onChange={onPropertyFilterChange}
                placeholder="All properties"
              />
            </div>
          </label>
          <label className="block w-36">
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400">OTA</span>
            <div className="mt-1 [&_button]:min-h-8 [&_button]:rounded-md [&_button]:px-2 [&_button]:py-1 [&_button]:text-[11px] [&_button_span]:text-[11px] [&_button_span_span]:text-[11px]">
              <CustomSelect
                options={otaFilterOptions}
                value={otaFilter}
                onChange={onOtaFilterChange}
                placeholder="All OTAs"
              />
            </div>
          </label>
          {(propertyFilter || otaFilter) && (
            <button
              type="button"
              onClick={onClearFilters}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className={`relative bg-[radial-gradient(circle_at_50%_38%,#ffffff_0,#f8fafc_55%,#f1f5f9_100%)] p-5 ${expanded ? 'min-h-0 flex-1 overflow-auto' : 'min-h-[46rem]'}`}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="absolute bottom-4 right-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg shadow-slate-200/80 transition hover:border-slate-300 hover:bg-slate-50"
          aria-label={expanded ? 'Exit full size' : 'Open full size'}
          title={expanded ? 'Exit full size' : 'Full size'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
        <svg className="absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <IntegrationHealthLine
            x1={platformPosition.x}
            y1={platformPosition.y}
            x2={gatewayPosition.x}
            y2={gatewayPosition.y}
            status={gatewayStatus}
            width={1.8}
          />
          {nodes.map((node, index) => {
            const position = positions[index] ?? { x: 50, y: 20 };
            return (
              <IntegrationHealthLine
                key={`provider-line-${node.provider}`}
                x1={gatewayPosition.x}
                y1={gatewayPosition.y}
                x2={position.x}
                y2={position.y}
                status={node.status}
                width={1.6}
              />
            );
          })}
          {nodes.flatMap((node, index) => {
            const providerPosition = positions[index] ?? { x: 50, y: 45 };
            return visibleIntegrationChannels(node).map((channel, channelIndex) => {
              const hotelPosition = integrationHotelPosition(providerPosition, channelIndex, node.channels.length);
              const status = integrationChannelStatus(channel, node);
              return (
                <IntegrationHealthLine
                  key={`hotel-line-${channel.id}`}
                  x1={providerPosition.x}
                  y1={providerPosition.y}
                  x2={hotelPosition.x}
                  y2={hotelPosition.y}
                  status={status}
                  width={1.2}
                />
              );
            });
          })}
        </svg>

        <div className="hidden lg:block">
          <div
            className={`absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-white shadow-lg shadow-slate-200/70 ${gatewayStatus === 'healthy' ? 'animate-integration-border' : integrationStatusTone(gatewayStatus).border}`}
            style={{ left: `${platformPosition.x}%`, top: `${platformPosition.y}%` }}
          >
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">HMS</span>
            <span className="mt-0.5 text-[10px] font-black text-slate-900">Platform</span>
          </div>

          <div
            className={`absolute z-20 w-60 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white px-4 py-3 shadow-lg shadow-slate-200/70 ${gatewayStatus === 'healthy' ? 'animate-integration-border' : integrationStatusTone(gatewayStatus).border}`}
            style={{ left: `${gatewayPosition.x}%`, top: `${gatewayPosition.y}%` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-black text-slate-900">Zodomus Gateway</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">OTA broker and webhook relay</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-[9px] font-black ${integrationStatusTone(gatewayStatus).badge}`}>{formatLabel(gatewayStatus)}</span>
            </div>
            <p className="mt-2 text-[10px] font-bold text-slate-500">
              {nodes.length} providers · {gatewayIssueCount} issue{gatewayIssueCount === 1 ? '' : 's'}
            </p>
          </div>

          {nodes.map((node, index) => {
            const position = positions[index] ?? { x: 50, y: 20 };
            return (
              <div key={node.provider}>
                <IntegrationProviderNodeCard
                  node={node}
                  selected={selectedProvider === node.provider}
                  onClick={() => onSelectProvider(node.provider)}
                  x={position.x}
                  y={position.y}
                />
                {visibleIntegrationChannels(node).map((channel, channelIndex) => {
                  const hotelPosition = integrationHotelPosition(position, channelIndex, node.channels.length);
                  return (
                    <IntegrationHotelNodeCard
                      key={channel.id}
                      channel={channel}
                      status={integrationChannelStatus(channel, node)}
                      x={hotelPosition.x}
                      y={hotelPosition.y}
                    />
                  );
                })}
                {node.channels.length > visibleIntegrationChannels(node).length && (
                  <IntegrationOverflowNode
                    count={node.channels.length - visibleIntegrationChannels(node).length}
                    x={integrationHotelPosition(position, visibleIntegrationChannels(node).length, node.channels.length).x}
                    y={integrationHotelPosition(position, visibleIntegrationChannels(node).length, node.channels.length).y}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 lg:hidden">
          <div className={`mx-auto flex h-14 w-14 flex-col items-center justify-center rounded-full border bg-white shadow-sm ${gatewayStatus === 'healthy' ? 'animate-integration-border' : integrationStatusTone(gatewayStatus).border}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">HMS</span>
            <span className="mt-0.5 text-[10px] font-black text-slate-900">Platform</span>
          </div>
          <div className={`rounded-xl border bg-white px-4 py-3 ${gatewayStatus === 'healthy' ? 'animate-integration-border' : integrationStatusTone(gatewayStatus).border}`}>
            <p className="text-[13px] font-black text-slate-900">Zodomus Gateway</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Routes OTA syncs and webhook events</p>
          </div>
          {nodes.map((node) => (
            <div key={node.provider} className="space-y-2">
              <IntegrationProviderNodeCard
                node={node}
                selected={selectedProvider === node.provider}
                onClick={() => onSelectProvider(node.provider)}
              />
              <div className="grid gap-2 pl-4">
                {visibleIntegrationChannels(node).map((channel) => (
                  <IntegrationHotelNodeCard key={channel.id} channel={channel} status={integrationChannelStatus(channel, node)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {nodes.length === 0 && (
          <div className="flex min-h-[20rem] items-center justify-center text-[13px] text-slate-500">No integrations found.</div>
        )}
      </div>
    </section>
  );
}

function IntegrationHealthLine({
  x1,
  y1,
  x2,
  y2,
  status,
  width,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: IntegrationStatus;
  width: number;
}) {
  const healthy = status === 'healthy';

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      vectorEffect="non-scaling-stroke"
      className={`${integrationStatusStroke(status)} ${healthy ? 'animate-integration-flow' : ''}`}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={healthy ? '5 7' : undefined}
    />
  );
}

function IntegrationProviderNodeCard({
  node,
  selected,
  onClick,
  x,
  y,
}: {
  node: IntegrationProviderNode;
  selected: boolean;
  onClick: () => void;
  x?: number;
  y?: number;
}) {
  const tone = integrationStatusTone(node.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`z-10 w-full rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md lg:absolute lg:w-52 lg:-translate-x-1/2 lg:-translate-y-1/2 ${node.status === 'healthy' ? 'animate-integration-border' : selected ? tone.selectedBorder : tone.border}`}
      style={x != null && y != null ? { left: `${x}%`, top: `${y}%` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-black text-slate-900">{node.provider}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{node.channels.length} connection{node.channels.length === 1 ? '' : 's'}</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${tone.badge}`}>{formatLabel(node.status)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <TinyStat label="Active" value={node.activeCount} />
        <TinyStat label="Sync" value={node.syncIssues.length} />
        <TinyStat label="Hooks" value={node.webhookIssues.length} />
      </div>
    </button>
  );
}

function IntegrationHotelNodeCard({
  channel,
  status,
  x,
  y,
}: {
  channel: PlatformIntegrationSummary['channels'][number];
  status: IntegrationStatus;
  x?: number;
  y?: number;
}) {
  const tone = integrationStatusTone(status);

  return (
    <div
      className={`z-10 w-full rounded-lg border bg-white px-3 py-2 text-left shadow-sm lg:absolute lg:w-36 lg:-translate-x-1/2 lg:-translate-y-1/2 ${status === 'healthy' ? 'animate-integration-border' : tone.border}`}
      style={x != null && y != null ? { left: `${x}%`, top: `${y}%` } : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`truncate rounded-full px-2 py-0.5 text-[9px] font-black ${tone.badge}`}>
          {integrationProviderLabelForChannel(channel)}
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400">OTA</span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black text-slate-900">{propertyLabel(channel.property)}</p>
          <p className="mt-0.5 truncate text-[9.5px] font-semibold text-slate-500">{channel.name} · {channel.external_hotel_id ?? 'No hotel id'}</p>
        </div>
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${status === 'healthy' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'}`} />
      </div>
    </div>
  );
}

function IntegrationOverflowNode({ count, x, y }: { count: number; x: number; y: number }) {
  return (
    <div
      className="absolute z-10 w-28 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-[10px] font-black text-slate-500 shadow-sm"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      +{count} more
    </div>
  );
}

function IntegrationIssuePanel({
  title,
  type,
  items,
}: {
  title: string;
  type: 'sync' | 'webhook';
  items: PlatformIntegrationSummary['recent_sync_issues'] | PlatformIntegrationSummary['webhook_issues'];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${items.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.length ? items.slice(0, 8).map((item) => {
          if (type === 'sync') {
            const issue = item as PlatformIntegrationSummary['recent_sync_issues'][number];
            return (
              <div key={issue.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-rose-700">{issue.channel.provider} sync failed</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{propertyLabel(issue.channel.property)} · {issue.error_message ?? 'No error message'}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                    {formatLabel(issue.sync_type)}
                  </span>
                </div>
                <p className="mt-2 text-[10.5px] font-semibold text-slate-400">{formatDate(issue.created_at)}</p>
              </div>
            );
          }

          const event = item as PlatformIntegrationSummary['webhook_issues'][number];
          return (
            <div key={event.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black text-rose-700">{event.provider} webhook error</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{propertyLabel(event.property)} · {event.processing_error ?? 'No error message'}</p>
                </div>
                <span className="flex-shrink-0 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                  {event.domain}
                </span>
              </div>
              <p className="mt-2 text-[10.5px] font-semibold text-slate-400">{formatDate(event.received_at)}</p>
            </div>
          );
        }) : <div className="px-4 py-6 text-[13px] text-emerald-700">No issues recorded.</div>}
      </div>
    </section>
  );
}

function buildIntegrationAttentionItems(
  channels: PlatformIntegrationSummary['channels'],
  syncIssues: PlatformIntegrationSummary['recent_sync_issues'],
  webhookIssues: PlatformIntegrationSummary['webhook_issues'],
) {
  const statusIssues = channels
    .filter((channel) => channel.status !== 'ACTIVE')
    .map((channel) => ({
      id: `status-${channel.id}`,
      title: `${channel.provider} status is ${formatLabel(channel.status)}`,
      meta: propertyLabel(channel.property),
      value: 'Status',
    }));
  const missingHotelIds = channels
    .filter((channel) => !channel.external_hotel_id)
    .map((channel) => ({
      id: `hotel-id-${channel.id}`,
      title: `${channel.provider} missing hotel ID`,
      meta: propertyLabel(channel.property),
      value: 'Setup',
    }));
  const missingMappings = channels
    .filter((channel) => channel.counts.room_mappings === 0 || channel.counts.rate_mappings === 0)
    .map((channel) => ({
      id: `mapping-${channel.id}`,
      title: `${channel.provider} has incomplete mappings`,
      meta: `${propertyLabel(channel.property)} · ${channel.counts.room_mappings} room maps · ${channel.counts.rate_mappings} rate maps`,
      value: 'Mapping',
    }));
  const syncItems = syncIssues.slice(0, 5).map((issue) => ({
    id: `sync-${issue.id}`,
    title: `${issue.channel.provider} ${formatLabel(issue.sync_type)} sync failed`,
    meta: `${propertyLabel(issue.channel.property)} · ${issue.error_message ?? formatDate(issue.created_at)}`,
    value: issue.status,
  }));
  const webhookItems = webhookIssues.slice(0, 5).map((event) => ({
    id: `webhook-${event.id}`,
    title: `${event.provider} ${formatLabel(event.event_type)} webhook error`,
    meta: `${propertyLabel(event.property)} · ${event.processing_error ?? formatDate(event.received_at)}`,
    value: event.domain,
  }));

  return [...statusIssues, ...missingHotelIds, ...missingMappings, ...syncItems, ...webhookItems].slice(0, 8);
}

function buildIntegrationProviderNodes(
  channels: PlatformIntegrationSummary['channels'],
  syncIssues: PlatformIntegrationSummary['recent_sync_issues'],
  webhookIssues: PlatformIntegrationSummary['webhook_issues'],
): IntegrationProviderNode[] {
  const providers = Array.from(new Set([
    ...channels.map(integrationProviderLabelForChannel),
    ...syncIssues.map((issue) => integrationProviderLabelForIssueChannel(issue.channel)),
    ...webhookIssues.map((event) => event.provider),
  ])).sort();

  return providers.map((provider) => {
    const providerChannels = channels.filter((channel) => integrationProviderLabelForChannel(channel) === provider);
    const providerSyncIssues = syncIssues.filter((issue) => integrationProviderLabelForIssueChannel(issue.channel) === provider);
    const providerWebhookIssues = webhookIssues.filter((event) => event.provider === provider);
    const mappingIssues = providerChannels.filter((channel) => channel.counts.room_mappings === 0 || channel.counts.rate_mappings === 0).length;
    const activeCount = providerChannels.filter((channel) => channel.status === 'ACTIVE').length;
    const nonActiveCount = providerChannels.filter((channel) => channel.status !== 'ACTIVE').length;
    const status: IntegrationProviderNode['status'] =
      providerSyncIssues.length > 0 || providerWebhookIssues.length > 0 || nonActiveCount > 0
        ? 'critical'
        : mappingIssues > 0
          ? 'warning'
          : 'healthy';

    return {
      provider,
      status,
      channels: providerChannels,
      syncIssues: providerSyncIssues,
      webhookIssues: providerWebhookIssues,
      activeCount,
      mappingIssues,
    };
  });
}

function integrationProviderLabelForChannel(channel: PlatformIntegrationSummary['channels'][number]) {
  return integrationProviderLabel(channel.provider, channel.name);
}

function integrationProviderLabelForIssueChannel(channel: PlatformIntegrationSummary['recent_sync_issues'][number]['channel']) {
  return integrationProviderLabel(channel.provider, channel.name);
}

function integrationProviderLabel(provider: string, name?: string | null) {
  const rawProvider = provider.trim();
  const labelSource = `${rawProvider} ${name ?? ''}`.toLowerCase();

  if (labelSource.includes('booking')) return 'Booking.com';
  if (labelSource.includes('airbnb')) return 'Airbnb';
  if (labelSource.includes('expedia')) return 'Expedia';
  if (labelSource.includes('agoda')) return 'Agoda';
  if (labelSource.includes('trip')) return 'Trip.com';

  return rawProvider;
}

function integrationProviderPositions(count: number) {
  if (count <= 0) return [];

  const minX = count > 4 ? 12 : 20;
  const maxX = count > 4 ? 88 : 80;
  const step = count === 1 ? 0 : (maxX - minX) / (count - 1);

  return Array.from({ length: count }, (_, index) => ({
    x: count === 1 ? 50 : minX + step * index,
    y: 42,
  }));
}

function integrationHotelPosition(providerPosition: { x: number; y: number }, index: number, _total: number) {
  const slots = [
    { x: -6.5, y: 21 },
    { x: 6.5, y: 21 },
    { x: -6.5, y: 35 },
    { x: 6.5, y: 35 },
  ];
  const slot = slots[index] ?? { x: 0, y: 49 + (index - slots.length) * 11 };

  return {
    x: Math.max(8, Math.min(92, providerPosition.x + slot.x)),
    y: Math.min(93, providerPosition.y + slot.y),
  };
}

function visibleIntegrationChannels(node: IntegrationProviderNode) {
  return node.channels.slice(0, 4);
}

function integrationGatewayStatus(nodes: IntegrationProviderNode[]): IntegrationStatus {
  if (nodes.some((node) => node.status === 'critical')) return 'critical';
  if (nodes.some((node) => node.status === 'warning')) return 'warning';
  return 'healthy';
}

function integrationChannelStatus(
  channel: PlatformIntegrationSummary['channels'][number],
  node: IntegrationProviderNode,
): IntegrationStatus {
  const propertyId = channel.property?.id;
  const hasSyncIssue = node.syncIssues.some((issue) => issue.channel.property?.id === propertyId);
  const hasWebhookIssue = node.webhookIssues.some((event) => event.property?.id === propertyId);

  if (channel.status !== 'ACTIVE' || hasSyncIssue || hasWebhookIssue) {
    return 'critical';
  }

  if (channel.counts.room_mappings === 0 || channel.counts.rate_mappings === 0) {
    return 'warning';
  }

  return 'healthy';
}

function integrationStatusTone(status: IntegrationStatus) {
  if (status === 'critical') {
    return {
      border: 'border-rose-200',
      selectedBorder: 'border-rose-400',
      badge: 'bg-rose-50 text-rose-700',
      stroke: 'stroke-rose-300',
    };
  }

  if (status === 'warning') {
    return {
      border: 'border-amber-200',
      selectedBorder: 'border-amber-400',
      badge: 'bg-amber-50 text-amber-700',
      stroke: 'stroke-amber-300',
    };
  }

  return {
    border: 'border-emerald-200',
    selectedBorder: 'border-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700',
    stroke: 'stroke-emerald-300',
  };
}

function integrationStatusStroke(status: IntegrationStatus) {
  return integrationStatusTone(status).stroke;
}

