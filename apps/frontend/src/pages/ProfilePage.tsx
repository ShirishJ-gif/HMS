import { useEffect, useState, type FormEvent } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { storeAuthSession, updateStoredAuthUser } from '../api/session';
import type { AuthResponse, UserProfile } from '../api/types';
import { inputCls, labelCls, primaryBtn, secondaryBtn } from './ui';

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultProperty, setDefaultProperty] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  function populate(data: UserProfile) {
    setProfile(data);
    setName(data.name);
    setPhone(data.phone ?? '');
    setDefaultProperty(data.properties.some(p => p.id === data.default_property_id && p.is_active) ? data.default_property_id! : '');
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    api.get<UserProfile>('/auth/profile', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) populate(data); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(getApiErrorMessage(error)); });
    return () => controller.abort();
  }, [reload]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaveError('');
    setSaved(false);
    if (!name.trim()) { setSaveError('Enter your name.'); return; }
    setSaving(true);
    try {
      const { data } = await api.patch<UserProfile>('/auth/profile', {
        name: name.trim(), phone: phone.trim() || null,
        ...(profile?.role !== 'PLATFORM_OWNER' ? { default_property_id: defaultProperty || null } : {}),
      });
      populate(data);
      updateStoredAuthUser(data);
      setSaved(true);
    } catch (error) {
      setSaveError(getApiErrorMessage(error));
    } finally { setSaving(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordChanged(false);
    if (newPassword !== confirmation) { setPasswordError('New passwords do not match.'); return; }
    if (newPassword === currentPassword) { setPasswordError('Choose a different new password.'); return; }
    setChangingPassword(true);
    try {
      const { data } = await api.post<AuthResponse>('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      storeAuthSession(data);
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      setPasswordChanged(true);
    } catch (error) {
      setPasswordError(getApiErrorMessage(error));
    } finally { setChangingPassword(false); }
  }

  const busy = saving || changingPassword;
  const dirty = profile && (name.trim() !== profile.name || (phone.trim() || null) !== (profile.phone ?? null) ||
    (profile.role !== 'PLATFORM_OWNER' && (defaultProperty || null) !== (profile.default_property_id ?? null)));
  const card = 'min-w-0 rounded-xl border border-slate-200 bg-white';
  const field = `${inputCls} !py-2`;
  const sectionHeader = 'border-b border-slate-100 px-5 py-4';
  const footer = 'mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Your personal details, workspace preferences, and account security.</p>
      </div>
      {loadError ? <div className={`${card} p-5`}><p role="alert" className="text-sm text-rose-600">{loadError}</p><button className={`${secondaryBtn} mt-3`} onClick={() => setReload(value => value + 1)}>Try again</button></div>
        : !profile ? <p role="status" className="text-sm text-slate-500">Loading your profile…</p>
        : <>
          <section aria-label="Account information" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-slate-600">{profile.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold text-slate-900">{profile.name}</h2>
                  <p className="mt-0.5 break-all text-xs text-slate-500">{profile.email}</p>
                </div>
              </div>
              <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-indigo-700">{profile.role.replace(/_/g, ' ').toLowerCase()}</span>
            </div>
            <dl className="grid gap-4 border-t border-slate-100 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold text-slate-500">Organization</dt>
                <dd className="mt-1.5 break-words text-slate-800">{profile.organization?.name ?? (profile.role === 'PLATFORM_OWNER' ? 'Platform account' : 'No organization assigned')}</dd>
              </div>
              <div className="min-w-0 sm:border-l sm:border-slate-100 sm:pl-5">
                <dt className="text-[11px] font-semibold text-slate-500">Property access</dt>
                <dd className="mt-1.5 text-slate-700">
                  {profile.role === 'PLATFORM_OWNER' ? 'All properties' : profile.properties.length ? <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{profile.properties.map(property => <li key={property.id} className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">{property.name}{!property.is_active && <span className="ml-1.5 text-slate-400">· Inactive</span>}</li>)}</ul> : 'No properties assigned'}
                </dd>
              </div>
            </dl>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <form className={`${card} flex flex-col`} onSubmit={saveProfile}>
              <div className={sectionHeader}>
                <h2 className="text-sm font-semibold text-slate-900">Personal details</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Update your contact details and sign-in preference.</p>
              </div>
              <fieldset disabled={busy} className="min-w-0 space-y-4 px-5 py-5 disabled:opacity-70">
                <label className={labelCls}>Full name<input className={field} autoComplete="name" required maxLength={120} value={name} onChange={event => { setName(event.target.value); setSaved(false); }} /></label>
                <label className={labelCls}><span>Phone number <span className="ml-1 font-normal text-slate-400">(optional)</span></span><input className={field} type="tel" autoComplete="tel" maxLength={30} value={phone} placeholder="e.g. +91 98765 43210" onChange={event => { setPhone(event.target.value); setSaved(false); }} /></label>
                {profile.role !== 'PLATFORM_OWNER' && <label className={labelCls}>Default property<select className={field} value={defaultProperty} onChange={event => { setDefaultProperty(event.target.value); setSaved(false); }}>
                  <option value="">Remember my last selection</option>
                  {profile.properties.filter(property => property.is_active).map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
                </select><span className="text-xs font-normal leading-relaxed text-slate-500">Applied at sign-in. Switch properties anytime from the top bar.</span></label>}
              </fieldset>
              <div className={footer}>
                <div className="min-w-0 flex-1">
                  {saveError && <p role="alert" className="text-xs text-rose-600">{saveError}</p>}
                  {saved && <p role="status" className="text-xs text-emerald-700">Profile saved.</p>}
                </div>
                <button type="submit" className={`${primaryBtn} shrink-0 !py-2 !text-xs`} disabled={busy || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
            <form className={`${card} flex flex-col`} onSubmit={changePassword}>
              <div className={sectionHeader}>
                <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Keep your account secure with a strong password.</p>
              </div>
              <input type="text" name="username" autoComplete="username" value={profile.email} readOnly hidden />
              <fieldset disabled={busy} className="min-w-0 space-y-4 px-5 py-5 disabled:opacity-70">
                <label className={labelCls}>Current password<input className={field} type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
                <label className={labelCls}>New password<input className={field} type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
                <label className={labelCls}>Confirm new password<input className={field} type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /><span className="text-xs font-normal leading-relaxed text-slate-500">At least 10 characters. Your other sessions will be signed out.</span></label>
              </fieldset>
              <div className={footer}>
                <div className="min-w-0 flex-1">
                  {passwordError && <p role="alert" className="text-xs text-rose-600">{passwordError}</p>}
                  {passwordChanged && <p role="status" className="text-xs text-emerald-700">Password changed. Your other sessions have been signed out.</p>}
                </div>
                <button type="submit" className={`${secondaryBtn} shrink-0 !py-2 !text-xs`} disabled={busy}>{changingPassword ? 'Changing…' : 'Update password'}</button>
              </div>
            </form>
          </div>
          <p className="text-xs text-slate-500">Email, role, and property access are managed by your administrator.</p>
        </>}
    </div>
  );
}
