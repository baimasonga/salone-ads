import React, { useState } from 'react';
import { Mail, Lock, User, Building, DollarSign, Globe } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { createOrganization } from '../lib/api';
import { SUBSCRIBER_TYPES, type SubscriberType } from '../domain/subscriptions/subscriberTypes';

interface AuthScreensProps {
  mode: 'signin' | 'signup' | 'onboarding' | 'forgot-password' | 'update-password';
  onSwitchMode: (newMode: 'signin' | 'signup' | 'onboarding' | 'forgot-password' | 'update-password') => void;
  onSuccess: () => void;
}

const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';

export function AuthScreens({ mode, onSwitchMode, onSuccess }: AuthScreensProps) {
  // Credentials States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Onboarding States
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('Small Business');
  const [country, setCountry] = useState('Sierra Leone');
  const [operatingDistrict, setOperatingDistrict] = useState('Western Area Urban');
  const [city, setCity] = useState('Freetown');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [focus, setFocus] = useState('Both Local and Diaspora');
  const [mainObjective, setMainObjective] = useState('WhatsApp enquiries');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [geographicCoverage, setGeographicCoverage] = useState('');
  const [sectors, setSectors] = useState('');
  const [tenderInterests, setTenderInterests] = useState('');
  const [tenderFrequency, setTenderFrequency] = useState('Occasional');
  const [contactPerson, setContactPerson] = useState('');
  const [preferredChannels, setPreferredChannels] = useState('ManoHub, WhatsApp');
  const [freeInterests, setFreeInterests] = useState('Tenders and business opportunities');
  const [subscriberType, setSubscriberType] = useState<SubscriberType>('free');

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // App.tsx reacts to the auth state change and routes to the right view.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is required before a session is issued.
          setCheckEmail(true);
        } else {
          onSwitchMode('onboarding');
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: new URL('/?auth=update-password', window.location.origin).toString(),
      });
      if (error) throw error;
      // Keep the response intentionally neutral so the form does not reveal
      // whether an account exists for a submitted address.
      setRecoveryEmailSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Could not request a password reset. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (password.length < 8) {
      setAuthError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setPassword('');
      setConfirmPassword('');
      onSwitchMode('signin');
    } catch (err: any) {
      setAuthError(err.message || 'Could not update your password. Please request a new reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      await createOrganization({
        orgName,
        orgType,
        country,
        district: country.trim().toLowerCase() === 'sierra leone' ? operatingDistrict : '',
        city,
        website,
        phone,
        whatsapp,
        description: orgDescription,
        primaryObjective: subscriberType === 'advertiser' ? mainObjective : '',
        audienceScope: subscriberType === 'advertiser' ? focus : '',
        monthlyBudgetSle: subscriberType === 'advertiser' && monthlyBudget ? Number(monthlyBudget) : null,
        subscriberType,
        subscriberDetails: subscriberType === 'viewer'
          ? { registration_number: registrationNumber, geographic_coverage: geographicCoverage, sectors, tender_interests: tenderInterests }
          : subscriberType === 'publisher'
            ? { procurement_sectors: sectors, tender_frequency: tenderFrequency, contact_person: contactPerson }
            : subscriberType === 'advertiser'
              ? { preferred_channels: preferredChannels }
              : { interests: freeInterests, preferred_locations: geographicCoverage },
      });
      onSuccess();
    } catch (err: any) {
      setAuthError(err.message || 'Could not create your organization. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'onboarding') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-6 lg:px-8 border-4 md:border-8 border-[#0F172A]">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="flex justify-center items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-[#0F172A] flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border-2 border-white"></div>
            </div>
            <span className="font-display font-black tracking-widest text-xl uppercase text-[#0F172A]">Manohub</span>
          </div>
          <h2 className="font-display font-black text-2xl text-[#0F172A] uppercase tracking-tight">Configure active organization</h2>
          <p className="mt-2 text-sm text-slate-500">
            Let's customize your workspace context so our AI and analytics tailor perfectly.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
          <div className="bg-white py-8 px-6 border-2 border-[#0F172A] rounded-none sm:px-10">
            {authError && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{authError}</div>
            )}
            <form onSubmit={handleOnboardingSubmit} className="space-y-6 text-left">
              <fieldset>
                <legend className="block text-sm font-semibold text-slate-700">Subscriber Type</legend>
                <p className="mt-1 text-xs text-slate-500">Paid selections create a pending request. Access starts only after payment confirmation.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {SUBSCRIBER_TYPES.map((type) => (
                    <label key={type.value} className={`cursor-pointer border-2 p-3 ${subscriberType === type.value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                      <input type="radio" name="onboardingSubscriberType" value={type.value} checked={subscriberType === type.value} onChange={() => setSubscriberType(type.value)} className="sr-only" />
                      <span className="block text-sm font-bold text-slate-900">{type.label}</span>
                      <span className="mt-1 block text-xs text-slate-500">{type.description}</span>
                      <span className="mt-2 block text-[10px] font-semibold text-slate-600">{type.features.join(' · ')}</span>
                      <span className="mt-2 block font-mono text-[9px] font-bold uppercase text-emerald-700">{type.value === 'free' ? 'Immediate access' : 'Payment activation required'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Organization Name</label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bo Cocoa Cooperative"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Organization Type</label>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value)}
                    className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                  >
                    <option>Small Business</option>
                    <option>Sole Trader / Individual Professional</option>
                    <option>Private Company</option>
                    <option>Agricultural Cooperative</option>
                    <option>Catering & Food Services</option>
                    <option>Tourism Operator</option>
                    <option>NGO / Development Partner</option>
                    <option>Government Ministry / Agency</option>
                    <option>Local Council</option>
                    <option>State-Owned Enterprise</option>
                    <option>Educational Institution</option>
                    <option>Creative / Creator Hub</option>
                    <option>Diaspora Association</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Operating Country</label>
                  <div className="mt-1 relative rounded-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                    />
                  </div>
                </div>

                {country.trim().toLowerCase() === 'sierra leone' && <div>
                  <label className="block text-sm font-semibold text-slate-700">Sierra Leone District</label>
                  <select
                    required
                    value={operatingDistrict}
                    onChange={(e) => setOperatingDistrict(e.target.value)}
                    className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                  >
                    <option>Western Area Urban (Freetown)</option>
                    <option>Western Area Rural</option>
                    <option>Bo</option>
                    <option>Kenema</option>
                    <option>Makeni (Bombali)</option>
                    <option>Port Loko</option>
                    <option>Kono</option>
                  </select>
                </div>}

                <div>
                  <label className="block text-sm font-semibold text-slate-700">City / Town</label>
                  <input required value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Website <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Telephone</label>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">WhatsApp <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>
              </div>

              <div><label className="block text-sm font-semibold text-slate-700">Organisation Description</label><textarea required maxLength={1000} rows={3} value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" /></div>

              {subscriberType === 'viewer' && <fieldset className="space-y-4 border-2 border-emerald-200 bg-emerald-50/40 p-4">
                <legend className="px-2 text-sm font-bold text-emerald-900">Supplier preferences</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Registration number <span className="font-normal">(optional)</span><input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Geographic coverage<input required value={geographicCoverage} onChange={(e) => setGeographicCoverage(e.target.value)} placeholder="e.g. Nationwide, Bo and Kenema" className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Sectors served<input required value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="Construction, agriculture, ICT" className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Tender interests<input required value={tenderInterests} onChange={(e) => setTenderInterests(e.target.value)} placeholder="Goods, works, consulting" className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                </div>
              </fieldset>}

              {subscriberType === 'publisher' && <fieldset className="space-y-4 border-2 border-sky-200 bg-sky-50/50 p-4">
                <legend className="px-2 text-sm font-bold text-sky-900">Procurement profile</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Procurement sectors<input required value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="Infrastructure, health, agriculture" className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Expected tender frequency<select value={tenderFrequency} onChange={(e) => setTenderFrequency(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal"><option>Occasional</option><option>Monthly</option><option>Quarterly</option><option>Continuous</option></select></label>
                  <label className="text-xs font-bold text-slate-600 sm:col-span-2">Procurement contact person<input required value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                </div>
              </fieldset>}

              {subscriberType === 'advertiser' && <fieldset className="space-y-4 border-2 border-amber-200 bg-amber-50/50 p-4">
                <legend className="px-2 text-sm font-bold text-amber-950">Advertising preferences</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Audience scope<select value={focus} onChange={(e) => setFocus(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal"><option>Both Local and Diaspora</option><option>Strictly Sierra Leone Local</option><option>Strictly Diaspora Markets</option></select></label>
                  <label className="text-xs font-bold text-slate-600">Primary objective<select value={mainObjective} onChange={(e) => setMainObjective(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal"><option>WhatsApp enquiries</option><option>Local brand awareness</option><option>Product sales & bookings</option><option>NGO public outreach</option><option>Diaspora sponsorships</option></select></label>
                  <label className="text-xs font-bold text-slate-600">Preferred channels<input required value={preferredChannels} onChange={(e) => setPreferredChannels(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Estimated monthly budget (SLE)<span className="relative mt-1 block"><DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input type="number" min="0" step="0.01" required value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} className="block w-full border border-slate-300 bg-white py-2 pl-9 pr-2 text-sm font-normal" /></span></label>
                </div>
              </fieldset>}

              {subscriberType === 'free' && <fieldset className="space-y-4 border-2 border-slate-200 bg-slate-50 p-4">
                <legend className="px-2 text-sm font-bold text-slate-800">Interests</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Topics of interest<input required value={freeInterests} onChange={(e) => setFreeInterests(e.target.value)} className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-600">Preferred locations<input value={geographicCoverage} onChange={(e) => setGeographicCoverage(e.target.value)} placeholder="e.g. Freetown, Bo, Nationwide" className="mt-1 block w-full border border-slate-300 bg-white p-2 text-sm font-normal" /></label>
                </div>
              </fieldset>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-geometric w-full flex justify-center cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Setting Up Workspace…' : 'Complete Workspace Setup'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-6 lg:px-8 border-4 md:border-8 border-[#0F172A]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-[#0F172A] flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <span className="font-display font-black tracking-widest text-xl uppercase text-[#0F172A]">Manohub</span>
        </div>
        <h2 className="font-display font-black text-2xl text-[#0F172A] uppercase tracking-tight">
          {mode === 'signin'
            ? 'Sign In'
            : mode === 'signup'
              ? 'Create Account'
              : mode === 'forgot-password'
                ? 'Reset Password'
                : 'Choose New Password'}
        </h2>
        {(mode === 'signin' || mode === 'signup') && <p className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-500">
          Or{' '}
          <button
            onClick={() => {
              setAuthError('');
              setCheckEmail(false);
              onSwitchMode(mode === 'signin' ? 'signup' : 'signin');
            }}
            className="font-mono font-bold uppercase text-xs text-[#047857] hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F172A]"
          >
            {mode === 'signin' ? 'create a free account' : 'sign in to your portal'}
          </button>
        </p>}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 border-2 border-[#0F172A] rounded-none sm:px-10">
          {checkEmail ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">Check your inbox!</p>
              <p className="text-xs text-slate-500">
                If <strong>{email}</strong> is a new address, a confirmation link has been sent. If you registered before, sign in with your existing password or reset it.
              </p>
              <button
                onClick={() => {
                  setCheckEmail(false);
                  onSwitchMode('signin');
                }}
                className="btn-geometric-secondary w-full flex justify-center cursor-pointer mt-4"
              >
                Back to Sign In
              </button>
              <button
                onClick={() => {
                  setCheckEmail(false);
                  setRecoveryEmailSent(false);
                  onSwitchMode('forgot-password');
                }}
                className="w-full py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700 hover:underline"
              >
                Reset existing password
              </button>
            </div>
          ) : mode === 'forgot-password' ? (
            recoveryEmailSent ? (
              <div className="text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800">Check your inbox</p>
                <p className="text-xs leading-relaxed text-slate-500">
                  If an account exists for <strong>{email}</strong>, a password-reset link has been sent. Also check your spam or junk folder.
                </p>
                <button onClick={() => onSwitchMode('signin')} className="btn-geometric-secondary w-full flex justify-center cursor-pointer mt-4">
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                {authError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm p-3">{authError}</div>}
                <form className="space-y-6 text-left" onSubmit={handlePasswordRecovery}>
                  <p className="text-sm leading-relaxed text-slate-600">Enter the email used for your ManoHub account. We will send a secure password-reset link.</p>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Email Address</label>
                    <div className="mt-1 relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-geometric w-full flex justify-center disabled:opacity-50">
                    {submitting ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  <button type="button" onClick={() => onSwitchMode('signin')} className="btn-geometric-secondary w-full flex justify-center">Back to Sign In</button>
                </form>
              </>
            )
          ) : mode === 'update-password' ? (
            <>
              {authError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm p-3">{authError}</div>}
              <form className="space-y-6 text-left" onSubmit={handlePasswordUpdate}>
                <p className="text-sm leading-relaxed text-slate-600">Choose a new password for your ManoHub account.</p>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">New Password</label>
                  <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Confirm New Password</label>
                  <input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm" />
                </div>
                <button type="submit" disabled={submitting} className="btn-geometric w-full flex justify-center disabled:opacity-50">
                  {submitting ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </>
          ) : (
            <>
              {authError && (
                <div role="alert" className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{authError}</div>
              )}
              <form className="space-y-6 text-left" onSubmit={handleAuthSubmit}>
                {mode === 'signup' && (
                  <>
                  <div>
                    <label htmlFor="auth-full-name" className="block text-sm font-semibold text-slate-700">Full Name</label>
                    <div className="mt-1 relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        id="auth-full-name"
                        name="fullName"
                        autoComplete="name"
                        type="text"
                        required
                        placeholder="Alhassan Kamara"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                  </>
                )}

                <div>
                  <label htmlFor="auth-email" className="block text-sm font-semibold text-slate-700">Email Address</label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="auth-email"
                      name="email"
                      autoComplete="email"
                      type="email"
                      required
                      placeholder="name@salonemail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-sm font-semibold text-slate-700">Password</label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="auth-password"
                      name="password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                    />
                  </div>
                </div>

                {mode === 'signup' && <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-600">
                  <input type="checkbox" required checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span>I agree to ManoHub's Terms of Service and Privacy Policy and understand that paid access begins after payment verification.</span>
                </label>}

                <button
                  type="submit"
                  disabled={submitting || (mode === 'signup' && !acceptedTerms)}
                  className="btn-geometric w-full flex justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Continue to Onboarding'}
                </button>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setRecoveryEmailSent(false);
                      onSwitchMode('forgot-password');
                    }}
                    className="w-full font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700 hover:underline"
                  >
                    Forgot your password?
                  </button>
                )}
              </form>

              {GOOGLE_AUTH_ENABLED && (
                <div className="mt-6 border-t border-[#0F172A] pt-6">
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-[#0F172A] rounded-none bg-white hover:bg-slate-50 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A] transition-colors cursor-pointer"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
