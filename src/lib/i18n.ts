import { useCallback, useEffect, useState } from 'react';

export type Lang = 'en' | 'fr';

const STORAGE_KEY = 'manohub-lang';

const dictionary = {
  signIn: { en: 'Sign In / Get Started', fr: 'Se connecter / Commencer' },
  backToTenders: { en: 'Back to Tenders', fr: 'Retour aux marchés' },
  pageTitle: { en: 'Procurement Opportunities', fr: 'Opportunités de marchés publics' },
  pageSubtitle: {
    en: 'Government, NGO, donor-funded, and private-sector tenders across Sierra Leone and the region.',
    fr: 'Appels d’offres publics, ONG, bailleurs de fonds et secteur privé en Sierra Leone et dans la région.',
  },
  searchPlaceholder: {
    en: 'Search by keyword (e.g. road, medical supplies, IT consultancy)',
    fr: 'Rechercher par mot-clé (ex. route, fournitures médicales, conseil informatique)',
  },
  search: { en: 'Search', fr: 'Rechercher' },
  allSectors: { en: 'All Sectors', fr: 'Tous les secteurs' },
  allCountries: { en: 'All Countries', fr: 'Tous les pays' },
  allDistricts: { en: 'All Districts', fr: 'Toutes les régions' },
  allNoticeTypes: { en: 'All Notice Types', fr: 'Tous les types d’avis' },
  saveSearch: { en: 'Save this search & get alerts', fr: 'Enregistrer cette recherche et recevoir des alertes' },
  loadingTenders: { en: 'Loading tenders…', fr: 'Chargement des marchés…' },
  loadingTender: { en: 'Loading tender…', fr: 'Chargement du marché…' },
  noResults: {
    en: 'No published tenders match your search yet. Try broadening your filters.',
    fr: 'Aucun marché publié ne correspond à votre recherche. Essayez d’élargir vos filtres.',
  },
  deadline: { en: 'Deadline', fr: 'Échéance' },
  submissionDeadline: { en: 'Submission Deadline', fr: 'Date limite de soumission' },
  estimatedValue: { en: 'Estimated Value', fr: 'Valeur estimée' },
  reference: { en: 'Reference', fr: 'Référence' },
  noticeType: { en: 'Notice Type', fr: 'Type d’avis' },
  procurementMethod: { en: 'Procurement Method', fr: 'Méthode de passation' },
  sector: { en: 'Sector', fr: 'Secteur' },
  location: { en: 'Location', fr: 'Lieu' },
  summary: { en: 'Summary', fr: 'Résumé' },
  description: { en: 'Description', fr: 'Description' },
  eligibility: { en: 'Eligibility & Requirements', fr: 'Éligibilité et exigences' },
  howToApply: { en: 'How to Apply', fr: 'Comment soumissionner' },
  documents: { en: 'Documents', fr: 'Documents' },
  contractAward: { en: 'Contract Award', fr: 'Attribution du marché' },
  amendmentHistory: { en: 'Amendment History', fr: 'Historique des modifications' },
  viewSource: { en: 'View original source', fr: 'Voir la source originale' },
  save: { en: 'Save', fr: 'Enregistrer' },
  saved: { en: 'Saved', fr: 'Enregistré' },
  followBuyer: { en: 'Follow Buyer', fr: 'Suivre l’acheteur' },
  followingBuyer: { en: 'Following Buyer', fr: 'Acheteur suivi' },
  explainTender: { en: 'Explain this tender in simple language', fr: 'Expliquer ce marché en langage simple' },
  thinking: { en: 'Thinking…', fr: 'Réflexion…' },
  aiExplanation: { en: 'AI Explanation', fr: 'Explication IA' },
  aiDisclaimer: {
    en: 'AI-generated — may contain errors. Always confirm details against the official notice above.',
    fr: 'Généré par IA — peut contenir des erreurs. Vérifiez toujours les détails dans l’avis officiel ci-dessus.',
  },
  notFound: { en: 'This tender could not be found, or is no longer public.', fr: 'Ce marché est introuvable ou n’est plus public.' },
  subscribeToViewTitle: { en: 'Subscribe to view full details', fr: 'Abonnez-vous pour voir tous les détails' },
  subscribeToViewBody: {
    en: 'The full description, eligibility requirements, contact details, and how-to-apply instructions are available to Viewer and Publisher subscribers.',
    fr: 'La description complète, les conditions d’éligibilité, les coordonnées et les instructions de candidature sont réservées aux abonnés Lecteur et Éditeur.',
  },
  viewPlans: { en: 'View subscription plans', fr: 'Voir les formules d’abonnement' },
} as const;

export type TranslationKey = keyof typeof dictionary;

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'fr' ? 'fr' : 'en';
}

export function useLanguage() {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback((key: TranslationKey) => dictionary[key][lang], [lang]);

  return { lang, setLang, t };
}
