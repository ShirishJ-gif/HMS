import { Injectable } from '@nestjs/common';
import type { AuthenticationState, SignalDataSet, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { WhatsAppAuthStoreService } from './whatsapp-auth-store.service';
import { loadBaileys } from './baileys-loader';

@Injectable()
export class WhatsAppBaileysAuthStateService {
  constructor(private readonly authStore: WhatsAppAuthStoreService) {}

  async create(connectionId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const baileys = await loadBaileys();
    const storedCreds = await this.read(connectionId, 'creds');
    const creds = storedCreds ?? baileys.initAuthCreds();

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(ids.map(async (id) => {
            let value = await this.read(connectionId, this.keyName(type, id));
            if (type === 'app-state-sync-key' && value) {
              value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            if (value) {
              data[id] = value as SignalDataTypeMap[T];
            }
          }));
          return data;
        },
        set: async (data: SignalDataSet) => {
          const writes: Array<Promise<void>> = [];
          for (const category of Object.keys(data) as Array<keyof SignalDataSet>) {
            const values = data[category];
            if (!values) continue;
            for (const id of Object.keys(values)) {
              const value = values[id];
              const key = this.keyName(category, id);
              writes.push(value ? this.write(connectionId, key, value) : this.authStore.remove(connectionId, key));
            }
          }
          await Promise.all(writes);
        },
        clear: async () => {
          await this.authStore.clear(connectionId);
        },
      },
    };

    return {
      state,
      saveCreds: () => this.write(connectionId, 'creds', state.creds),
    };
  }

  private keyName(category: string, id: string) {
    return `${category}-${id}`;
  }

  private async read(connectionId: string, key: string) {
    const baileys = await loadBaileys();
    const value = await this.authStore.read(connectionId, key);
    return value ? JSON.parse(JSON.stringify(value), baileys.BufferJSON.reviver) : null;
  }

  private async write(connectionId: string, key: string, value: unknown) {
    const baileys = await loadBaileys();
    await this.authStore.write(connectionId, key, JSON.parse(JSON.stringify(value, baileys.BufferJSON.replacer)));
  }
}
