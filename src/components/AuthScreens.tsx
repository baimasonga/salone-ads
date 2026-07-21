import React, { useState } from 'react';
import { Mail, Lock, User, Building, DollarSign, Globe } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { createOrganization } from '../lib/api';

interface AuthScreensProps {
  mode: 'signin' | 'signup' | 'onboarding';
  onSwitchMode: (newMode: 'signin' | 'signup' | 'onboarding') => void;
  onSuccess: () => void;
}

export function AuthScreens({ mode, onSwitchMode, onSuccess }: AuthScreensProps) {
  // Credentials States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  // Onboarding States
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('Small Business');
  const [country, setCountry] = useState('Sierra Leone');
  const [operatingDistrict, setOperatingDistrict] = useState('Western Area Urban');
  const [focus, setFocus] = useState('Both Local and Diaspora');
  const [mainObjective, setMainObjective] = useState('WhatsApp enquiries');
  const [monthlyBudget, setMonthlyBudget] = useState('Le 15,000,000');

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
          options: { data: { full_name: fullName } },
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
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) setAuthError(error.message);
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
        district: operatingDistrict,
        primaryObjective: mainObjective,
        monthlyBudget,
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
            <span className="font-display font-black tracking-widest text-xl uppercase text-[#0F172A]">SaloneReach</span>
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
                    <option>Agricultural Cooperative</option>
                    <option>Catering & Food Services</option>
                    <option>Tourism Operator</option>
                    <option>NGO / Development Partner</option>
                    <option>Creative Creator Hub</option>
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

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Sierra Leone District</label>
                  <select
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
                    <option>Other / Out-of-Country</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Audience Scope</label>
                  <select
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                  >
                    <option>Both Local and Diaspora</option>
                    <option>Strictly Sierra Leone Local</option>
                    <option>Strictly Diaspora Markets</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Primary Objective</label>
                  <select
                    value={mainObjective}
                    onChange={(e) => setMainObjective(e.target.value)}
                    className="mt-1 block w-full py-2 px-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                  >
                    <option>WhatsApp enquiries</option>
                    <option>Local brand awareness</option>
                    <option>Product sales & bookings</option>
                    <option>NGO public outreach</option>
                    <option>Diaspora sponsorships</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Est. Monthly Budget</label>
                <div className="mt-1 relative rounded-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                  />
                </div>
              </div>

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
          <span className="font-display font-black tracking-widest text-xl uppercase text-[#0F172A]">SaloneReach</span>
        </div>
        <h2 className="font-display font-black text-2xl text-[#0F172A] uppercase tracking-tight">
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </h2>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-500">
          Or{' '}
          <button
            onClick={() => {
              setAuthError('');
              setCheckEmail(false);
              onSwitchMode(mode === 'signin' ? 'signup' : 'signin');
            }}
            className="font-mono font-bold uppercase text-xs text-[#10B981] hover:underline cursor-pointer focus:outline-hidden"
          >
            {mode === 'signin' ? 'start free 14-day trial' : 'sign in to your portal'}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 border-2 border-[#0F172A] rounded-none sm:px-10">
          {checkEmail ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">Check your inbox!</p>
              <p className="text-xs text-slate-500">
                We sent a confirmation link to <strong>{email}</strong>. Confirm your address, then sign in to continue setting up your workspace.
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
            </div>
          ) : (
            <>
              {authError && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{authError}</div>
              )}
              <form className="space-y-6 text-left" onSubmit={handleAuthSubmit}>
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Full Name</label>
                    <div className="mt-1 relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="Alhassan Kamara"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Email Address</label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
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
                  <label className="block text-sm font-semibold text-slate-700">Password</label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-geometric w-full flex justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Continue to Onboarding'}
                </button>
              </form>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
