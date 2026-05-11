import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { PricingRule, Property, RatePlan, RoomCategory } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

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
  const activePricingRules = pricingRules.filter((rule) => rule.is_active).length;

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
      setCategoryForm(defaultCategoryForm);
      setActionStatus('Room category created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitRatePlan(event: FormEvent) {
    event.preventDefault();
    await runAction('create-rate-plan', async () => {
      await api.post('/rate-plans', ratePlanForm);
      setRatePlanForm(defaultRatePlanForm);
      setActionStatus('Rate plan created.');
      setReloadKey((value) => value + 1);
    });
  }

  async function submitPricingRule(event: FormEvent) {
    event.preventDefault();
    await runAction(editingPricingRuleId ? 'update-pricing-rule' : 'create-pricing-rule', async () => {
      const payload = {
        ...pricingRuleForm,
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

      setPricingRuleForm(defaultPricingRuleForm);
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

  const hasSetupMedia =
    properties.some((property) => property.images.length > 0) ||
    categories.some((category) => category.images.length > 0);

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Commercial setup</p>
          <h2>Property Setup</h2>
          <p className="page-subtitle">
            Create properties, room categories, rate plans, and pricing structure before adding physical rooms or opening OTA inventory.
          </p>
        </div>
      </div>

      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Properties" value={properties.length.toString()} detail="Operating entities" />
        <SummaryTile label="Categories" value={categories.length.toString()} detail="Sellable room groups" />
        <SummaryTile label="Rate plans" value={ratePlans.length.toString()} detail="Commercial plans" />
      </div>

      <div className="info-strip">
        <strong>Commercial setup</strong>
        <span>
          Build the property, category, rate, media, and pricing layers in that order. This workspace defines the commercial structure that later feeds OTA mapping and sellable inventory.
        </span>
      </div>

      <div className="property-setup-flow">
        <div className="ops-layout property-ops-layout">
          <div className="insight-panel insight-panel-primary">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Setup posture</p>
                <h3>Commercial inventory</h3>
              </div>
            </div>
            <div className="signal-grid compact-signal-grid">
              <SignalStat label="Properties" value={properties.length} />
              <SignalStat label="Plans" value={ratePlans.length} />
              <SignalStat label="Active rules" value={activePricingRules} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>Room categories</dt>
                <dd>{categories.length}</dd>
              </div>
              <div>
                <dt>Pricing rules</dt>
                <dd>{pricingRules.length}</dd>
              </div>
              <div>
                <dt>Media assets</dt>
                <dd>{properties.flatMap((property) => property.images).length + categories.flatMap((category) => category.images).length}</dd>
              </div>
            </dl>
          </div>

          <form className="insight-panel form-grid property-inline-form" onSubmit={submitProperty}>
            <div className="section-heading property-inline-heading">
              <div>
                <p className="eyebrow">Property</p>
                <h3>Create property</h3>
              </div>
            </div>
            <label>
              Property name
              <input
                onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })}
                placeholder="Harbour Residency"
                required
                value={propertyForm.name}
              />
            </label>
            <label>
              Code
              <input
                onChange={(event) => setPropertyForm({ ...propertyForm, code: event.target.value })}
                placeholder="HARBOUR-MUM"
                required
                value={propertyForm.code}
              />
            </label>
            <label>
              Phone
              <input
                onChange={(event) => setPropertyForm({ ...propertyForm, phone: event.target.value })}
                placeholder="+912212345678"
                value={propertyForm.phone}
              />
            </label>
            <label>
              Email
              <input
                onChange={(event) => setPropertyForm({ ...propertyForm, email: event.target.value })}
                placeholder="ops@hotel.example.com"
                type="email"
                value={propertyForm.email}
              />
            </label>
            <label>
              Timezone
              <input
                onChange={(event) => setPropertyForm({ ...propertyForm, timezone: event.target.value })}
                placeholder="Asia/Kolkata"
                required
                value={propertyForm.timezone}
              />
            </label>
            <label className="wide-field">
              Address
              <textarea
                onChange={(event) => setPropertyForm({ ...propertyForm, address: event.target.value })}
                placeholder="Bandra West, Mumbai, Maharashtra"
                required
                value={propertyForm.address}
              />
            </label>
            <button className="primary-button" disabled={pendingAction === 'create-property'} type="submit">
              {pendingAction === 'create-property' ? 'Adding...' : 'Add property'}
            </button>
          </form>
        </div>

        <div className="setup-grid stack">
          <form className="card form-grid" onSubmit={submitCategory}>
            <div className="section-heading form-section-heading">
              <div>
                <p className="eyebrow">Inventory</p>
                <h3>Create room category</h3>
              </div>
            </div>
            <label>
              Property
              <select
                onChange={(event) => setCategoryForm({ ...categoryForm, property_id: event.target.value })}
                required
                value={categoryForm.property_id}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category name
              <input
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                placeholder="Deluxe"
                required
                value={categoryForm.name}
              />
            </label>
            <label>
              Code
              <input
                onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value })}
                placeholder="DELUXE"
                required
                value={categoryForm.code}
              />
            </label>
            <label>
              Max occupancy
              <input
                min="1"
                onChange={(event) => setCategoryForm({ ...categoryForm, max_occupancy: event.target.value })}
                placeholder="3"
                required
                type="number"
                value={categoryForm.max_occupancy}
              />
            </label>
            <label className="wide-field">
              Description
              <textarea
                onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })}
                placeholder="Premium room with upgraded amenities"
                value={categoryForm.description}
              />
            </label>
            <button className="primary-button" disabled={pendingAction === 'create-category'} type="submit">
              {pendingAction === 'create-category' ? 'Adding...' : 'Add category'}
            </button>
          </form>

          <form className="card form-grid" onSubmit={submitRatePlan}>
            <div className="section-heading form-section-heading">
              <div>
                <p className="eyebrow">Rates</p>
                <h3>Create rate plan</h3>
              </div>
            </div>
            <label>
              Property
              <select
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, property_id: event.target.value })}
                required
                value={ratePlanForm.property_id}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Room category
              <select
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, room_category_id: event.target.value })}
                required
                value={ratePlanForm.room_category_id}
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => !ratePlanForm.property_id || category.property_id === ratePlanForm.property_id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Plan name
              <input
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, name: event.target.value })}
                placeholder="Deluxe Flexible"
                required
                value={ratePlanForm.name}
              />
            </label>
            <label>
              Code
              <input
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, code: event.target.value })}
                placeholder="DELUXE-FLEX"
                required
                value={ratePlanForm.code}
              />
            </label>
            <label>
              Base rate
              <input
                min="0"
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, base_rate: event.target.value })}
                placeholder="7500.00"
                required
                step="0.01"
                type="number"
                value={ratePlanForm.base_rate}
              />
            </label>
            <label>
              Currency
              <input
                onChange={(event) => setRatePlanForm({ ...ratePlanForm, currency: event.target.value })}
                placeholder="INR"
                required
                value={ratePlanForm.currency}
              />
            </label>
            <button className="primary-button" disabled={pendingAction === 'create-rate-plan'} type="submit">
              {pendingAction === 'create-rate-plan' ? 'Adding...' : 'Add rate plan'}
            </button>
          </form>

          <form className="card form-grid" onSubmit={submitPricingRule}>
            <div className="section-heading form-section-heading">
              <div>
                <p className="eyebrow">Dynamic pricing</p>
                <h3>{editingPricingRuleId ? 'Edit pricing rule' : 'Create pricing rule'}</h3>
              </div>
            </div>
            <label>
              Property
              <select
                disabled={!!editingPricingRuleId}
                onChange={(event) =>
                  setPricingRuleForm({ ...pricingRuleForm, property_id: event.target.value, rate_plan_id: '' })
                }
                required
                value={pricingRuleForm.property_id}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rate plan
              <select
                disabled={!!editingPricingRuleId}
                onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, rate_plan_id: event.target.value })}
                required
                value={pricingRuleForm.rate_plan_id}
              >
                <option value="">Select rate plan</option>
                {ratePlans
                  .filter((ratePlan) => !pricingRuleForm.property_id || ratePlan.property_id === pricingRuleForm.property_id)
                  .map((ratePlan) => (
                    <option key={ratePlan.id} value={ratePlan.id}>
                      {ratePlan.room_category.name} · {ratePlan.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Rule name
              <input
                onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, name: event.target.value })}
                placeholder="Weekend surcharge"
                required
                value={pricingRuleForm.name}
              />
            </label>
            <label>
              Rule type
              <select
                onChange={(event) =>
                  setPricingRuleForm({
                    ...pricingRuleForm,
                    type: event.target.value,
                    start_date: '',
                    end_date: '',
                    occupancy_threshold: '',
                  })
                }
                required
                value={pricingRuleForm.type}
              >
                <option value="WEEKEND">Weekend</option>
                <option value="DATE_RANGE">Festival / date range</option>
                <option value="OCCUPANCY">Occupancy surge</option>
              </select>
            </label>
            <label>
              Adjustment %
              <input
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
                <label>
                  Start date
                  <input
                    onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, start_date: event.target.value })}
                    required
                    type="date"
                    value={pricingRuleForm.start_date}
                  />
                </label>
                <label>
                  End date
                  <input
                    onChange={(event) => setPricingRuleForm({ ...pricingRuleForm, end_date: event.target.value })}
                    required
                    type="date"
                    value={pricingRuleForm.end_date}
                  />
                </label>
              </>
            )}
            {pricingRuleForm.type === 'OCCUPANCY' && (
              <label>
                Occupancy threshold %
                <input
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
            <div className="button-row">
              <button
                className="primary-button"
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
                <button className="secondary-button" onClick={cancelEditingPricingRule} type="button">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {(propertiesState.loading || categoriesState.loading || ratePlansState.loading || pricingRulesState.loading) && (
          <p className="muted">Loading setup data...</p>
        )}
        {(propertiesState.error || categoriesState.error || ratePlansState.error || pricingRulesState.error) && (
          <p className="error">
            {propertiesState.error ?? categoriesState.error ?? ratePlansState.error ?? pricingRulesState.error}
          </p>
        )}

        <div className="property-setup-media-stack">
          <div className="grid two-columns">
            <form className="card form-grid compact-form" onSubmit={submitPropertyImage}>
          <h3 className="form-title">Property photos</h3>
          <label>
            Property
            <select
              onChange={(event) => setPropertyImageForm({ ...propertyImageForm, property_id: event.target.value })}
              required
              value={propertyImageForm.property_id}
            >
              <option value="">Select property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Caption
            <input
              onChange={(event) => setPropertyImageForm({ ...propertyImageForm, caption: event.target.value })}
              placeholder="Front exterior"
              value={propertyImageForm.caption}
            />
          </label>
          <label>
            Image
            <input
              accept="image/*"
              key={propertyImageInputKey}
              onChange={(event) => setPropertyImageFile(event.target.files?.[0] ?? null)}
              required
              type="file"
            />
          </label>
          <label className="checkbox-label">
            <input
              checked={propertyImageForm.is_primary}
              onChange={(event) => setPropertyImageForm({ ...propertyImageForm, is_primary: event.target.checked })}
              type="checkbox"
            />
            Primary photo
          </label>
          <button
            className="primary-button"
            disabled={pendingAction === 'upload-property-image'}
            type="submit"
          >
            {pendingAction === 'upload-property-image' ? 'Uploading...' : 'Upload property photo'}
          </button>
            </form>

            <form className="card form-grid compact-form" onSubmit={submitRoomImage}>
              <h3 className="form-title">Room category photos</h3>
              <label>
                Room category
                <select
                  onChange={(event) => setRoomImageForm({ ...roomImageForm, room_category_id: event.target.value })}
                  required
                  value={roomImageForm.room_category_id}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.property.name} · {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Caption
                <input
                  onChange={(event) => setRoomImageForm({ ...roomImageForm, caption: event.target.value })}
                  placeholder="Deluxe king bed"
                  value={roomImageForm.caption}
                />
              </label>
              <label>
                Image
                <input
                  accept="image/*"
                  key={roomImageInputKey}
                  onChange={(event) => setRoomImageFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
              </label>
              <label className="checkbox-label">
                <input
                  checked={roomImageForm.is_primary}
                  onChange={(event) => setRoomImageForm({ ...roomImageForm, is_primary: event.target.checked })}
                  type="checkbox"
                />
                Primary photo
              </label>
              <button
                className="primary-button"
                disabled={pendingAction === 'upload-room-image'}
                type="submit"
              >
                {pendingAction === 'upload-room-image' ? 'Uploading...' : 'Upload room photo'}
              </button>
            </form>
          </div>

          {hasSetupMedia && (
            <div className="media-grid">
              {properties.flatMap((property) =>
                property.images.map((image) => (
                  <article className="media-card" key={image.id}>
                    <img alt={image.caption ?? property.name} src={mediaUrl(image.url)} />
                    <div>
                      <strong>{property.name}</strong>
                      <span>{image.caption ?? 'Property photo'}{image.is_primary ? ' · Primary' : ''}</span>
                    </div>
                  </article>
                )),
              )}
              {categories.flatMap((category) =>
                category.images.map((image) => (
                  <article className="media-card" key={image.id}>
                    <img alt={image.caption ?? category.name} src={mediaUrl(image.url)} />
                    <div>
                      <strong>{category.property.name} · {category.name}</strong>
                      <span>{image.caption ?? 'Room category photo'}{image.is_primary ? ' · Primary' : ''}</span>
                    </div>
                  </article>
                )),
              )}
            </div>
          )}

          <div className="property-setup-data-stack">
            <div className="table-card">
              <div className="table-heading">
                <div>
                  <p className="eyebrow">Rate inventory</p>
                  <h3>{ratePlans.length} rate plans configured</h3>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Category</th>
                    <th>Rate plan</th>
                    <th>Base rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ratePlans.map((ratePlan) => (
                    <tr key={ratePlan.id}>
                      <td>{ratePlan.property.name}</td>
                      <td>{ratePlan.room_category.name}</td>
                      <td>
                        {ratePlan.name}
                        <br />
                        <span className="muted">{ratePlan.code}</span>
                      </td>
                      <td>{formatCurrency(ratePlan.base_rate)}</td>
                      <td>
                        <span className="status-pill available">{ratePlan.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-card">
              <div className="table-heading">
                <div>
                  <p className="eyebrow">Dynamic pricing</p>
                  <h3>{pricingRules.length} pricing rules configured</h3>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Rate plan</th>
                    <th>Rule</th>
                    <th>Adjustment</th>
                    <th>Condition</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.property.name}</td>
                      <td>
                        {rule.rate_plan.room_category.name} · {rule.rate_plan.name}
                        <br />
                        <span className="muted">{rule.rate_plan.code}</span>
                      </td>
                      <td>{rule.name}</td>
                      <td>+{rule.adjustment_percent}%</td>
                      <td>
                        {rule.type === 'WEEKEND' && 'Saturday / Sunday'}
                        {rule.type === 'DATE_RANGE' && `${rule.start_date} to ${rule.end_date}`}
                        {rule.type === 'OCCUPANCY' && `Booked occupancy >= ${rule.occupancy_threshold}%`}
                      </td>
                      <td>
                        <span className="status-pill available">{rule.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="secondary-button"
                            onClick={() => startEditingPricingRule(rule)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="secondary-button"
                            disabled={pendingAction === `toggle-pricing-rule:${rule.id}`}
                            onClick={() => void togglePricingRule(rule)}
                            type="button"
                          >
                            {pendingAction === `toggle-pricing-rule:${rule.id}`
                              ? 'Saving...'
                              : rule.is_active
                                ? 'Disable'
                                : 'Enable'}
                          </button>
                          <button
                            className="secondary-button danger-button"
                            disabled={pendingAction === `delete-pricing-rule:${rule.id}`}
                            onClick={() => void deletePricingRule(rule)}
                            type="button"
                          >
                            {pendingAction === `delete-pricing-rule:${rule.id}` ? 'Deleting...' : 'Delete'}
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
    </section>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function SignalStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
