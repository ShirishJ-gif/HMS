import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/backend/.env'),
  join(dirname(__dirname), '../..', '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

function loadEnvFile(envPath: string) {
  const contents = readFileSync(envPath, 'utf8');

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
