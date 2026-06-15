import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import '@daypicker/react/style.css';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { PricingRule, PricingRuleType, Property, RatePlan, Room, RoomCategory } from '../api/types';
import { CalendarDatePickerField, formatDatePickerLabel, InlineCalendarDatePicker } from '../components/CalendarDatePicker';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { labelCls, inputCls, primaryBtn, secondaryBtn, ErrorMsg, LoadingMsg, SuccessMsg } from './ui';

/* ── Color palette (one per property, cycles) ────────────────── */
const PROPERTY_COLORS = [
  { bg: 'bg-indigo-600',  text: 'text-indigo-600',  border: 'border-indigo-500',  ring: 'stroke-indigo-500',  bar: 'bg-indigo-500'  },
  { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-500', ring: 'stroke-emerald-500', bar: 'bg-emerald-500' },
  { bg: 'bg-amber-600',   text: 'text-amber-600',   border: 'border-amber-500',   ring: 'stroke-amber-400',   bar: 'bg-amber-500'   },
  { bg: 'bg-rose-600',    text: 'text-rose-600',    border: 'border-rose-500',    ring: 'stroke-rose-500',    bar: 'bg-rose-500'    },
  { bg: 'bg-violet-600',  text: 'text-violet-600',  border: 'border-violet-500',  ring: 'stroke-violet-500',  bar: 'bg-violet-500'  },
];
function getColor(idx: number) { return PROPERTY_COLORS[idx % PROPERTY_COLORS.length]; }
const SETUP_PROGRESS_COLOR = {
  text: 'text-emerald-600',
  border: 'border-emerald-500',
  ring: 'stroke-emerald-500',
  bar: 'bg-emerald-500',
};

const TYPE_CHIP: Record<string, string> = {
  WEEKEND: 'bg-slate-100 text-slate-700',
  DATE_RANGE: 'bg-slate-100 text-slate-700',
  OCCUPANCY: 'bg-slate-100 text-slate-700',
};
const TYPE_LABEL: Record<string, string> = { WEEKEND: 'Weekend', DATE_RANGE: 'Date range', OCCUPANCY: 'Occupancy' };

const SETUP_STEPS = [
  { key: 'property'     as const, label: 'Add property'   },
  { key: 'roomTypes'    as const, label: 'Room types'    },
  { key: 'ratePlans'    as const, label: 'Rate plans'    },
  { key: 'pricingRules' as const, label: 'Pricing rules' },
  { key: 'media'        as const, label: 'Media'         },
  { key: 'physicalRooms' as const, label: 'Rooms'        },
  { key: 'ota'          as const, label: 'OTA ready'     },
];
type SetupKey = typeof SETUP_STEPS[number]['key'];
type SetupState = Record<SetupKey, boolean>;
const OPTIONAL_SETUP_KEYS = new Set<SetupKey>(['media']);

function isSetupStepComplete(setup: SetupState, key: SetupKey) {
  if (key === 'media') return setup.media || (setup.roomTypes && setup.ratePlans && setup.pricingRules);
  return setup[key] || OPTIONAL_SETUP_KEYS.has(key);
}

function computeSetup(p: Property, cats: RoomCategory[], rps: RatePlan[], rules: PricingRule[], rooms: Room[]): SetupState {
  const pCats  = cats.filter((c) => c.property_id === p.id);
  const hasMedia = p.images.length > 0 || pCats.some((c) => c.images.length > 0);
  const hasRoomTypes = pCats.length > 0;
  const hasRatePlans = rps.some((r) => r.property_id === p.id);
  const hasPricingRules = rules.some((r) => r.property_id === p.id);
  const hasPhysicalRooms = rooms.some((r) => r.property_id === p.id);
  return {
    property:     true,
    roomTypes:    hasRoomTypes,
    ratePlans:    hasRatePlans,
    pricingRules: hasPricingRules,
    media:        hasMedia,
    physicalRooms: hasPhysicalRooms,
    ota:          hasRoomTypes && hasRatePlans && hasPricingRules && hasPhysicalRooms,
  };
}

/* ── Health ring SVG ─────────────────────────────────────────── */
function HealthRing({ done, total, ring }: { done: number; total: number; ring: string }) {
  const r = 16; const c = 2 * Math.PI * r;
  const dash = total > 0 ? c * (done / total) : 0; const gap = c - dash;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="flex-shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
      <circle cx="22" cy="22" r={r} fill="none" className={ring} strokeWidth="3.5"
        strokeDasharray={`${dash} ${gap}`} strokeDashoffset={c * 0.25} strokeLinecap="round" />
      <text x="22" y="22" dominantBaseline="middle" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e293b">
        {done}/{total}
      </text>
    </svg>
  );
}

/* ── Setup progress bar ──────────────────────────────────────── */
function SetupBar({ setup }: { setup: SetupState }) {
  const done = SETUP_STEPS.filter((s) => isSetupStepComplete(setup, s.key)).length;
  return (
    <div className="bg-white border border-black/[0.06] rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Setup progress</span>
        <span className="text-[11px] font-semibold text-slate-600">{done} of {SETUP_STEPS.length} complete</span>
      </div>
      <div className="flex items-center gap-0">
        {SETUP_STEPS.map((step, i) => {
          const optional = OPTIONAL_SETUP_KEYS.has(step.key);
          const ok = isSetupStepComplete(setup, step.key);
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex-1 flex flex-col items-center gap-1.5 px-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${ok ? `${SETUP_PROGRESS_COLOR.border} bg-white` : 'border-slate-200 bg-slate-50'}`}>
                  {ok
                    ? <svg className={`w-4 h-4 ${SETUP_PROGRESS_COLOR.text}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m5 13 4 4L19 7" /></svg>
                    : <span className="text-slate-300 text-[11px]">{i + 1}</span>}
                </div>
                <span className={`text-[9.5px] font-semibold text-center leading-tight whitespace-nowrap ${ok ? 'text-slate-700' : 'text-slate-400'}`}>{step.label}{optional ? ' optional' : ''}</span>
              </div>
              {i < SETUP_STEPS.length - 1 && (
                <div className={`h-0.5 w-full max-w-[2rem] mx-1 rounded-full mb-4 transition-all ${ok ? `${SETUP_PROGRESS_COLOR.bar} opacity-40` : 'bg-slate-100'}`} />
              )}
            </div>
          );
        })}
      </div>
      {done < SETUP_STEPS.length
        ? <div className="mt-3 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"><span className="text-[11.5px] text-slate-500">Complete the remaining steps to unlock OTA channel mapping.</span></div>
        : <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m5 13 4 4L19 7" /></svg>
            <span className="text-[12px] font-semibold text-emerald-700">All setup steps complete — ready for OTA mapping.</span>
          </div>
      }
    </div>
  );
}

/* ── Section card ────────────────────────────────────────────── */
function SectionCard({ eyebrow, title, badge, badgeTone, children, addForm, onAdd, adding, actions }: {
  eyebrow: string; title: string; badge?: string; badgeTone?: string;
  children: ReactNode; addForm?: ReactNode; onAdd?: () => void; adding?: boolean; actions?: ReactNode;
}) {
  return (
    <div className="bg-white border border-black/[0.06] rounded-xl overflow-visible">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{eyebrow}</p>
          <h3 className="text-[13.5px] font-bold text-slate-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {badge && <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${badgeTone}`}>{badge}</span>}
          {actions}
          {onAdd && (
            <button type="button" onClick={onAdd}
              className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-1.5">
              <span className="text-base leading-none">{adding ? '×' : '+'}</span>
              {adding ? 'Cancel' : 'Add'}
            </button>
          )}
        </div>
      </div>
      {children}
      {adding && addForm && (
        <div className="border-t border-dashed border-slate-200 bg-slate-50/60 px-5 py-5">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-4">New entry</p>
          {addForm}
        </div>
      )}
    </div>
  );
}

/* ── OTA gate ────────────────────────────────────────────────── */
function RoomsGate({ onAddRooms, roomCount, setup, colorBg }: { onAddRooms: () => void; roomCount: number; setup: SetupState; colorBg: string }) {
  const prereqs = (['roomTypes', 'ratePlans', 'pricingRules'] as const);
  const missing = prereqs.filter((k) => !setup[k]);
  const ready = missing.length === 0;
  return (
    <div className={`rounded-xl border-2 ${ready ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white'} p-5`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Next step</p>
          <h3 className="text-[14px] font-bold text-slate-900 mb-1">{ready ? 'Add rooms to inventory' : 'Rooms locked'}</h3>
          {ready
            ? <p className="text-[12.5px] text-emerald-700 font-medium">Add physical rooms before OTA mapping. OTA setup will unlock after at least one room exists.</p>
            : <p className="text-[12.5px] text-slate-500">Finish property setup before adding physical rooms.</p>
          }
        </div>
        <button type="button" disabled={!ready} onClick={onAddRooms}
          className={`h-9 px-4 rounded-lg text-[12px] font-semibold flex-shrink-0 transition-colors ${ready ? `${colorBg} text-white hover:opacity-90` : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          {roomCount > 0 ? 'Manage rooms →' : 'Add rooms →'}
        </button>
      </div>
    </div>
  );
}

function OtaGate({ onConfigureOta, setup, colorBg }: { onConfigureOta: () => void; setup: SetupState; colorBg: string }) {
  const prereqs = (['roomTypes', 'ratePlans', 'pricingRules', 'physicalRooms'] as const);
  const missing = prereqs.filter((k) => !setup[k]);
  const allDone = missing.length === 0;
  return (
    <div className={`rounded-xl border-2 ${allDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white'} p-5`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${allDone ? 'bg-emerald-100' : 'bg-slate-100'}`}>🌐</div>
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Final step</p>
          <h3 className="text-[14px] font-bold text-slate-900 mb-1">{allDone ? 'Ready for OTA mapping' : 'OTA mapping locked'}</h3>
          {allDone
            ? <p className="text-[12.5px] text-emerald-700 font-medium">All setup steps complete. You can now configure OTA channel connections for this property.</p>
            : <>
                <p className="text-[12.5px] text-slate-500">Complete the following before connecting OTA channels:</p>
                <ul className="mt-2 space-y-1">
                  {missing.map((k) => {
                    const s = SETUP_STEPS.find((st) => st.key === k)!;
                    return <li key={k} className="flex items-center gap-2 text-[12px] text-slate-500"><span className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />{s.label} not configured</li>;
                  })}
                </ul>
              </>
          }
        </div>
        <button type="button" disabled={!allDone} onClick={onConfigureOta}
          className={`h-9 px-4 rounded-lg text-[12px] font-semibold flex-shrink-0 transition-colors ${allDone ? `${colorBg} text-white hover:opacity-90` : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          {allDone ? 'Configure OTA →' : 'Locked'}
        </button>
      </div>
    </div>
  );
}

/* ── Form defaults ───────────────────────────────────────────── */
const TIMEZONE_OPTIONS = [
  { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
  { label: 'UTC', value: 'UTC' },
  { label: 'Asia/Dubai', value: 'Asia/Dubai' },
  { label: 'Asia/Singapore', value: 'Asia/Singapore' },
  { label: 'Asia/Bangkok', value: 'Asia/Bangkok' },
  // { label: 'Europe/London', value: 'Europe/London' },
  // { label: 'Europe/Paris', value: 'Europe/Paris' },
  // { label: 'America/New_York', value: 'America/New_York' },
  // { label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
];
const defaultPropertyForm    = { name: '', code: '', phone: '', email: '', address: '', timezone: 'Asia/Kolkata' };
const defaultCategoryForm    = { property_id: '', name: '', code: '', description: '', max_occupancy: '2' };
const defaultRatePlanForm    = { property_id: '', room_category_id: '', name: '', code: '', base_rate: '', currency: 'INR' };
const defaultPricingRuleForm = { property_id: '', rate_plan_id: '', name: '', type: 'WEEKEND', adjustment_percent: '', start_date: '', end_date: '', occupancy_threshold: '' };
const inlineInputCls = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15';

/* ══ Main page ═══════════════════════════════════════════════════ */
export function PropertySetupPage({
  controlledSelectedPropertyId,
  embedded = false,
  onAddRooms,
  onConfigureOta,
  onSelectedPropertyIdChange,
}: {
  controlledSelectedPropertyId?: string | null;
  embedded?: boolean;
  onAddRooms?: () => void;
  onConfigureOta: () => void;
  onSelectedPropertyIdChange?: (propertyId: string | null) => void;
}) {
  /* ── global state ── */
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  /* ── pricing rule edit ── */
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | null>(null);
  const [selectedPricingRuleId, setSelectedPricingRuleId] = useState<string | null>(null);
  const [openPricingRuleDatePicker, setOpenPricingRuleDatePicker] = useState<'start' | 'end' | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const autoOpenedCreatePropertyRef = useRef(false);

  /* ── hub panel state ── */
  const [internalSelectedPropertyId, setInternalSelectedPropertyId] = useState<string | null>(null);
  const [addingProperty,      setAddingProperty]      = useState(false);
  const [addingCategory,      setAddingCategory]      = useState(false);
  const [addingRatePlan,      setAddingRatePlan]      = useState(false);
  const [addingPricingRule,   setAddingPricingRule]   = useState(false);
  const [addingPropertyImage, setAddingPropertyImage] = useState(false);
  const [addingRoomImage,     setAddingRoomImage]     = useState(false);

  /* ── form state ── */
  const [propertyForm,    setPropertyForm]    = useState(defaultPropertyForm);
  const [categoryForm,    setCategoryForm]    = useState(defaultCategoryForm);
  const [ratePlanForm,    setRatePlanForm]    = useState(defaultRatePlanForm);
  const [pricingRuleForm, setPricingRuleForm] = useState(defaultPricingRuleForm);
  const [propertyImageForm, setPropertyImageForm] = useState({ property_id: '', caption: '', is_primary: true });
  const [roomImageForm,     setRoomImageForm]     = useState({ room_category_id: '', caption: '', is_primary: true });
  const [propertyImageFiles, setPropertyImageFiles] = useState<File[]>([]);
  const [roomImageFiles,     setRoomImageFiles]     = useState<File[]>([]);
  const [primaryPropertyImageIndex, setPrimaryPropertyImageIndex] = useState(0);
  const [primaryRoomImageIndex,     setPrimaryRoomImageIndex]     = useState(0);
  const [propertyImageInputKey, setPropertyImageInputKey] = useState(0);
  const [roomImageInputKey,     setRoomImageInputKey]     = useState(0);

  /* ── data ── */
  const propertiesState  = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const categoriesState  = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), [reloadKey]);
  const ratePlansState   = useAsync(async () => fetchAllPages<RatePlan>('/rate-plans'), [reloadKey]);
  const pricingRulesState = useAsync(async () => fetchAllPages<PricingRule>('/pricing-rules'), [reloadKey]);
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms'), [reloadKey]);
  const properties   = propertiesState.data  ?? [];
  const categories   = categoriesState.data  ?? [];
  const ratePlans    = ratePlansState.data    ?? [];
  const pricingRules = pricingRulesState.data ?? [];
  const rooms = roomsState.data ?? [];
  const activeProperties = properties.filter((p) => p.is_active);
  const isLoading = propertiesState.loading || categoriesState.loading || ratePlansState.loading || pricingRulesState.loading || roomsState.loading;
  const isLoadingProperties = propertiesState.loading && properties.length === 0;
  const loadError = propertiesState.error ?? categoriesState.error ?? ratePlansState.error ?? pricingRulesState.error ?? roomsState.error;
  const selectedPropertyId = controlledSelectedPropertyId !== undefined ? controlledSelectedPropertyId : internalSelectedPropertyId;

  function selectPropertyId(propertyId: string | null) {
    setInternalSelectedPropertyId(propertyId);
    onSelectedPropertyIdChange?.(propertyId);
    setAddingProperty(false);
  }

  function startAddingProperty() {
    setPropertyForm(defaultPropertyForm);
    setAddingProperty(true);
  }

  useEffect(() => {
    if (!embedded || isLoadingProperties || propertiesState.error || properties.length > 0 || autoOpenedCreatePropertyRef.current) return;
    autoOpenedCreatePropertyRef.current = true;
    startAddingProperty();
  }, [embedded, isLoadingProperties, propertiesState.error, properties.length]);

  /* ── auto-select first active property on load ── */
  useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      const first = properties.find((p) => p.is_active) ?? properties[0];
      selectPropertyId(first.id);
    }
  }, [properties, selectedPropertyId]);

  /* ── reset sub-panel state when switching properties ── */
  useEffect(() => {
    if (!selectedPropertyId) return;
    setCategoryForm((f)    => ({ ...defaultCategoryForm,    property_id: selectedPropertyId, name: f.name.startsWith('') ? '' : f.name }));
    setRatePlanForm(()     => ({ ...defaultRatePlanForm,    property_id: selectedPropertyId }));
    setPricingRuleForm(()  => ({ ...defaultPricingRuleForm, property_id: selectedPropertyId }));
    setPropertyImageForm((f) => ({ ...f, property_id: selectedPropertyId }));
    setEditingPricingRuleId(null);
    setEditingCategoryId(null);
    setSelectedCategoryId(null);
    setSelectedRatePlanId(null);
    setSelectedPricingRuleId(null);
    setAddingCategory(false); setAddingRatePlan(false);
    setAddingPricingRule(false); setAddingPropertyImage(false); setAddingRoomImage(false);
    rightPanelRef.current?.scrollTo({ top: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  /* ── derived / per-property ── */
  const selectedProperty    = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedIndex       = properties.findIndex((p) => p.id === selectedPropertyId);
  const selectedColor       = getColor(selectedIndex >= 0 ? selectedIndex : 0);
  const selectedCategories  = categories.filter((c) => c.property_id === selectedPropertyId);
  const selectedRatePlans   = ratePlans.filter((r) => r.property_id === selectedPropertyId);
  const selectedPricingRules = pricingRules.filter((r) => r.property_id === selectedPropertyId);
  const selectedRooms = rooms.filter((r) => r.property_id === selectedPropertyId);
  const selectedCategory = selectedCategories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedRatePlan = selectedRatePlans.find((ratePlan) => ratePlan.id === selectedRatePlanId) ?? null;
  const selectedPricingRule = selectedPricingRules.find((rule) => rule.id === selectedPricingRuleId) ?? null;
  const selectedSetup: SetupState = selectedProperty
    ? computeSetup(selectedProperty, categories, ratePlans, pricingRules, rooms)
    : { property: false, roomTypes: false, ratePlans: false, pricingRules: false, media: false, physicalRooms: false, ota: false };
  const allMediaImages = [
    ...(selectedProperty?.images ?? []).map((img) => ({ ...img, label: selectedProperty!.name, sub: 'Property photo' })),
    ...selectedCategories.flatMap((cat) => cat.images.map((img) => ({ ...img, label: cat.name, sub: 'Room type photo' }))),
  ];

  /* ── action runner ── */
  useEffect(() => {
    if (!actionStatus) return;
    const timeoutId = window.setTimeout(() => setActionStatus(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [actionStatus]);

  async function runAction(name: string, action: () => Promise<void>) {
    setActionError(null); setActionStatus(null); setPendingAction(name);
    try { await action(); } catch (err) { setActionError(getApiErrorMessage(err)); } finally { setPendingAction(null); }
  }
  function reload() { setReloadKey((v) => v + 1); }

  /* ── action handlers (preserved from original) ── */
  async function submitProperty(event: FormEvent) {
    event.preventDefault();
    await runAction('create-property', async () => {
      const { data } = await api.post<Property>('/properties', { ...propertyForm, phone: propertyForm.phone || undefined, email: propertyForm.email || undefined });
      setPropertyForm(defaultPropertyForm); setAddingProperty(false);
      setActionStatus('Property created.'); reload();
      selectPropertyId(data.id);
    });
  }
  async function togglePropertyArchive(property: Property) {
    const nextActive = !property.is_active;
    await runAction(`toggle-property:${property.id}`, async () => {
      await api.put(`/properties/${property.id}/status`, { is_active: nextActive });
      setActionStatus(nextActive ? 'Property restored.' : 'Property archived.'); reload();
    });
  }
  async function deleteProperty(property: Property) {
    if (!window.confirm(`Delete property ${property.name}? This also removes its room types, rate plans, pricing rules, rooms, inventory, and photos when no operational records depend on it.`)) return;
    await runAction(`delete-property:${property.id}`, async () => {
      await api.delete(`/properties/${property.id}`);
      const nextProperty = properties.find((candidate) => candidate.id !== property.id) ?? null;
      selectPropertyId(nextProperty?.id ?? null);
      setSelectedCategoryId(null);
      setSelectedRatePlanId(null);
      setSelectedPricingRuleId(null);
      setActionStatus('Property deleted.');
      reload();
    });
  }
  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    await runAction('create-category', async () => {
      const payload = { ...categoryForm, max_occupancy: Number(categoryForm.max_occupancy), description: categoryForm.description || undefined };
      await api.post('/room-categories', payload);
      setCategoryForm((c) => ({ ...defaultCategoryForm, property_id: c.property_id }));
      setEditingCategoryId(null);
      setSelectedCategoryId(null);
      setAddingCategory(false); setActionStatus('Room category created.'); reload();
    });
  }
  function startEditingCategory(category: RoomCategory) {
    setActionError(null); setActionStatus(null);
    setSelectedCategoryId(category.id);
    setEditingCategoryId(category.id);
    setAddingCategory(false);
    setAddingRatePlan(false);
    setAddingPricingRule(false);
    setEditingPricingRuleId(null);
    setCategoryForm({
      property_id: category.property_id,
      name: category.name,
      code: category.code,
      description: category.description ?? '',
      max_occupancy: String(category.max_occupancy),
    });
  }
  async function saveEditingCategory(category: RoomCategory) {
    await runAction('update-category', async () => {
      await api.put(`/room-categories/${category.id}`, {
        property_id: categoryForm.property_id,
        name: categoryForm.name,
        code: categoryForm.code,
        description: categoryForm.description || undefined,
        max_occupancy: Number(categoryForm.max_occupancy),
      });
      setEditingCategoryId(null);
      setSelectedCategoryId(category.id);
      setCategoryForm((f) => ({ ...defaultCategoryForm, property_id: f.property_id }));
      setActionStatus('Room category updated.');
      reload();
    });
  }
  function cancelEditingCategory() {
    setEditingCategoryId(null);
    setAddingCategory(false);
    setCategoryForm((f) => ({ ...defaultCategoryForm, property_id: f.property_id }));
  }
  async function deleteCategory(category: RoomCategory) {
    if (!window.confirm(`Delete room type ${category.name}? This only works if nothing depends on it.`)) return;
    await runAction(`delete-category:${category.id}`, async () => {
      await api.delete(`/room-categories/${category.id}`);
      if (editingCategoryId === category.id) cancelEditingCategory();
      setSelectedCategoryId(null);
      setActionStatus('Room category deleted.'); reload();
    });
  }
  async function submitRatePlan(event: FormEvent) {
    event.preventDefault();
    await runAction('create-rate-plan', async () => {
      await api.post('/rate-plans', ratePlanForm);
      setRatePlanForm((c) => ({ ...defaultRatePlanForm, property_id: c.property_id, room_category_id: c.room_category_id, currency: c.currency }));
      setAddingRatePlan(false); setActionStatus('Rate plan created.'); reload();
    });
  }
  async function deleteRatePlan(ratePlan: RatePlan) {
    if (!window.confirm(`Delete rate plan ${ratePlan.name}? Pricing rules under this plan will also be removed.`)) return;
    await runAction(`delete-rate-plan:${ratePlan.id}`, async () => {
      await api.delete(`/rate-plans/${ratePlan.id}`);
      setSelectedRatePlanId(null);
      if (pricingRuleForm.rate_plan_id === ratePlan.id) {
        setPricingRuleForm((f) => ({ ...f, rate_plan_id: '' }));
      }
      if (ratePlanForm.room_category_id === ratePlan.room_category_id) {
        setRatePlanForm((f) => ({ ...f, name: '', code: '', base_rate: '' }));
      }
      setActionStatus('Rate plan deleted.');
      reload();
    });
  }
  async function submitPricingRule(event: FormEvent) {
    event.preventDefault();
    if (pricingRuleForm.type === 'DATE_RANGE' && (!pricingRuleForm.start_date || !pricingRuleForm.end_date)) {
      setActionError('Start date and end date are required for date range rules.'); setActionStatus(null); return;
    }
    await runAction(editingPricingRuleId ? 'update-pricing-rule' : 'create-pricing-rule', async () => {
      const payload = {
        property_id: pricingRuleForm.property_id, rate_plan_id: pricingRuleForm.rate_plan_id,
        name: pricingRuleForm.name, type: pricingRuleForm.type, adjustment_percent: pricingRuleForm.adjustment_percent,
        occupancy_threshold: pricingRuleForm.type === 'OCCUPANCY' && pricingRuleForm.occupancy_threshold ? Number(pricingRuleForm.occupancy_threshold) : undefined,
        start_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.start_date || undefined : undefined,
        end_date:   pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.end_date   || undefined : undefined,
      };
      if (editingPricingRuleId) { await api.put(`/pricing-rules/${editingPricingRuleId}`, payload); }
      else                       { await api.post('/pricing-rules', payload); }
      setPricingRuleForm((c) => ({ ...defaultPricingRuleForm, property_id: c.property_id, rate_plan_id: editingPricingRuleId ? '' : c.rate_plan_id }));
      setEditingPricingRuleId(null); setSelectedPricingRuleId(null); setAddingPricingRule(false);
      setActionStatus(editingPricingRuleId ? 'Pricing rule updated.' : 'Pricing rule created.'); reload();
    });
  }
  async function saveEditingPricingRule(rule: PricingRule) {
    if (pricingRuleForm.type === 'DATE_RANGE' && (!pricingRuleForm.start_date || !pricingRuleForm.end_date)) {
      setActionError('Start date and end date are required for date range rules.'); setActionStatus(null); return;
    }
    await runAction('update-pricing-rule', async () => {
      await api.put(`/pricing-rules/${rule.id}`, {
        property_id: pricingRuleForm.property_id,
        rate_plan_id: pricingRuleForm.rate_plan_id,
        name: pricingRuleForm.name,
        type: pricingRuleForm.type,
        adjustment_percent: pricingRuleForm.adjustment_percent,
        occupancy_threshold: pricingRuleForm.type === 'OCCUPANCY' && pricingRuleForm.occupancy_threshold ? Number(pricingRuleForm.occupancy_threshold) : undefined,
        start_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.start_date || undefined : undefined,
        end_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.end_date || undefined : undefined,
      });
      setEditingPricingRuleId(null);
      setSelectedPricingRuleId(rule.id);
      setOpenPricingRuleDatePicker(null);
      setPricingRuleForm((f) => ({ ...defaultPricingRuleForm, property_id: f.property_id }));
      setActionStatus('Pricing rule updated.');
      reload();
    });
  }
  async function togglePricingRule(rule: PricingRule) {
    await runAction(`toggle-pricing-rule:${rule.id}`, async () => {
      await api.put(`/pricing-rules/${rule.id}`, { is_active: !rule.is_active });
      if (editingPricingRuleId === rule.id) { setEditingPricingRuleId(null); setPricingRuleForm(defaultPricingRuleForm); setAddingPricingRule(false); }
      setSelectedPricingRuleId(rule.id);
      setActionStatus(`Pricing rule ${!rule.is_active ? 'enabled' : 'disabled'}.`); reload();
    });
  }
  async function deletePricingRule(rule: PricingRule) {
    if (!window.confirm(`Delete pricing rule ${rule.name}?`)) return;
    await runAction(`delete-pricing-rule:${rule.id}`, async () => {
      await api.delete(`/pricing-rules/${rule.id}`);
      if (editingPricingRuleId === rule.id) { setEditingPricingRuleId(null); setPricingRuleForm(defaultPricingRuleForm); setAddingPricingRule(false); }
      setSelectedPricingRuleId(null);
      setActionStatus('Pricing rule deleted.'); reload();
    });
  }
  function startEditingPricingRule(rule: PricingRule) {
    setActionError(null); setActionStatus(null);
    setSelectedPricingRuleId(rule.id);
    setEditingPricingRuleId(rule.id); setAddingPricingRule(false);
    setPricingRuleForm({ property_id: rule.property_id, rate_plan_id: rule.rate_plan_id, name: rule.name, type: rule.type, adjustment_percent: String(rule.adjustment_percent), start_date: rule.start_date ?? '', end_date: rule.end_date ?? '', occupancy_threshold: rule.occupancy_threshold == null ? '' : String(rule.occupancy_threshold) });
  }
  function cancelEditingPricingRule() {
    setEditingPricingRuleId(null); setAddingPricingRule(false);
    setPricingRuleForm((f) => ({ ...defaultPricingRuleForm, property_id: f.property_id }));
  }
  async function submitPropertyImage(event: FormEvent) {
    event.preventDefault(); if (propertyImageFiles.length === 0) return;
    const pi = Math.min(primaryPropertyImageIndex, propertyImageFiles.length - 1);
    await runAction('upload-property-image', async () => {
      for (let i = 0; i < propertyImageFiles.length; i++) {
        const fd = new FormData(); fd.append('image', propertyImageFiles[i]); fd.append('caption', propertyImageForm.caption); fd.append('is_primary', String(i === pi));
        await api.post(`/properties/${propertyImageForm.property_id}/images`, fd);
      }
      setPropertyImageForm((f) => ({ ...f, caption: '' })); setPropertyImageFiles([]); setPrimaryPropertyImageIndex(0); setPropertyImageInputKey((v) => v + 1); setAddingPropertyImage(false);
      setActionStatus(`${propertyImageFiles.length} property photo${propertyImageFiles.length === 1 ? '' : 's'} uploaded.`); reload();
    });
  }
  async function submitRoomImage(event: FormEvent) {
    event.preventDefault(); if (roomImageFiles.length === 0) return;
    const pi = Math.min(primaryRoomImageIndex, roomImageFiles.length - 1);
    await runAction('upload-room-image', async () => {
      for (let i = 0; i < roomImageFiles.length; i++) {
        const fd = new FormData(); fd.append('image', roomImageFiles[i]); fd.append('caption', roomImageForm.caption); fd.append('is_primary', String(i === pi));
        await api.post(`/room-categories/${roomImageForm.room_category_id}/images`, fd);
      }
      setRoomImageForm({ room_category_id: '', caption: '', is_primary: true }); setRoomImageFiles([]); setPrimaryRoomImageIndex(0); setRoomImageInputKey((v) => v + 1); setAddingRoomImage(false);
      setActionStatus(`${roomImageFiles.length} room category photo${roomImageFiles.length === 1 ? '' : 's'} uploaded.`); reload();
    });
  }
  function mediaUrl(url: string) { return `${(api.defaults.baseURL ?? '').replace(/\/$/, '')}${url}`; }

  /* ── render ── */
  return (
    <div className={embedded ? 'flex h-full min-h-0 overflow-hidden' : '-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex h-[calc(100dvh-3rem)] overflow-hidden'}>

      {/* ══ Left rail ══════════════════════════════════════════════ */}
      <aside className={`${embedded ? 'w-[292px] bg-[#eeede9] border-r border-black/[0.06]' : 'w-[268px] bg-[#eeede9] border-r border-black/[0.06]'} flex-shrink-0 flex flex-col h-full overflow-hidden`}>

        {/* Rail header */}
        <div className="px-4 pt-5 pb-4 flex items-center justify-between flex-shrink-0 border-b border-black/[0.06]">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-0.5">{embedded ? 'Setup step 1' : 'Admin'}</p>
            <h2 className="text-[15px] font-bold text-slate-900 leading-tight">Properties</h2>
          </div>
          {!embedded && (
            <button type="button" onClick={() => setAddingProperty((v) => !v)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-light transition-colors bg-white border border-black/[0.08] text-slate-600 hover:bg-slate-50">
              {addingProperty ? '×' : '+'}
            </button>
          )}
        </div>

        {/* Property list */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 py-2">
          {isLoadingProperties && (
            <p className="text-[11px] text-slate-400 px-3 py-4">Loading…</p>
          )}
          {!isLoadingProperties && properties.map((p, idx) => {
            const col   = getColor(idx);
            const setup = computeSetup(p, categories, ratePlans, pricingRules, rooms);
            const done  = SETUP_STEPS.filter((s) => isSetupStepComplete(setup, s.key)).length;
            const total = SETUP_STEPS.length;
            const active = p.id === selectedPropertyId;
            return (
              <button key={p.id} type="button" onClick={() => selectPropertyId(p.id)}
                className={`w-full text-left rounded-xl px-3 py-3 flex items-center gap-3 transition-all ${active ? 'bg-white shadow-sm border border-emerald-200' : 'hover:bg-white/70'}`}>
                <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${col.bg}`}>
                  {p.code.slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12.5px] font-bold text-slate-900 truncate">{p.name}</span>
                    {!p.is_active && <span className="text-[9.5px] font-semibold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded flex-shrink-0">Archived</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {SETUP_STEPS.map((step) => (
                        <div key={step.key} className={`w-3.5 h-1 rounded-full ${isSetupStepComplete(setup, step.key) ? SETUP_PROGRESS_COLOR.bar : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">{done}/{total}</span>
                  </div>
                </div>
                <HealthRing done={done} total={total} ring={SETUP_PROGRESS_COLOR.ring} />
              </button>
            );
          })}
          {embedded && !isLoadingProperties && (
            <button
              className="mt-5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[11.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={startAddingProperty}
              type="button"
            >
              <span className="text-base font-light leading-none">+</span>
              {properties.length > 0 ? 'Add new property' : 'Add property'}
            </button>
          )}
        </div>

        {/* Bottom stats */}
        <div className={`px-4 py-3 space-y-1 flex-shrink-0 border-t border-black/[0.06] ${embedded ? 'bg-white/45' : ''}`}>
          {[
            { l: 'Active properties', v: activeProperties.length },
            { l: 'Total room types',  v: categories.length },
            { l: 'Total rate plans',  v: ratePlans.length },
          ].map((s) => (
            <div key={s.l} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{s.l}</span>
              <span className="text-[11px] font-bold text-slate-800">{s.v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ══ Right panel ════════════════════════════════════════════ */}
      <div ref={rightPanelRef} className="h-full min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6 scrollbar-none lg:p-8">

        {actionStatus && (
          <div className="fixed right-5 top-5 z-50 w-[min(24rem,calc(100vw-2.5rem))]">
            <SuccessMsg>{actionStatus}</SuccessMsg>
          </div>
        )}
        {actionError  && <ErrorMsg>{actionError}</ErrorMsg>}
        {loadError    && <ErrorMsg>{loadError}</ErrorMsg>}

        {isLoading && (
          <LoadingMsg>Loading property data…</LoadingMsg>
        )}

        {!isLoading && embedded && addingProperty && (
          <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={submitProperty}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">New property</p>
                <h3 className="mt-0.5 text-[15px] font-bold text-slate-900">Add property details</h3>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60" disabled={pendingAction === 'create-property'} type="submit">
                  {pendingAction === 'create-property' ? 'Creating…' : 'Create property'}
                </button>
                {properties.length > 0 && (
                  <button className="text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-800" onClick={() => setAddingProperty(false)} type="button">
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className={labelCls}><span>Property name</span>
                <input className={inputCls} value={propertyForm.name} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} placeholder="Harbour Residency" required />
              </label>
              <label className={labelCls}><span>Code</span>
                <input className={inputCls} value={propertyForm.code} onChange={(e) => setPropertyForm({ ...propertyForm, code: e.target.value })} placeholder="HARBOUR" required />
              </label>
              <label className={labelCls}><span>Timezone</span>
                <CustomSelect
                  value={propertyForm.timezone}
                  onChange={(timezone) => setPropertyForm({ ...propertyForm, timezone })}
                  options={TIMEZONE_OPTIONS}
                  placeholder="Select timezone"
                />
              </label>
              <div className="md:col-span-3">
                <label className={`${labelCls} w-full max-w-lg`}><span>Address</span>
                  <input className={`${inputCls} h-11`} value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} placeholder="Mumbai, Maharashtra" required />
                </label>
              </div>
            </div>
          </form>
        )}

        {!isLoading && !(embedded && addingProperty) && !selectedProperty && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-[14px] font-semibold text-slate-500 mb-1">No property selected</p>
            <p className="text-[12px] text-slate-400">{embedded ? 'Use the Add property button in the sidebar to create your first property.' : 'Use the + button in the sidebar to create your first property.'}</p>
          </div>
        )}

        {!isLoading && selectedProperty && (
          <>
            {/* Property header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${selectedColor.bg}`}>
                  {selectedProperty.code.slice(0, 3)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-none">{selectedProperty.name}</h1>
                    <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${selectedProperty.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {selectedProperty.is_active ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500">{selectedProperty.address ?? 'No address'} · {selectedProperty.timezone}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button type="button" disabled={pendingAction === `toggle-property:${selectedProperty.id}`}
                  onClick={() => void togglePropertyArchive(selectedProperty)}
                  className={`h-8 px-3 rounded-lg text-[11.5px] font-semibold border transition-colors disabled:opacity-50 ${selectedProperty.is_active ? 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50' : 'border-emerald-100 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                  {pendingAction === `toggle-property:${selectedProperty.id}` ? 'Saving…' : selectedProperty.is_active ? 'Archive' : 'Restore'}
                </button>
                <button type="button" disabled={pendingAction === `delete-property:${selectedProperty.id}`}
                  onClick={() => void deleteProperty(selectedProperty)}
                  className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-rose-100 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50 transition-colors">
                  {pendingAction === `delete-property:${selectedProperty.id}` ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Setup progress bar */}
            <SetupBar setup={selectedSetup} />

            {/* Lifecycle action */}
            {/* <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white px-5 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Property management</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {selectedProperty.is_active
                    ? 'Archive this property when it should no longer appear in active operations.'
                    : 'Restore this property to make it available in active operations again.'}
                </p>
              </div>
              <button type="button" disabled={pendingAction === `toggle-property:${selectedProperty.id}`}
                onClick={() => void togglePropertyArchive(selectedProperty)}
                className={`h-8 px-3 rounded-lg text-[11.5px] font-semibold border transition-colors disabled:opacity-50 ${selectedProperty.is_active ? 'border-rose-100 text-rose-600 bg-white hover:bg-rose-50 hover:border-rose-200' : 'border-emerald-100 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                {pendingAction === `toggle-property:${selectedProperty.id}` ? 'Saving…' : selectedProperty.is_active ? 'Archive property' : 'Restore property'}
              </button>
            </div> */}

            {/* ── Room types ── */}
            <SectionCard
              eyebrow="Inventory"
              title={`${selectedCategories.length} room type${selectedCategories.length !== 1 ? 's' : ''}`}
              badge={selectedSetup.roomTypes ? '✓ Configured' : '✗ Missing'}
              badgeTone={selectedSetup.roomTypes ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}
              onAdd={() => {
                if (addingCategory && editingCategoryId) {
                  cancelEditingCategory();
                  return;
                }
                setAddingCategory((v) => !v);
                setEditingCategoryId(null);
                setCategoryForm((f) => ({ ...defaultCategoryForm, property_id: f.property_id || selectedProperty.id }));
                setAddingRatePlan(false); setAddingPricingRule(false); setEditingPricingRuleId(null);
              }}
              adding={addingCategory}
              actions={
                <div className="flex items-center gap-2">
                  <button type="button" disabled={!selectedCategory} onClick={() => selectedCategory && (editingCategoryId === selectedCategory.id ? cancelEditingCategory() : startEditingCategory(selectedCategory))}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {editingCategoryId === selectedCategory?.id ? 'Cancel edit' : 'Edit'}
                  </button>
                  <button type="button" disabled={!selectedCategory || pendingAction === `delete-category:${selectedCategory?.id}`}
                    onClick={() => selectedCategory && void deleteCategory(selectedCategory)}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-rose-100 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Delete
                  </button>
                </div>
              }
              addForm={
                <form onSubmit={submitCategory} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className={labelCls}><span>Category name</span>
                    <input className={inputCls} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Deluxe" required />
                  </label>
                  <label className={labelCls}><span>Code</span>
                    <input className={inputCls} value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })} placeholder="DELUXE" required />
                  </label>
                  <label className={labelCls}><span>Max occupancy</span>
                    <input className={inputCls} type="number" min="1" value={categoryForm.max_occupancy} onChange={(e) => setCategoryForm({ ...categoryForm, max_occupancy: e.target.value })} placeholder="2" required />
                  </label>
                  <div className="flex items-end">
                    <button className={primaryBtn} disabled={pendingAction === 'create-category'} type="submit">
                      {pendingAction === 'create-category' ? 'Saving…' : 'Add room type'}
                    </button>
                  </div>
                </form>
              }>
              {selectedCategories.length === 0
                ? <div className="py-10 text-center text-[12px] text-slate-400 font-medium">No room types yet — add the first one above.</div>
                : <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px]">
                      <thead><tr className="bg-slate-50/80 border-b border-slate-100">
                        {['Name', 'Code', 'Max occ.', 'Rate plans', ''].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {selectedCategories.map((cat) => {
                          const planCount = selectedRatePlans.filter((r) => r.room_category_id === cat.id).length;
                          const active = selectedCategoryId === cat.id;
                          const editing = editingCategoryId === cat.id;
                          return (
                            <tr key={cat.id} onClick={() => setSelectedCategoryId((current) => current === cat.id ? null : cat.id)}
                              className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${editing || active ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-100' : 'hover:bg-slate-50/60'}`}>
                              <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-900">
                                {editing
                                  ? <input className={inlineInputCls} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} onClick={(e) => e.stopPropagation()} required />
                                  : cat.name}
                              </td>
                              <td className="px-4 py-3">
                                {editing
                                  ? <input className={`${inlineInputCls} font-mono uppercase`} value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })} onClick={(e) => e.stopPropagation()} required />
                                  : <span className="font-mono text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{cat.code}</span>}
                              </td>
                              <td className="px-4 py-3 text-[12.5px] text-slate-600">
                                {editing
                                  ? <input className={`${inlineInputCls} max-w-24`} type="number" min="1" value={categoryForm.max_occupancy} onChange={(e) => setCategoryForm({ ...categoryForm, max_occupancy: e.target.value })} onClick={(e) => e.stopPropagation()} required />
                                  : `${cat.max_occupancy} guests`}
                              </td>
                              <td className="px-4 py-3"><span className="text-[12px] font-semibold text-teal-700">{planCount} plan{planCount !== 1 ? 's' : ''}</span></td>
                              <td className="px-4 py-3 text-right">
                                {editing && (
                                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" disabled={pendingAction === 'update-category'} onClick={() => void saveEditingCategory(cat)}
                                      className="h-8 px-3 rounded-lg bg-emerald-600 text-[11.5px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                                      {pendingAction === 'update-category' ? 'Saving…' : 'Save'}
                                    </button>
                                    <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[11.5px] font-semibold text-slate-700 transition hover:bg-slate-50" onClick={cancelEditingCategory}>
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </SectionCard>

            {/* ── Rate plans ── */}
            <SectionCard
              eyebrow="Rates"
              title={`${selectedRatePlans.length} rate plan${selectedRatePlans.length !== 1 ? 's' : ''}`}
              badge={selectedSetup.ratePlans ? '✓ Configured' : '✗ Missing'}
              badgeTone={selectedSetup.ratePlans ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}
              onAdd={() => { setAddingRatePlan((v) => !v); setAddingCategory(false); setAddingPricingRule(false); setEditingPricingRuleId(null); }}
              adding={addingRatePlan}
              actions={
                <button type="button" disabled={!selectedRatePlan || pendingAction === `delete-rate-plan:${selectedRatePlan?.id}`}
                  onClick={() => selectedRatePlan && void deleteRatePlan(selectedRatePlan)}
                  className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-rose-100 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  {pendingAction === `delete-rate-plan:${selectedRatePlan?.id}` ? 'Deleting…' : 'Delete'}
                </button>
              }
              addForm={
                <form onSubmit={submitRatePlan} className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  <label className={labelCls}><span>Room type</span>
                    <CustomSelect value={ratePlanForm.room_category_id} onChange={(v) => setRatePlanForm({ ...ratePlanForm, room_category_id: v })} options={selectedCategories.map((c) => ({ label: c.name, value: c.id }))} placeholder="Select type" />
                  </label>
                  <label className={labelCls}><span>Plan name</span>
                    <input className={inputCls} value={ratePlanForm.name} onChange={(e) => setRatePlanForm({ ...ratePlanForm, name: e.target.value })} placeholder="Flexible" required />
                  </label>
                  <label className={labelCls}><span>Code</span>
                    <input className={inputCls} value={ratePlanForm.code} onChange={(e) => setRatePlanForm({ ...ratePlanForm, code: e.target.value })} placeholder="DELUXE-FLEX" required />
                  </label>
                  <label className={labelCls}><span>Base rate</span>
                    <input className={inputCls} type="number" min="0" step="0.01" value={ratePlanForm.base_rate} onChange={(e) => setRatePlanForm({ ...ratePlanForm, base_rate: e.target.value })} placeholder="7500" required />
                  </label>
                  <div className="flex items-end">
                    <button className={primaryBtn} disabled={pendingAction === 'create-rate-plan'} type="submit">
                      {pendingAction === 'create-rate-plan' ? 'Adding…' : 'Add rate plan'}
                    </button>
                  </div>
                </form>
              }>
              {selectedRatePlans.length === 0
                ? <div className="py-10 text-center text-[12px] text-slate-400 font-medium">No rate plans yet — add room types first, then add rates.</div>
                : <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead><tr className="bg-slate-50/80 border-b border-slate-100">
                        {['Room type', 'Plan', 'Code', 'Base rate', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {selectedRatePlans.map((rp) => {
                          const active = selectedRatePlanId === rp.id;
                          return (
                            <tr key={rp.id} onClick={() => setSelectedRatePlanId((current) => current === rp.id ? null : rp.id)}
                              className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${active ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-100' : 'hover:bg-slate-50/60'}`}>
                              <td className="px-4 py-3 text-[12px] text-slate-500">{rp.room_category.name}</td>
                              <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-900">{rp.name}</td>
                              <td className="px-4 py-3"><span className="font-mono text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{rp.code}</span></td>
                              <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-800">{formatCurrency(rp.base_rate)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${rp.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${rp.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {rp.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </SectionCard>

            {/* ── Pricing rules ── */}
            <SectionCard
              eyebrow="Dynamic pricing"
              title={`${selectedPricingRules.length} pricing rule${selectedPricingRules.length !== 1 ? 's' : ''}`}
              badge={selectedSetup.pricingRules ? '✓ Configured' : '— None yet'}
              badgeTone={selectedSetup.pricingRules ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}
              onAdd={() => {
                if (addingPricingRule && !editingPricingRuleId) { setAddingPricingRule(false); }
                else { setAddingPricingRule(true); setEditingPricingRuleId(null); setSelectedPricingRuleId(null); setPricingRuleForm((f) => ({ ...defaultPricingRuleForm, property_id: f.property_id })); }
                setAddingCategory(false); setAddingRatePlan(false);
              }}
              adding={addingPricingRule}
              actions={
                <div className="flex items-center gap-2">
                  <button type="button" disabled={!selectedPricingRule} onClick={() => selectedPricingRule && (editingPricingRuleId === selectedPricingRule.id ? cancelEditingPricingRule() : startEditingPricingRule(selectedPricingRule))}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {editingPricingRuleId === selectedPricingRule?.id ? 'Cancel edit' : 'Edit'}
                  </button>
                  <button type="button" disabled={!selectedPricingRule || pendingAction === `toggle-pricing-rule:${selectedPricingRule?.id}`}
                    onClick={() => selectedPricingRule && void togglePricingRule(selectedPricingRule)}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {pendingAction === `toggle-pricing-rule:${selectedPricingRule?.id}`
                      ? 'Saving…'
                      : selectedPricingRule?.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" disabled={!selectedPricingRule || pendingAction === `delete-pricing-rule:${selectedPricingRule?.id}`}
                    onClick={() => selectedPricingRule && void deletePricingRule(selectedPricingRule)}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-rose-100 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {pendingAction === `delete-pricing-rule:${selectedPricingRule?.id}` ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              }
              addForm={
                <div>
                  <form onSubmit={submitPricingRule} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                      <label className={labelCls}><span>Rate plan</span>
                        <CustomSelect value={pricingRuleForm.rate_plan_id} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, rate_plan_id: v })} options={selectedRatePlans.map((r) => ({ label: `${r.room_category.name} · ${r.name}`, value: r.id }))} placeholder="Select rate plan" />
                      </label>
                      <label className={labelCls}><span>Rule name</span>
                        <input className={inputCls} value={pricingRuleForm.name} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, name: e.target.value })} placeholder="Weekend surcharge" required />
                      </label>
                      <label className={labelCls}><span>Rule type</span>
                        <CustomSelect value={pricingRuleForm.type} onChange={(v) => { setPricingRuleForm({ ...pricingRuleForm, type: v, start_date: '', end_date: '', occupancy_threshold: '' }); setOpenPricingRuleDatePicker(null); }} options={[{ label: 'Weekend', value: 'WEEKEND' }, { label: 'Festival / date range', value: 'DATE_RANGE' }, { label: 'Occupancy surge', value: 'OCCUPANCY' }]} />
                      </label>
                      <label className={labelCls}><span>Adjustment %</span>
                        <input className={inputCls} type="number" step="0.01" value={pricingRuleForm.adjustment_percent} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, adjustment_percent: e.target.value })} placeholder="20 or -10" required />
                      </label>
                      {pricingRuleForm.type === 'DATE_RANGE' && (
                        <div className="col-span-2 grid max-w-[25rem] grid-cols-1 gap-2 sm:grid-cols-2">
                          <CalendarDatePickerField label="Start date" value={pricingRuleForm.start_date} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, start_date: v })} open={openPricingRuleDatePicker === 'start'} setOpen={(o) => setOpenPricingRuleDatePicker(o ? 'start' : null)} />
                          <CalendarDatePickerField align="right" label="End date" value={pricingRuleForm.end_date} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, end_date: v })} open={openPricingRuleDatePicker === 'end'} setOpen={(o) => setOpenPricingRuleDatePicker(o ? 'end' : null)} />
                        </div>
                      )}
                      {pricingRuleForm.type === 'OCCUPANCY' && (
                        <label className={labelCls}><span>Occupancy threshold %</span>
                          <input className={inputCls} type="number" min="1" max="100" value={pricingRuleForm.occupancy_threshold} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, occupancy_threshold: e.target.value })} placeholder="70" required />
                        </label>
                      )}
                    </div>
                    <div className="flex justify-end border-t border-slate-200 pt-4">
                      <button className={primaryBtn} disabled={pendingAction === 'create-pricing-rule' || pendingAction === 'update-pricing-rule'} type="submit">
                        {pendingAction === 'create-pricing-rule' ? 'Adding…' : 'Add rule'}
                      </button>
                    </div>
                  </form>
                </div>
              }>
              {selectedPricingRules.length === 0
                ? <div className="py-10 text-center text-[12px] text-slate-400 font-medium">No pricing rules — rate plans will use base rate only.</div>
                : <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead><tr className="bg-slate-50/80 border-b border-slate-100">
                        {['Rule', 'Rate plan', 'Type', 'Adjustment', 'Condition', 'Status', ''].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {selectedPricingRules.map((rule) => {
                          const active = selectedPricingRuleId === rule.id;
                          const editing = editingPricingRuleId === rule.id;
                          return (
                            <tr key={rule.id} onClick={() => setSelectedPricingRuleId((current) => current === rule.id ? null : rule.id)}
                              className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${editing || active ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-100' : 'hover:bg-slate-50/60'}`}>
                              <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-900">
                                {editing
                                  ? <input className={inlineInputCls} value={pricingRuleForm.name} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, name: e.target.value })} onClick={(e) => e.stopPropagation()} required />
                                  : rule.name}
                              </td>
                              <td className="px-4 py-3 text-[11.5px] text-slate-600">
                                {editing
                                  ? <div onClick={(e) => e.stopPropagation()}><CustomSelect value={pricingRuleForm.rate_plan_id} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, rate_plan_id: v })} options={selectedRatePlans.map((r) => ({ label: `${r.room_category.name} · ${r.name}`, value: r.id }))} placeholder="Rate plan" /></div>
                                  : <>
                                      {rule.rate_plan.room_category.name}
                                      <span className="block font-mono text-[10px] text-slate-400">{rule.rate_plan.code}</span>
                                    </>}
                              </td>
                              <td className="px-4 py-3">
                                {editing
                                  ? <div onClick={(e) => e.stopPropagation()}><CustomSelect value={pricingRuleForm.type} onChange={(v) => { setPricingRuleForm({ ...pricingRuleForm, type: v as PricingRuleType, start_date: '', end_date: '', occupancy_threshold: '' }); setOpenPricingRuleDatePicker(null); }} options={[{ label: 'Weekend', value: 'WEEKEND' }, { label: 'Date range', value: 'DATE_RANGE' }, { label: 'Occupancy', value: 'OCCUPANCY' }]} /></div>
                                  : <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${TYPE_CHIP[rule.type] ?? 'bg-slate-50 text-slate-600'}`}>{TYPE_LABEL[rule.type] ?? rule.type}</span>}
                              </td>
                              <td className="px-4 py-3 text-[13px] font-bold">
                                {editing
                                  ? <input className={`${inlineInputCls} max-w-24`} type="number" step="0.01" value={pricingRuleForm.adjustment_percent} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, adjustment_percent: e.target.value })} onClick={(e) => e.stopPropagation()} required />
                                  : <span className={rule.adjustment_percent > 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatAdjustmentPercent(rule.adjustment_percent)}</span>}
                              </td>
                              <td className="px-4 py-3 text-[11.5px] text-slate-500">
                                {editing && pricingRuleForm.type === 'WEEKEND' && <span className="font-semibold text-slate-500">Sat / Sun</span>}
                                {editing && pricingRuleForm.type === 'OCCUPANCY' && (
                                  <input className={`${inlineInputCls} max-w-28`} type="number" min="1" max="100" value={pricingRuleForm.occupancy_threshold} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, occupancy_threshold: e.target.value })} onClick={(e) => e.stopPropagation()} placeholder="70" required />
                                )}
                                {editing && pricingRuleForm.type === 'DATE_RANGE' && (
                                  <div className="flex min-w-[17rem] items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <InlineCalendarDatePicker value={pricingRuleForm.start_date} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, start_date: v })} open={openPricingRuleDatePicker === 'start'} setOpen={(o) => setOpenPricingRuleDatePicker(o ? 'start' : null)} />
                                    <InlineCalendarDatePicker align="right" value={pricingRuleForm.end_date} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, end_date: v })} open={openPricingRuleDatePicker === 'end'} setOpen={(o) => setOpenPricingRuleDatePicker(o ? 'end' : null)} />
                                  </div>
                                )}
                                {!editing && rule.type === 'WEEKEND' && 'Sat / Sun'}
                                {!editing && rule.type === 'OCCUPANCY' && rule.occupancy_threshold != null && `Occupancy >= ${rule.occupancy_threshold}%`}
                                {!editing && rule.type === 'DATE_RANGE' && rule.start_date && rule.end_date && `${formatDatePickerLabel(rule.start_date)} - ${formatDatePickerLabel(rule.end_date)}`}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${rule.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {rule.is_active ? 'Active' : 'Off'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {editing && (
                                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" disabled={pendingAction === 'update-pricing-rule'} onClick={() => void saveEditingPricingRule(rule)}
                                      className="h-8 px-3 rounded-lg bg-emerald-600 text-[11.5px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                                      {pendingAction === 'update-pricing-rule' ? 'Saving…' : 'Save'}
                                    </button>
                                    <button type="button" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[11.5px] font-semibold text-slate-700 transition hover:bg-slate-50" onClick={cancelEditingPricingRule}>
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </SectionCard>

            {/* ── Media ── */}
            <SectionCard
              eyebrow="Media"
              title={allMediaImages.length > 0 ? `${allMediaImages.length} photos` : 'No photos yet'}
              badge={selectedSetup.media ? '✓ Uploaded' : 'Optional'}
              badgeTone={selectedSetup.media ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
              {/* Gallery */}
              {allMediaImages.length > 0 && (
                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 border-b border-slate-100">
                  {allMediaImages.map((img) => (
                    <article key={img.id} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                      <img alt={img.label} className="w-full h-28 object-cover" src={mediaUrl(img.url)} />
                      <div className="p-2.5">
                        <strong className="text-xs font-bold text-slate-900 block truncate">{img.label}</strong>
                        <span className="text-[11px] text-slate-500 truncate block">{img.sub}{img.is_primary ? ' · Primary' : ''}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {/* Upload toggles */}
              <div className="p-5 space-y-3">
                {/* Property photos */}
                <div className="border border-black/[0.06] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50/60">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Property photos</p>
                    <button type="button" onClick={() => setAddingPropertyImage((v) => !v)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all flex items-center gap-1">
                      <span>{addingPropertyImage ? '×' : '+'}</span> {addingPropertyImage ? 'Cancel' : 'Upload'}
                    </button>
                  </div>
                  {addingPropertyImage && (
                    <form onSubmit={submitPropertyImage} className="px-4 py-4 space-y-3 border-t border-dashed border-slate-200">
                      <label className={labelCls}><span>Caption</span>
                        <input className={inputCls} value={propertyImageForm.caption} onChange={(e) => setPropertyImageForm({ ...propertyImageForm, caption: e.target.value })} placeholder="Front exterior" />
                      </label>
                      <div className={labelCls}><span>Image</span>
                        <FileUploadBox files={propertyImageFiles} id="property-image-upload" inputKey={propertyImageInputKey} onFilesChange={(f) => { setPropertyImageFiles(f); setPrimaryPropertyImageIndex(0); }} onPrimaryIndexChange={setPrimaryPropertyImageIndex} primaryIndex={primaryPropertyImageIndex} />
                      </div>
                      <button className={primaryBtn} disabled={pendingAction === 'upload-property-image' || propertyImageFiles.length === 0} type="submit">
                        {pendingAction === 'upload-property-image' ? 'Uploading…' : propertyImageFiles.length > 1 ? `Upload ${propertyImageFiles.length} photos` : 'Upload photo'}
                      </button>
                    </form>
                  )}
                </div>
                {/* Room type photos */}
                <div className="border border-black/[0.06] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50/60">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Room type photos</p>
                    <button type="button" onClick={() => setAddingRoomImage((v) => !v)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all flex items-center gap-1">
                      <span>{addingRoomImage ? '×' : '+'}</span> {addingRoomImage ? 'Cancel' : 'Upload'}
                    </button>
                  </div>
                  {addingRoomImage && (
                    <form onSubmit={submitRoomImage} className="px-4 py-4 space-y-3 border-t border-dashed border-slate-200">
                      <label className={labelCls}><span>Room category</span>
                        <CustomSelect value={roomImageForm.room_category_id} onChange={(v) => setRoomImageForm({ ...roomImageForm, room_category_id: v })} options={selectedCategories.map((c) => ({ label: c.name, value: c.id }))} placeholder="Select category" />
                      </label>
                      <label className={labelCls}><span>Caption</span>
                        <input className={inputCls} value={roomImageForm.caption} onChange={(e) => setRoomImageForm({ ...roomImageForm, caption: e.target.value })} placeholder="Deluxe king bed" />
                      </label>
                      <div className={labelCls}><span>Image</span>
                        <FileUploadBox files={roomImageFiles} id="room-image-upload" inputKey={roomImageInputKey} onFilesChange={(f) => { setRoomImageFiles(f); setPrimaryRoomImageIndex(0); }} onPrimaryIndexChange={setPrimaryRoomImageIndex} primaryIndex={primaryRoomImageIndex} />
                      </div>
                      <button className={primaryBtn} disabled={pendingAction === 'upload-room-image' || roomImageFiles.length === 0} type="submit">
                        {pendingAction === 'upload-room-image' ? 'Uploading…' : roomImageFiles.length > 1 ? `Upload ${roomImageFiles.length} photos` : 'Upload photo'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ── Rooms / OTA gate ── */}
            {selectedSetup.physicalRooms
              ? <OtaGate onConfigureOta={onConfigureOta} setup={selectedSetup} colorBg={selectedColor.bg} />
              : <RoomsGate onAddRooms={onAddRooms ?? (() => {})} roomCount={selectedRooms.length} setup={selectedSetup} colorBg={selectedColor.bg} />
            }
          </>
        )}
      </div>

      {addingProperty && !embedded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]">
          <button
            aria-label="Close create property dialog"
            className="absolute inset-0 cursor-default"
            onClick={() => setAddingProperty(false)}
            type="button"
          />
          <form
            onSubmit={submitProperty}
            className="relative w-full max-w-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">New property</p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Create property</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">Add the hotel profile first, then configure room types, rates, and OTA readiness.</p>
              </div>
              <button
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setAddingProperty(false)}
                type="button"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
              <label className={`${labelCls} sm:col-span-2`}><span>Property name</span>
                <input className={inputCls} value={propertyForm.name} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} placeholder="Harbour Residency" required />
              </label>
              <label className={labelCls}><span>Code</span>
                <input className={inputCls} value={propertyForm.code} onChange={(e) => setPropertyForm({ ...propertyForm, code: e.target.value })} placeholder="HARBOUR" required />
              </label>
              <label className={labelCls}><span>Timezone</span>
                <CustomSelect
                  value={propertyForm.timezone}
                  onChange={(timezone) => setPropertyForm({ ...propertyForm, timezone })}
                  options={TIMEZONE_OPTIONS}
                  placeholder="Select timezone"
                />
              </label>
              <label className={`${labelCls} sm:col-span-2`}><span>Address</span>
                <textarea className={`${inputCls} min-h-24 resize-none`} value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} placeholder="Mumbai, Maharashtra" required />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button className={secondaryBtn} onClick={() => setAddingProperty(false)} type="button">Cancel</button>
              <button className={primaryBtn} disabled={pendingAction === 'create-property'} type="submit">
                {pendingAction === 'create-property' ? 'Creating…' : 'Create property'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── File upload box ─────────────────────────────────────────── */
function FileUploadBox({ files, id, inputKey, onFilesChange, onPrimaryIndexChange, primaryIndex }: {
  files: File[]; id: string; inputKey: number;
  onFilesChange: (files: File[]) => void; onPrimaryIndexChange: (index: number) => void; primaryIndex: number;
}) {
  const inputId = `${id}-${inputKey}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => { previews.forEach((p) => URL.revokeObjectURL(p.url)); }, [previews]);
  return (
    <div className="space-y-3">
      <input accept="image/*" className="sr-only" id={inputId} key={inputKey} ref={inputRef} multiple onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))} type="file" />
      <div className="rounded-xl border border-slate-100 bg-white p-2">
        <div className="grid grid-cols-3 gap-2">
          {files.length === 0
            ? <button className="col-span-full flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition hover:border-emerald-300 hover:bg-emerald-50/50" onClick={() => inputRef.current?.click()} type="button">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-500">+</span>
                <span className="text-sm font-bold text-slate-700">Add images</span>
                <span className="mt-1 text-[11px] font-medium text-slate-400">Upload JPG or PNG</span>
              </button>
            : previews.map((preview, index) => (
                <button className={`group relative min-h-20 cursor-pointer overflow-hidden rounded-lg border bg-slate-50 text-left ${primaryIndex === index ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'}`} key={`${preview.file.name}-${preview.file.size}-${index}`} onClick={() => onPrimaryIndexChange(index)} type="button">
                  <img alt={preview.file.name} className="h-20 w-full object-cover" src={preview.url} />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-950/65 px-2 py-1.5 text-[11px] font-semibold text-white"><span className="block truncate">{preview.file.name}</span></span>
                  <a aria-label={`Review ${preview.file.name}`} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 hover:bg-slate-100" href={preview.url} onClick={(e) => e.stopPropagation()} rel="noreferrer" target="_blank"><EyeIcon className="h-3.5 w-3.5" /></a>
                </button>
              ))
          }
        </div>
        {files.length > 0 && <p className="px-1 pt-2 text-[11px] font-medium text-slate-400">Select one image as primary before uploading.</p>}
      </div>
    </div>
  );
}

function formatAdjustmentPercent(value: number) { return `${value > 0 ? '+' : ''}${value}%`; }
function EyeIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}
