import { ChannelManagerPage } from './ChannelManagerPage';
import { OtaMappingPage } from './OtaMappingPage';
import { WebhookSyncLogsPage } from './WebhookSyncLogsPage';
import { useChannelWorkspace } from './channel/useChannelWorkspace';

type ChannelWorkspaceView = 'setup' | 'mappings' | 'sync' | 'advanced';
type ChannelsPageMode = 'channel-manager' | 'ota-mapping' | 'webhooks-sync';

type ChannelsPageProps = {
  eyebrow?: string;
  initialView?: ChannelWorkspaceView;
  mode?: ChannelsPageMode;
  subtitle?: string;
  title?: string;
};

export function ChannelsPage({ mode = 'channel-manager' }: ChannelsPageProps) {
  const workspace = useChannelWorkspace({
    diagnosticsEnabled: mode === 'webhooks-sync',
    enabled: true,
  });

  if (mode === 'ota-mapping') {
    return <OtaMappingPage workspace={workspace} />;
  }

  if (mode === 'webhooks-sync') {
    return <WebhookSyncLogsPage workspace={workspace} />;
  }

  return <ChannelManagerPage workspace={workspace} />;
}
