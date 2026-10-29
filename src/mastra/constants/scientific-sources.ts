export interface ScientificSource {
  organizationName: string;
  url: string;
  description: string;
}

/**
 * 7 Official Scientific Sources recognized globally in cosmetic chemistry & dermatological safety.
 */
export const SCIENTIFIC_SOURCES: readonly ScientificSource[] = [
  {
    organizationName: 'National Institutes of Health (NIH)',
    url: 'https://www.ncbi.nlm.nih.gov/',
    description: 'Biomedical and genomic database providing peer-reviewed clinical research on dermatological formulations.',
  },
  {
    organizationName: 'American Academy of Dermatology (AAD)',
    url: 'https://www.aad.org/',
    description: 'Clinical guidelines and dermatological consensus on topical active ingredients and skin conditions.',
  },
  {
    organizationName: 'European Chemicals Agency (ECHA)',
    url: 'https://echa.europa.eu/',
    description: 'European regulatory authority for chemical safety and cosmetic ingredient classification (CosIng database).',
  },
  {
    organizationName: 'Therapeutic Goods Administration (TGA)',
    url: 'https://www.tga.gov.au/',
    description: 'Australian Government Department of Health evaluation for sunscreen and active therapeutic ingredients.',
  },
  {
    organizationName: 'U.S. Food and Drug Administration (FDA)',
    url: 'https://www.fda.gov/',
    description: 'Cosmetics and OTC sunscreen regulations, pregnancy safety warnings, and safety monographs.',
  },
  {
    organizationName: 'PubMed Central',
    url: 'https://pubmed.ncbi.nlm.nih.gov/',
    description: 'Free full-text archive of biomedical and life sciences journal literature for topical active efficacy.',
  },
  {
    organizationName: 'Environmental Working Group (EWG Skin Deep)',
    url: 'https://www.ewg.org/',
    description: 'Safety assessment ratings, hazard profiles, and allergen identification for cosmetic compounds.',
  },
] as const;

export const DEFAULT_SCIENTIFIC_SOURCES = SCIENTIFIC_SOURCES.map((source) => ({
  organizationName: source.organizationName,
  url: source.url,
}));
