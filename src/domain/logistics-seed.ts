// Начальный белый список для логистических компаний
// Используется при создании новой организации

export const LOGISTICS_GLOBAL_ALLOWLIST = [
  // Load Boards
  { domain: 'dat.com', category: 'loadboard', isWildcard: true, notes: 'DAT Load Board' },
  { domain: 'truckstop.com', category: 'loadboard', isWildcard: true, notes: 'Truckstop Load Board' },
  { domain: '123loadboard.com', category: 'loadboard', isWildcard: true, notes: '123 Load Board' },
  { domain: 'directfreight.com', category: 'loadboard', isWildcard: true, notes: 'Direct Freight' },
  { domain: 'getloaded.com', category: 'loadboard', isWildcard: true, notes: 'Get Loaded' },
  { domain: 'uship.com', category: 'loadboard', isWildcard: true, notes: 'uShip' },
  { domain: 'convoy.com', category: 'loadboard', isWildcard: true, notes: 'Convoy' },
  { domain: 'loadsmart.com', category: 'loadboard', isWildcard: true, notes: 'Loadsmart' },

  // Brokers & 3PL
  { domain: 'coyote.com', category: 'broker', isWildcard: true, notes: 'Coyote Logistics' },
  { domain: 'echo.com', category: 'broker', isWildcard: true, notes: 'Echo Global Logistics' },
  { domain: 'chrw.com', category: 'broker', isWildcard: true, notes: 'C.H. Robinson' },
  { domain: 'xpo.com', category: 'broker', isWildcard: true, notes: 'XPO Logistics' },
  { domain: 'total-quality.com', category: 'broker', isWildcard: true, notes: 'TQL' },
  { domain: 'ryderlogistics.com', category: 'broker', isWildcard: true, notes: 'Ryder' },
  { domain: 'globaltranz.com', category: 'broker', isWildcard: true, notes: 'GlobalTranz' },
  { domain: 'nolan.com', category: 'broker', isWildcard: false, notes: 'Nolan Transportation' },

  // Factoring
  { domain: 'ooida.com', category: 'factoring', isWildcard: true, notes: 'OOIDA' },
  { domain: 'rts.com', category: 'factoring', isWildcard: true, notes: 'RTS Financial' },
  { domain: 'triumphbusiness.com', category: 'factoring', isWildcard: true, notes: 'Triumph Business Capital' },
  { domain: 'rivierafinance.com', category: 'factoring', isWildcard: true, notes: 'Riviera Finance' },
  { domain: 'tafs.com', category: 'factoring', isWildcard: true, notes: 'TAFS' },
  { domain: 'oapfactoring.com', category: 'factoring', isWildcard: true, notes: 'OAP Factoring' },

  // ELD / Telematics
  { domain: 'samsara.com', category: 'eld', isWildcard: true, notes: 'Samsara ELD' },
  { domain: 'motive.com', category: 'eld', isWildcard: true, notes: 'Motive (KeepTruckin)' },
  { domain: 'omnitracs.com', category: 'eld', isWildcard: true, notes: 'Omnitracs' },
  { domain: 'geotab.com', category: 'eld', isWildcard: true, notes: 'Geotab' },
  { domain: 'verizonconnect.com', category: 'eld', isWildcard: true, notes: 'Verizon Connect' },

  // TMS
  { domain: 'mcleodsoftware.com', category: 'tms', isWildcard: true, notes: 'McLeod Software' },
  { domain: 'mercurygate.com', category: 'tms', isWildcard: true, notes: 'MercuryGate TMS' },
  { domain: 'aljex.com', category: 'tms', isWildcard: true, notes: 'Aljex TMS' },
  { domain: 'rose-rocket.com', category: 'tms', isWildcard: true, notes: 'Rose Rocket TMS' },
  { domain: 'axon.software', category: 'tms', isWildcard: true, notes: 'Axon Software' },

  // Maps & Routing
  { domain: 'maps.google.com', category: 'maps', isWildcard: false, notes: 'Google Maps' },
  { domain: 'google.com', category: 'maps', isWildcard: true, notes: 'Google' },
  { domain: 'waze.com', category: 'maps', isWildcard: true, notes: 'Waze' },
  { domain: 'pcmiler.com', category: 'maps', isWildcard: true, notes: 'PC Miler Routing' },
  { domain: 'here.com', category: 'maps', isWildcard: true, notes: 'HERE Maps' },

  // Email providers
  { domain: 'gmail.com', category: 'email', isWildcard: true, notes: 'Gmail' },
  { domain: 'outlook.com', category: 'email', isWildcard: true, notes: 'Outlook' },
  { domain: 'office.com', category: 'email', isWildcard: true, notes: 'Microsoft Office' },
  { domain: 'microsoft.com', category: 'email', isWildcard: true, notes: 'Microsoft' },
  { domain: 'yahoo.com', category: 'email', isWildcard: true, notes: 'Yahoo Mail' },
  { domain: 'protonmail.com', category: 'email', isWildcard: true, notes: 'ProtonMail' },

  // Auth / Identity providers (SSO)
  { domain: 'auth0.com', category: 'auth', isWildcard: true, notes: 'Auth0 SSO' },
  { domain: 'okta.com', category: 'auth', isWildcard: true, notes: 'Okta SSO' },
  { domain: 'microsoftonline.com', category: 'auth', isWildcard: true, notes: 'Microsoft SSO' },
  { domain: 'accounts.google.com', category: 'auth', isWildcard: false, notes: 'Google SSO' },

  // CDN / Static resources
  { domain: 'cloudflare.com', category: 'cdn', isWildcard: true, notes: 'Cloudflare CDN' },
  { domain: 'amazonaws.com', category: 'cdn', isWildcard: true, notes: 'AWS S3/CDN' },
  { domain: 'cloudfront.net', category: 'cdn', isWildcard: true, notes: 'AWS CloudFront' },
  { domain: 'fastly.net', category: 'cdn', isWildcard: true, notes: 'Fastly CDN' },
  { domain: 'akamaized.net', category: 'cdn', isWildcard: true, notes: 'Akamai CDN' },

  // Document / PDF tools
  { domain: 'docusign.com', category: 'document', isWildcard: true, notes: 'DocuSign' },
  { domain: 'hellosign.com', category: 'document', isWildcard: true, notes: 'HelloSign' },
  { domain: 'adobe.com', category: 'document', isWildcard: true, notes: 'Adobe' },
  { domain: 'dropbox.com', category: 'document', isWildcard: true, notes: 'Dropbox' },

  // Support tools
  { domain: 'zendesk.com', category: 'support', isWildcard: true, notes: 'Zendesk' },
  { domain: 'intercom.io', category: 'support', isWildcard: true, notes: 'Intercom' },
  { domain: 'freshdesk.com', category: 'support', isWildcard: true, notes: 'Freshdesk' },
];

// Домены которые НИКОГДА не должны быть в allowlist (известные фишинговые паттерны)
export const GLOBAL_BLOCKLIST_SEEDS = [
  { domain: 'paypal-verify-account.com', category: 'other', notes: 'Known phishing' },
  { domain: 'microsoft-login-verify.com', category: 'other', notes: 'Known phishing' },
  { domain: 'google-secure-verify.com', category: 'other', notes: 'Known phishing' },
];
