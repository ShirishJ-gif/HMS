import { FormEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { PricingRule, Property, RatePlan, RoomCategory } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

const pageWrap = 'relative mx-auto max-w-[min(100%,84rem)]';

const labelCls = 'grid gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-500';

const inputCls =
  'w-full rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15';

const textareaCls = `${inputCls} min-h-[5.5rem] resize-y leading-relaxed`;

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/25 outline-none ring-1 ring-white/25 transition hover:brightness-110 hover:shadow-xl active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

const btnSecondary =
  'inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40';

const btnDanger = 'border-rose-200/90 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100';

const tableShell =
  'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_24px_55px_-18px_rgba(15,23,42,0.14)] ring-1 ring-white/90';

function FormShell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.2)] backdrop-blur-xl ring-1 ring-slate-200/50 sm:p-7">
      <div aria-hidden className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/10 via-transparent to-teal-400/10 blur-2xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function FormSectionHeader({
  hint,
  kicker,
  step,
  title,
}: {
  hint?: string;
  kicker: string;
  step: string;
  title: string;
}) {
  return (
    <div className="relative col-span-full mb-2 flex flex-col gap-3 border-b border-slate-100/90 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-inner ring-1 ring-white/10">
          {step}
        </span>
        <div className="min-w-0">
          <p className="mb-0.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-indigo-600">{kicker}</p>
          <h3 className="m-0 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h3>
          {hint ? (
            <p className="mt-1.5 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IconSpark() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6 19.8 4.2"
        className="stroke-current"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M12 8.5 14.2 12 12 15.5 9.8 12 12 8.5Z"
        className="fill-current opacity-90"
      />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24">
      <path
        className="stroke-current"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="M4 20V9.5L12 5l8 4.5V20M9 20v-5h6v5"
      />
    </svg>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24">
      <path
        className="stroke-current"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="m4 8 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M4 16l8 4 8-4"
      />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24">
      <path
        className="stroke-current"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="M4 19h16M7 15V9m5 6V5m5 10v-4"
      />
    </svg>
  );
}

function IconImage({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24">
      <path
        className="stroke-current"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="M4 16l4.5-5 4 4 4.5-6L20 16M5 20h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z"
      />
    </svg>
  );
}

const defaultPropertyForm = {
  name: '',
  code: '',
  phone: '',
  email: '',
  address: '',
  timezone: 'Asia/Kolkata',
};

const defaultCategoryForm = {
  property_id: '',
  name: '',
  code: '',
  description: '',
  max_occupancy: '2',
};

const defaultRatePlanForm = {
  property_id: '',
  room_category_id: '',
  name: '',
  code: '',
  base_rate: '',
  currency: 'INR',
};

const defaultPricingRuleForm = {
  property_id: '',
  rate_plan_id: '',
  name: '',
  type: 'WEEKEND',
  adjustment_percent: '',
  start_date: '',
  end_date: '',
  occupancy_threshold: '',
};

export function PropertySetupPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const pricingRuleFormRef = useRef<HTMLFormElement | null>(null);
  const [propertyForm, setPropertyForm] = useState(defaultPropertyForm);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);
  const [ratePlanForm, setRatePlanForm] = useState(defaultRatePlanForm);
  const [pricingRuleForm, setPricingRuleForm] = useState(defaultPricingRuleForm);
  const [propertyImageForm, setPropertyImageForm] = useState({
    property_id: '',
    caption: '',
    is_primary: true,
  });
  const [roomImageForm, setRoomImageForm] = useState({
    room_category_id: '',
    caption: '',
    is_primary: true,
  });
  const [propertyImageFile, setPropertyImageFile] = useState<File | null>(null);
  const [roomImageFile, setRoomImageFile] = useState<File | null>(null);
  const [propertyImageInputKey, setPropertyImageInputKey] = useState(0);
  const [roomImageInputKey, setRoomImageInputKey] = useState(0);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), [reloadKey]);
  const ratePlansState = useAsync(async () => fetchAllPages<RatePlan>('/rate-plans'), [reloadKey]);
  const pricingRulesState = useAsync(async () => fetchAllPages<PricingRule>('/pricing-rules'), [reloadKey]);

  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const ratePlans = ratePlansState.data ?? [];
  const pricingRules = pricingRulesState.data ?? [];
  const activePricingRules = useMemo(
    () => pricingRules.filter((rule) => rule.is_active).length,
    [pricingRules],
  );
  const propertyOptions = useMemo(
    () =>
      properties.map((property) => ({
        label: property.name,
        value: property.id,
      })),
    [properties],
  );
  const ratePlanCategoryOptions = useMemo(
    () =>
      categories
        .filter((category) => !ratePlanForm.property_id || category.property_id === ratePlanForm.property_id)
        .map((category) => ({
          label: category.name,
          value: category.id,
        })),
    [categories, ratePlanForm.property_id],
  );
  const pricingRuleRatePlanOptions = useMemo(
    () =>
      ratePlans
        .filter((ratePlan) => !pricingRuleForm.property_id || ratePlan.property_id === pricingRuleForm.property_id)
        .map((ratePlan) => ({
          label: `${ratePlan.room_category.name} · ${ratePlan.name}`,
          value: ratePlan.id,
        })),
    [pricingRuleForm.property_id, ratePlans],
  );
  const roomImageCategoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        label: `${category.property.name} · ${category.name}`,
        value: category.id,
      })),
    [categories],
  );
  const propertyImageCount = useMemo(
    () => properties.reduce((total, property) => total + property.images.length, 0),
    [properties],
  );
  const categoryImageCount = useMemo(
    () => categories.reduce((total, category) => total + category.images.length, 0),
    [categories],
  );
  const totalMediaAssets = propertyImageCount + categoryImageCount;
  const propertyGalleryCards = useMemo(
    () =>
      properties.flatMap((property) =>
        property.images.map((image) => (
          <article
            className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-900 shadow-xl ring-1 ring-black/10 transition duration-500 hover:-translate-y-1 hover:shadow-2xl"
            key={image.id}
          >
            <img
              alt={image.caption ?? property.name}
              className="aspect-[4/3] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
              src={mediaUrl(image.url)}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/20">
                  Property
                </span>
                {image.is_primary ? (
                  <span className="rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-white shadow-sm">
                    Primary
                  </span>
                ) : null}
              </div>
              <strong className="mt-2 block text-sm font-semibold leading-snug">{property.name}</strong>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-300">
                {image.caption ?? 'Property photo'}
              </p>
            </div>
          </article>
        )),
      ),
    [properties],
  );
  const categoryGalleryCards = useMemo(
    () =>
      categories.flatMap((category) =>
        category.images.map((image) => (
          <article
            className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-900 shadow-xl ring-1 ring-black/10 transition duration-500 hover:-translate-y-1 hover:shadow-2xl"
            key={image.id}
          >
            <img
              alt={image.caption ?? category.name}
              className="aspect-[4/3] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
              src={mediaUrl(image.url)}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-indigo-950/95 via-slate-950/35 to-transparent"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-400/25 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-indigo-100 ring-1 ring-indigo-300/30">
                  Room
                </span>
                {image.is_primary ? (
                  <span className="rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-white shadow-sm">
                    Primary
                  </span>
                ) : null}
              </div>
              <strong className="mt-2 block text-sm font-semibold leading-snug">
                {category.property.name} · {category.name}
              </strong>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-300">
                {image.caption ?? 'Room category photo'}
              </p>
            </div>
          </article>
        )),
      ),
    [categories],
  );

  async function runAction(actionName: string, action: () => Promise<void>) {
    setActionError(null);
    setActionStatus(null);
    setPendingAction(actionName);

    try {
      await action();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitProperty(event: FormEvent) {
    event.preventDefault();
    await runAction('create-property', async () => {
      await api.post('/properties', {
        ...propertyForm,
        phone: propertyForm.phone || undefined,
        email: propertyForm.email || undefined,
      });
      setPropertyForm(defaultPropertyForm);
      setActionStatus('Property created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    await runAction('create-category', async () => {
      await api.post('/room-categories', {
        ...categoryForm,
        max_occupancy: Number(categoryForm.max_occupancy),
        description: categoryForm.description || undefined,
      });
      setCategoryForm((current) => ({
        ...defaultCategoryForm,
        property_id: current.property_id,
      }));
      setActionStatus('Room category created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitRatePlan(event: FormEvent) {
    event.preventDefault();
    await runAction('create-rate-plan', async () => {
      await api.post('/rate-plans', ratePlanForm);
      setRatePlanForm((current) => ({
        ...defaultRatePlanForm,
        property_id: current.property_id,
        room_category_id: current.room_category_id,
        currency: current.currency,
      }));
      setActionStatus('Rate plan created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitPricingRule(event: FormEvent) {
    event.preventDefault();
    await runAction(editingPricingRuleId ? 'update-pricing-rule' : 'create-pricing-rule', async () => {
      const payload = {
        property_id: pricingRuleForm.property_id,
        rate_plan_id: pricingRuleForm.rate_plan_id,
        name: pricingRuleForm.name,
        type: pricingRuleForm.type,
        adjustment_percent: pricingRuleForm.adjustment_percent,
        occupancy_threshold:
          pricingRuleForm.type === 'OCCUPANCY' && pricingRuleForm.occupancy_threshold
            ? Number(pricingRuleForm.occupancy_threshold)
            : undefined,
        start_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.start_date || undefined : undefined,
        end_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.end_date || undefined : undefined,
      };

      if (editingPricingRuleId) {
        await api.put(`/pricing-rules/${editingPricingRuleId}`, payload);
      } else {
        await api.post('/pricing-rules', payload);
      }

      setPricingRuleForm((current) => ({
        ...defaultPricingRuleForm,
        property_id: current.property_id,
        rate_plan_id: editingPricingRuleId ? '' : current.rate_plan_id,
      }));
      setEditingPricingRuleId(null);
      setActionStatus(editingPricingRuleId ? 'Pricing rule updated.' : 'Pricing rule created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function togglePricingRule(rule: PricingRule) {
    await runAction(`toggle-pricing-rule:${rule.id}`, async () => {
      await api.put(`/pricing-rules/${rule.id}`, {
        is_active: !rule.is_active,
      });
      if (editingPricingRuleId === rule.id) {
        setEditingPricingRuleId(null);
        setPricingRuleForm(defaultPricingRuleForm);
      }
      setActionStatus(`Pricing rule ${!rule.is_active ? 'enabled' : 'disabled'}.`);
      setReloadKey((value) => value + 1);
    });
  }

  async function deletePricingRule(rule: PricingRule) {
    await runAction(`delete-pricing-rule:${rule.id}`, async () => {
      await api.delete(`/pricing-rules/${rule.id}`);
      if (editingPricingRuleId === rule.id) {
        setEditingPricingRuleId(null);
        setPricingRuleForm(defaultPricingRuleForm);
      }
      setActionStatus('Pricing rule deleted.');
      setReloadKey((value) => value + 1);
    });
  }

  function startEditingPricingRule(rule: PricingRule) {
    setActionError(null);
    setActionStatus(null);
    setEditingPricingRuleId(rule.id);
    setPricingRuleForm({
      property_id: rule.property_id,
      rate_plan_id: rule.rate_plan_id,
      name: rule.name,
      type: rule.type,
      adjustment_percent: String(rule.adjustment_percent),
      start_date: rule.start_date ?? '',
      end_date: rule.end_date ?? '',
      occupancy_threshold: rule.occupancy_threshold == null ? '' : String(rule.occupancy_threshold),
    });
    requestAnimationFrame(() => {
      pricingRuleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function cancelEditingPricingRule() {
    setEditingPricingRuleId(null);
    setPricingRuleForm(defaultPricingRuleForm);
  }

  async function submitPropertyImage(event: FormEvent) {
    event.preventDefault();
    if (!propertyImageFile) return;

    const formData = new FormData();
    formData.append('image', propertyImageFile);
    formData.append('caption', propertyImageForm.caption);
    formData.append('is_primary', String(propertyImageForm.is_primary));

    await runAction('upload-property-image', async () => {
      await api.post(`/properties/${propertyImageForm.property_id}/images`, formData);
      setPropertyImageForm({ property_id: '', caption: '', is_primary: true });
      setPropertyImageFile(null);
      setPropertyImageInputKey((value) => value + 1);
      setActionStatus('Property photo uploaded.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitRoomImage(event: FormEvent) {
    event.preventDefault();
    if (!roomImageFile) return;

    const formData = new FormData();
    formData.append('image', roomImageFile);
    formData.append('caption', roomImageForm.caption);
    formData.append('is_primary', String(roomImageForm.is_primary));

    await runAction('upload-room-image', async () => {
      await api.post(`/room-categories/${roomImageForm.room_category_id}/images`, formData);
      setRoomImageForm({ room_category_id: '', caption: '', is_primary: true });
      setRoomImageFile(null);
      setRoomImageInputKey((value) => value + 1);
      setActionStatus('Room category photo uploaded.');
      setReloadKey((value) => value + 1);
    });
  }

  function mediaUrl(url: string) {
    const baseUrl = (api.defaults.baseURL ?? '').replace(/\/$/, '');
    return `${baseUrl}${url}`;
  }

  const hasSetupMedia = totalMediaAssets > 0;

  return (
    <section className="relative isolate min-h-0 text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,rgba(45,212,191,0.2),transparent),radial-gradient(ellipse_55%_45%_at_100%_5%,rgba(99,102,241,0.14),transparent),radial-gradient(ellipse_50%_40%_at_0%_45%,rgba(251,191,36,0.09),transparent)]"
      />
      <div className={`${pageWrap} px-4 pb-16 pt-1 sm:px-6 lg:px-8`}>
        <header className="relative mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/90 bg-white/80 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-emerald-900 shadow-sm backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Commercial foundation
          </div>
          <h1 className="mt-4 max-w-[20ch] text-3xl font-extrabold tracking-tight sm:max-w-none sm:text-4xl lg:text-[2.55rem] lg:leading-[1.08]">
            Property workspace
            <span className="mt-2 block max-w-3xl bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600 bg-clip-text text-2xl text-transparent sm:text-3xl lg:text-[2.05rem]">
              Shape entities, categories, rates, and rules before rooms go on sale.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            One surface for revenue operators: stand up the commercial backbone that later powers OTA mapping, inventory, and dynamic pricing.
          </p>
        </header>

        {actionStatus && (
          <div
            className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-white to-teal-50/80 px-4 py-3.5 text-sm font-semibold text-emerald-900 shadow-md ring-1 ring-emerald-100/80"
            role="status"
          >
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                clipRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                fillRule="evenodd"
              />
            </svg>
            {actionStatus}
          </div>
        )}
        {actionError && (
          <div
            className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200/90 bg-gradient-to-r from-rose-50 to-white px-4 py-3.5 text-sm font-semibold text-rose-900 shadow-md ring-1 ring-rose-100/80"
            role="alert"
          >
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                clipRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                fillRule="evenodd"
              />
            </svg>
            {actionError}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SummaryTile
            accent="from-teal-500 to-emerald-600"
            detail="Operating entities on the platform"
            icon={<IconBuilding className="h-5 w-5" />}
            label="Properties"
            value={properties.length.toString()}
          />
          <SummaryTile
            accent="from-indigo-500 to-violet-600"
            detail="Sellable room groupings"
            icon={<IconLayers className="h-5 w-5" />}
            label="Categories"
            value={categories.length.toString()}
          />
          <SummaryTile
            accent="from-amber-500 to-orange-600"
            detail="Published commercial plans"
            icon={<IconChart className="h-5 w-5" />}
            label="Rate plans"
            value={ratePlans.length.toString()}
          />
        </div>

        <div className="relative mb-8 overflow-hidden rounded-2xl border border-indigo-300/25 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-5 shadow-2xl ring-1 ring-white/10 sm:px-7 sm:py-6">
          <div
            aria-hidden
            className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-teal-400/25 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-teal-200 ring-1 ring-white/15">
              <IconSpark />
              Playbook
            </div>
            <p className="text-sm font-medium leading-relaxed text-slate-300 md:text-[0.95rem]">
              Layer property → categories → rate plans → pricing → media in that order. Each step unlocks the next downstream workflow, from OTA mapping to sellable inventory.
            </p>
          </div>
        </div>

        <div className="grid gap-10">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(17rem,0.95fr)_minmax(0,1.65fr)]">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 text-white shadow-2xl ring-1 ring-white/10 lg:sticky lg:top-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.06)_1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
              <div aria-hidden className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-teal-400/30 blur-3xl" />
              <div className="relative">
                <div className="mb-5 flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-300/90">
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[0.62rem] text-white ring-1 ring-white/15">
                    Live posture
                  </span>
                </div>
                <h3 className="m-0 text-lg font-bold tracking-tight sm:text-xl">Commercial inventory</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Snapshot of how your commercial graph is populated before physical rooms and channel mapping.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SignalStat label="Properties" value={properties.length} />
                  <SignalStat label="Plans" value={ratePlans.length} />
                  <SignalStat label="Active rules" value={activePricingRules} />
                </div>
                <dl className="mt-6 grid gap-0 divide-y divide-white/10 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                    <dt className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-slate-500">Room categories</dt>
                    <dd className="m-0 font-mono text-lg font-bold tabular-nums text-white">{categories.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-slate-500">Pricing rules</dt>
                    <dd className="m-0 font-mono text-lg font-bold tabular-nums text-white">{pricingRules.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-slate-500">Media assets</dt>
                    <dd className="m-0 font-mono text-lg font-bold tabular-nums text-white">
                      {totalMediaAssets}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <FormShell accent="from-emerald-400 via-teal-500 to-cyan-400">
              <form
                className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-end"
                onSubmit={submitProperty}
              >
                <FormSectionHeader
                  hint="Legal and commercial identity for this operating unit—used everywhere downstream."
                  kicker="Step 01 · Property"
                  step="01"
                  title="Register operating entity"
                />
            <label className={labelCls}>
              Property name
              <input
                className={inputCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })}
                placeholder="Harbour Residency"
                required
                value={propertyForm.name}
              />
            </label>
            <label className={labelCls}>
              Code
              <input
                className={inputCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, code: event.target.value })}
                placeholder="HARBOUR-MUM"
                required
                value={propertyForm.code}
              />
            </label>
            <label className={labelCls}>
              Phone
              <input
                className={inputCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, phone: event.target.value })}
                placeholder="+912212345678"
                value={propertyForm.phone}
              />
            </label>
            <label className={labelCls}>
              Email
              <input
                className={inputCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, email: event.target.value })}
                placeholder="ops@hotel.example.com"
                type="email"
                value={propertyForm.email}
              />
            </label>
            <label className={labelCls}>
              Timezone
              <input
                className={inputCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, timezone: event.target.value })}
                placeholder="Asia/Kolkata"
                required
                value={propertyForm.timezone}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              Address
              <textarea
                className={textareaCls}
                onChange={(event) => setPropertyForm({ ...propertyForm, address: event.target.value })}
                placeholder="Bandra West, Mumbai, Maharashtra"
                required
                value={propertyForm.address}
              />
            </label>
            <button className={btnPrimary} disabled={pendingAction === 'create-property'} type="submit">
              {pendingAction === 'create-property' ? 'Adding...' : 'Add property'}
            </button>
              </form>
            </FormShell>
            </div>

            <div className="grid grid-cols-1 gap-6">
            <FormShell accent="from-violet-500 via-indigo-500 to-blue-600">
              <form
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 xl:items-end"
                onSubmit={submitCategory}
              >
                <FormSectionHeader
                  hint="Sellable room groupings attach to a property and carry descriptions used in booking flows."
                  kicker="Step 02 · Inventory"
                  step="02"
                  title="Define room category"
                />
            <label className={labelCls}>
              Property
              <CustomSelect
                onChange={(value) => setCategoryForm({ ...categoryForm, property_id: value })}
                options={propertyOptions}
                placeholder="Select property"
                value={categoryForm.property_id}
              />
            </label>
            <label className={labelCls}>
              Category name
              <input
                className={inputCls}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                placeholder="Deluxe"
                required
                value={categoryForm.name}
              />
            </label>
            <label className={labelCls}>
              Code
              <input
                className={inputCls}
                onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value })}
                placeholder="DELUXE"
                required
                value={categoryForm.code}
              />
            </label>
            <label className={labelCls}>
              Max occupancy
              <input
                className={inputCls}
                min="1"
                onChange={(event) => setCategoryForm({ ...categoryForm, max_occupancy: event.target.value })}
                placeholder="3"
                required
                type="number"
                value={categoryForm.max_occupancy}
              />
            </label>
            <label className={`${labelCls} md:col-span-2 xl:col-span-4`}>
              Description
              <textarea
                className={textareaCls}
                onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })}
                placeholder="Premium room with upgraded amenities"
                value={categoryForm.description}
              />
            </label>
            <button className={btnPrimary} disabled={pendingAction === 'create-category'} type="submit">
              {pendingAction === 'create-category' ? 'Adding...' : 'Add category'}
            </button>
              </form>
            </FormShell>

            <FormShell accent="from-amber-400 via-orange-500 to-rose-500">
              <form
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 xl:items-end"
                onSubmit={submitRatePlan}
              >
                <FormSectionHeader
                  hint="Commercial plan + base price for a category. Rate plans power availability and pricing rules."
                  kicker="Step 03 · Rates"
                  step="03"
                  title="Publish rate plan"
                />
            <label className={labelCls}>
              Property
              <CustomSelect
                onChange={(value) => setRatePlanForm({ ...ratePlanForm, property_id: value })}
                options={propertyOptions}
                placeholder="Select property"
                value={ratePlanForm.property_id}
              />
            </label>
            <label className={labelCls}>
              Room category
              <CustomSelect
                onChange={(value) => setRatePlanForm({ ...ratePlanForm, room_category_id: value })}
                options={ratePlanCategoryOptions}
                placeholder="Select category"
                value={ratePlanForm.room_category_id}
              />
            </label>
            <label className={labelCls}>
              Plan name
              <input
                className={inputCls}
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, name: event.target.value })}
                placeholder="Deluxe Flexible"
                required
                value={ratePlanForm.name}
              />
            </label>
            <label className={labelCls}>
              Code
              <input
                className={inputCls}
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, code: event.target.value })}
                placeholder="DELUXE-FLEX"
                required
                value={ratePlanForm.code}
              />
            </label>
            <label className={labelCls}>
              Base rate
              <input
                className={inputCls}
                min="0"
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, base_rate: event.target.value })}
                placeholder="7500.00"
                required
                step="0.01"
                type="number"
                value={ratePlanForm.base_rate}
              />
            </label>
            <label className={labelCls}>
              Currency
              <input
                className={inputCls}
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, currency: event.target.value })}
                placeholder="INR"
                required
                value={ratePlanForm.currency}
              />
            </label>
            <button className={btnPrimary} disabled={pendingAction === 'create-rate-plan'} type="submit">
              {pendingAction === 'create-rate-plan' ? 'Adding...' : 'Add rate plan'}
            </button>
              </form>
            </FormShell>

            <FormShell accent="from-fuchsia-500 via-purple-600 to-indigo-700">
              <form
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 xl:items-end"
                onSubmit={submitPricingRule}
                ref={pricingRuleFormRef}
              >
                <FormSectionHeader
                  hint={
                    editingPricingRuleId
                      ? 'You are editing an existing rule—adjust fields and save, or cancel to discard.'
                      : 'Layer weekend, festival, or occupancy-based lifts on top of a rate plan.'
                  }
                  kicker="Step 04 · Dynamic pricing"
                  step="04"
                  title={editingPricingRuleId ? 'Refine pricing rule' : 'Create pricing rule'}
                />
            <label className={labelCls}>
              Property
              <CustomSelect
                disabled={!!editingPricingRuleId}
                onChange={(value) =>
                  setPricingRuleForm({ ...pricingRuleForm, property_id: value, rate_plan_id: '' })
                }
                options={propertyOptions}
                placeholder="Select property"
                value={pricingRuleForm.property_id}
              />
            </label>
            <label className={labelCls}>
              Rate plan
              <CustomSelect
                disabled={!!editingPricingRuleId}
                onChange={(value) => setPricingRuleForm({ ...pricingRuleForm, rate_plan_id: value })}
                options={pricingRuleRatePlanOptions}
                placeholder="Select rate plan"
                value={pricingRuleForm.rate_plan_id}
              />
            </label>
            <label className={labelCls}>
              Rule name
              <input
                className={inputCls}
                onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, name: event.target.value })}
                placeholder="Weekend surcharge"
                required
                value={pricingRuleForm.name}
              />
            </label>
            <label className={labelCls}>
              Rule type
              <CustomSelect
                onChange={(value) =>
                  setPricingRuleForm({
                    ...pricingRuleForm,
                    type: value,
                    start_date: '',
                    end_date: '',
                    occupancy_threshold: '',
                  })
                }
                options={[
                  { label: 'Weekend', value: 'WEEKEND' },
                  { label: 'Festival / date range', value: 'DATE_RANGE' },
                  { label: 'Occupancy surge', value: 'OCCUPANCY' },
                ]}
                value={pricingRuleForm.type}
              />
            </label>
            <label className={labelCls}>
              Adjustment %
              <input
                className={inputCls}
                min="0"
                onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, adjustment_percent: event.target.value })}
                placeholder="20"
                required
                step="0.01"
                type="number"
                value={pricingRuleForm.adjustment_percent}
              />
            </label>
            {pricingRuleForm.type === 'DATE_RANGE' && (
              <>
                <label className={labelCls}>
                  Start date
                  <input
                    className={inputCls}
                    onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, start_date: event.target.value })}
                    required
                    type="date"
                    value={pricingRuleForm.start_date}
                  />
                </label>
                <label className={labelCls}>
                  End date
                  <input
                    className={inputCls}
                    onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, end_date: event.target.value })}
                    required
                    type="date"
                    value={pricingRuleForm.end_date}
                  />
                </label>
              </>
            )}
            {pricingRuleForm.type === 'OCCUPANCY' && (
              <label className={labelCls}>
                Occupancy threshold %
                <input
                  className={inputCls}
                  max="100"
                  min="1"
                  onChange={(event) =>
                    setPricingRuleForm({ ...pricingRuleForm, occupancy_threshold: event.target.value })
                  }
                  placeholder="70"
                  required
                  type="number"
                  value={pricingRuleForm.occupancy_threshold}
                />
              </label>
            )}
            <div className="col-span-full flex flex-wrap gap-2 pt-1">
              <button
                className={btnPrimary}
                disabled={pendingAction === 'create-pricing-rule' || pendingAction === 'update-pricing-rule'}
                type="submit"
              >
                {pendingAction === 'update-pricing-rule'
                  ? 'Updating...'
                  : pendingAction === 'create-pricing-rule'
                    ? 'Adding...'
                    : editingPricingRuleId
                      ? 'Update pricing rule'
                      : 'Add pricing rule'}
              </button>
              {editingPricingRuleId && (
                <button className={btnSecondary} onClick={cancelEditingPricingRule} type="button">
                  Cancel
                </button>
              )}
            </div>
              </form>
            </FormShell>
            </div>
        </div>

        {(propertiesState.loading || categoriesState.loading || ratePlansState.loading || pricingRulesState.loading) && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
            <svg className="h-5 w-5 shrink-0 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                fill="currentColor"
              />
            </svg>
            Syncing setup data from the API…
          </div>
        )}
        {(propertiesState.error || categoriesState.error || ratePlansState.error || pricingRulesState.error) && (
          <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm font-semibold text-rose-900 shadow-sm">
            {propertiesState.error ?? categoriesState.error ?? ratePlansState.error ?? pricingRulesState.error}
          </div>
        )}

        <div className="grid gap-8">
          <div>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-sky-700">Media library</p>
                <h2 className="m-0 text-xl font-bold text-slate-900 sm:text-2xl">Brand & room photography</h2>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  High-impact imagery improves conversion on OTAs and internal booking journeys.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FormShell accent="from-sky-400 via-blue-500 to-indigo-600">
                <form className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-end" onSubmit={submitPropertyImage}>
                  <FormSectionHeader
                    hint="Upload hero shots of the property exterior, lobby, or signature spaces."
                    kicker="Property collateral"
                    step="A"
                    title="Property photos"
                  />
              <label className={labelCls}>
                Property
                <CustomSelect
                  onChange={(value) => setPropertyImageForm({ ...propertyImageForm, property_id: value })}
                  options={propertyOptions}
                  placeholder="Select property"
                  value={propertyImageForm.property_id}
                />
              </label>
              <label className={labelCls}>
                Caption
                <input
                  className={inputCls}
                  onChange={(event) => setPropertyImageForm({ ...propertyImageForm, caption: event.target.value })}
                  placeholder="Front exterior"
                  value={propertyImageForm.caption}
                />
              </label>
              <label className={labelCls}>
                Image
                <input
                  className={`${inputCls} cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-200`}
                  accept="image/*"
                  key={propertyImageInputKey}
                  onChange={(event) => setPropertyImageFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
              </label>
              <label className={`${labelCls} flex flex-row items-center gap-2`}>
                <input
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-green focus:ring-green/30"
                  checked={propertyImageForm.is_primary}
                  onChange={(event) => setPropertyImageForm({ ...propertyImageForm, is_primary: event.target.checked })}
                  type="checkbox"
                />
                Primary photo
              </label>
              <button
                className={btnPrimary}
                disabled={pendingAction === 'upload-property-image'}
                type="submit"
              >
                {pendingAction === 'upload-property-image' ? 'Uploading...' : 'Upload property photo'}
              </button>
                </form>
              </FormShell>

              <FormShell accent="from-cyan-400 via-sky-500 to-blue-600">
                <form className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-end" onSubmit={submitRoomImage}>
                  <FormSectionHeader
                    hint="Showcase room types with accurate lighting—guests match expectation to reality."
                    kicker="Room collateral"
                    step="B"
                    title="Room category photos"
                  />
              <label className={labelCls}>
                Room category
                <CustomSelect
                  onChange={(value) => setRoomImageForm({ ...roomImageForm, room_category_id: value })}
                  options={roomImageCategoryOptions}
                  placeholder="Select category"
                  value={roomImageForm.room_category_id}
                />
              </label>
              <label className={labelCls}>
                Caption
                <input
                  className={inputCls}
                  onChange={(event) => setRoomImageForm({ ...roomImageForm, caption: event.target.value })}
                  placeholder="Deluxe king bed"
                  value={roomImageForm.caption}
                />
              </label>
              <label className={labelCls}>
                Image
                <input
                  className={`${inputCls} cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-200`}
                  accept="image/*"
                  key={roomImageInputKey}
                  onChange={(event) => setRoomImageFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
              </label>
              <label className={`${labelCls} flex flex-row items-center gap-2`}>
                <input
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-green focus:ring-green/30"
                  checked={roomImageForm.is_primary}
                  onChange={(event) => setRoomImageForm({ ...roomImageForm, is_primary: event.target.checked })}
                  type="checkbox"
                />
                Primary photo
              </label>
              <button
                className={btnPrimary}
                disabled={pendingAction === 'upload-room-image'}
                type="submit"
              >
                {pendingAction === 'upload-room-image' ? 'Uploading...' : 'Upload room photo'}
              </button>
                </form>
              </FormShell>
            </div>
          </div>

          {hasSetupMedia && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-lg">
                  <IconImage className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="m-0 text-lg font-bold text-slate-900">Live gallery</h3>
                  <p className="m-0 text-sm text-slate-500">Hover cards to preview how assets read in a dark UI context.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {propertyGalleryCards}
                {categoryGalleryCards}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
            <div className="flex items-center gap-2 sm:justify-between">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-indigo-700">Data plane</p>
                <h3 className="m-0 text-lg font-bold text-slate-900 sm:text-xl">Rates & pricing matrix</h3>
              </div>
            </div>
            <div className="grid gap-6">
              <div className={tableShell}>
                <div className="flex flex-col gap-1 border-b border-slate-100/90 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">Rate inventory</p>
                    <h4 className="m-0 text-base font-bold text-slate-900">{ratePlans.length} rate plans on file</h4>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-left">
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400 first:pl-5">
                          Property
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Category
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Rate plan
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Base rate
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 pr-5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratePlans.map((ratePlan) => (
                        <tr
                          className="border-b border-slate-100/90 transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-indigo-50/50"
                          key={ratePlan.id}
                        >
                          <td className="px-4 py-3.5 align-middle text-sm font-semibold text-slate-800 first:pl-5">
                            {ratePlan.property.name}
                          </td>
                          <td className="px-4 py-3.5 align-middle text-sm text-slate-700">{ratePlan.room_category.name}</td>
                          <td className="px-4 py-3.5 align-middle text-sm text-slate-800">
                            <span className="font-semibold">{ratePlan.name}</span>
                            <span className="mt-0.5 block text-xs font-medium text-slate-500">{ratePlan.code}</span>
                          </td>
                          <td className="px-4 py-3.5 align-middle font-mono text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(ratePlan.base_rate)}
                          </td>
                          <td className="px-4 py-3.5 pr-5 align-middle">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide ${
                                ratePlan.is_active
                                  ? 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25'
                                  : 'bg-slate-200/80 text-slate-600 ring-1 ring-slate-300/60'
                              }`}
                            >
                              {ratePlan.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={tableShell}>
                <div className="flex flex-col gap-1 border-b border-slate-100/90 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">Dynamic pricing</p>
                    <h4 className="m-0 text-base font-bold text-slate-900">{pricingRules.length} pricing rules on file</h4>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-left">
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400 first:pl-5">
                          Property
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Rate plan
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Rule
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Adjustment
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Condition
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Status
                        </th>
                        <th className="whitespace-nowrap px-4 py-3.5 pr-5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingRules.map((rule) => (
                        <tr
                          className="border-b border-slate-100/90 transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-violet-50/40"
                          key={rule.id}
                        >
                          <td className="px-4 py-3.5 align-middle text-sm font-semibold text-slate-800 first:pl-5">
                            {rule.property.name}
                          </td>
                          <td className="px-4 py-3.5 align-middle text-sm text-slate-800">
                            <span className="font-medium">
                              {rule.rate_plan.room_category.name} · {rule.rate_plan.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">{rule.rate_plan.code}</span>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-sm font-medium text-slate-800">{rule.name}</td>
                          <td className="px-4 py-3.5 align-middle font-mono text-sm font-semibold tabular-nums text-indigo-700">
                            +{rule.adjustment_percent}%
                          </td>
                          <td className="max-w-[14rem] px-4 py-3.5 align-middle text-xs font-medium leading-snug text-slate-600">
                            {rule.type === 'WEEKEND' && 'Saturday / Sunday'}
                            {rule.type === 'DATE_RANGE' && `${rule.start_date} → ${rule.end_date}`}
                            {rule.type === 'OCCUPANCY' && `Occupancy ≥ ${rule.occupancy_threshold}%`}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide ${
                                rule.is_active
                                  ? 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25'
                                  : 'bg-slate-200/80 text-slate-600 ring-1 ring-slate-300/60'
                              }`}
                            >
                              {rule.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 pr-5 align-middle">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                className={btnSecondary}
                                onClick={() => startEditingPricingRule(rule)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className={btnSecondary}
                                disabled={pendingAction === `toggle-pricing-rule:${rule.id}`}
                                onClick={() => void togglePricingRule(rule)}
                                type="button"
                              >
                                {pendingAction === `toggle-pricing-rule:${rule.id}`
                                  ? 'Saving…'
                                  : rule.is_active
                                    ? 'Disable'
                                    : 'Enable'}
                              </button>
                              <button
                                className={`${btnSecondary} ${btnDanger}`}
                                disabled={pendingAction === `delete-pricing-rule:${rule.id}`}
                                onClick={() => void deletePricingRule(rule)}
                                type="button"
                              >
                                {pendingAction === `delete-pricing-rule:${rule.id}` ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        
      </div>
    </section>
  );
}

function SummaryTile({
  accent,
  detail,
  icon,
  label,
  value,
}: {
  accent: string;
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-[1px] shadow-[0_22px_55px_-22px_rgba(15,23,42,0.22)] ring-1 ring-slate-100/90 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_65px_-18px_rgba(15,23,42,0.3)]">
      <div className="relative flex h-full min-h-[9.5rem] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-slate-50/95 p-5">
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-35 blur-2xl ${accent}`}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${accent}`}
          >
            {icon}
          </div>
          <span className="rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-slate-500">
            Live
          </span>
        </div>
        <div className="relative mt-5">
          <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
          <strong className="mt-1 block text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</strong>
          <span className="mt-1.5 block text-xs font-medium leading-snug text-slate-500">{detail}</span>
        </div>
      </div>
    </article>
  );
}

function SignalStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.1] to-white/[0.02] p-3.5 shadow-inner backdrop-blur-sm sm:p-4">
      <p className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <strong className="mt-1.5 block text-2xl font-bold tabular-nums tracking-tight text-white">{value}</strong>
    </article>
  );
}
