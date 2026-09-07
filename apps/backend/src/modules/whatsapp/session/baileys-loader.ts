type BaileysModule = typeof import('@whiskeysockets/baileys');

export async function loadBaileys(): Promise<BaileysModule> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<BaileysModule>;
  return dynamicImport('@whiskeysockets/baileys');
}
