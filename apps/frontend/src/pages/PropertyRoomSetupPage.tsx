import { useState } from 'react';
import { BedDouble, Building2 } from 'lucide-react';
import { PropertySetupPage } from './PropertySetupPage';
import { RoomsPage } from './RoomsPage';

type SetupTab = 'property' | 'rooms';

export function PropertyRoomSetupPage({
  activePropertyId,
  onPropertyChange,
  onConfigureOta,
}: {
  activePropertyId: string;
  onPropertyChange: (propertyId: string) => void;
  onConfigureOta: () => void;
}) {
  const [tab, setTab] = useState<SetupTab>('property');

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Configuration</p>
          <h1 className="text-[22px] font-bold text-slate-900">{tab === 'property' ? 'Property Setup' : 'Rooms & Inventory'}</h1>
          <p className="mt-1 max-w-2xl text-[12px] text-slate-500">{tab === 'property' ? 'Manage your property profile, settings, and rates.' : 'Manage physical rooms and room categories.'}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Setup sections">
          <button type="button" role="tab" aria-selected={tab === 'property'} onClick={() => setTab('property')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${tab === 'property' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Building2 size={14} /> Property setup
          </button>
          <button type="button" role="tab" aria-selected={tab === 'rooms'} onClick={() => setTab('rooms')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${tab === 'rooms' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <BedDouble size={14} /> Rooms
          </button>
        </div>
      </header>

      {tab === 'property' ? (
        <PropertySetupPage
          controlledSelectedPropertyId={activePropertyId || null}
          onSelectedPropertyIdChange={(id) => { if (id) onPropertyChange(id); }}
          onAddRooms={() => setTab('rooms')}
          onConfigureOta={onConfigureOta}
        />
      ) : (
        <RoomsPage propertyId={activePropertyId || null} showHeading={false} />
      )}
    </div>
  );
}
