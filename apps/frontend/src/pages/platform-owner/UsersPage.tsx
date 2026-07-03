import { DeleteButton, DataPanel, Row, formatLabel, propertyLabel } from './shared';
import type { PlatformUser } from './types';

export function PlatformUsers({
  users,
  onDeleteUser,
  pendingDelete,
}: {
  users: PlatformUser[] | null;
  onDeleteUser: (user: Pick<PlatformUser, 'id' | 'email'>) => void;
  pendingDelete: string | null;
}) {
  return (
    <DataPanel title="Hotel users">
      {users?.map((user) => (
        <Row
          key={user.id}
          title={user.name}
          meta={`${user.email} · ${propertyLabel(user.property)}`}
          value={formatLabel(user.role)}
          muted={!user.is_active}
          action={
            <DeleteButton
              label={pendingDelete === `user:${user.id}` ? 'Deleting' : 'Delete'}
              disabled={pendingDelete === `user:${user.id}`}
              onClick={() => onDeleteUser(user)}
            />
          }
        />
      ))}
    </DataPanel>
  );
}

