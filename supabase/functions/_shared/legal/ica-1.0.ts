// Texto fuente del Independent Contractor Agreement, plantilla versión 1.0, transcrito de
// legal/rev3/6_Independent_Contractor_Agreement_EN.pdf (legal rev. 3, D-285; versión mes a mes con estado de cuenta
// mensual, D-287) para no extraer el PDF en tiempo de ejecución. Sin la marca "Draft rev. 3 – final review". Los `{…}`
// de la plantilla son `{{llave}}`; las llaves son las de ica_editable_keys() (migración 20261031000002) más las
// automáticas (ica_no, template_version). Si cambia el texto legal, se agrega una plantilla nueva con otra versión: esta
// no se edita. Este archivo no contiene llaves de servicios.

export const ICA_TEMPLATE_VERSION = '1.0';

export type BloqueIca =
  | { t: 'title'; text: string }
  | { t: 'meta'; text: string }
  | { t: 'p'; text: string }
  | { t: 'small'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'bullet'; text: string }
  | { t: 'num'; n: string; text: string }
  | { t: 'table3'; head: [string, string, string]; rows: [string, string, string][] }
  | { t: 'signatures' };

export const PLANTILLA_ICA: BloqueIca[] = [
  { t: 'title', text: 'Independent Contractor Agreement' },
  { t: 'meta', text: 'Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · info@cidclean.com · (786) 250-1324' },
  { t: 'meta', text: 'Template version: {{template_version}} · Agreement No.: {{ica_no}} · Effective date of this Agreement: {{effective_date}}' },
  { t: 'p', text: 'This Independent Contractor Agreement (the "Agreement") is entered into between Cid Clean LLC, a Florida limited liability company, 3727 Milano Lakes Cir, Naples, FL 34114 ("Cid Clean"), and {{contractor_name}}, {{contractor_entity}}, {{contractor_address}}, {{contractor_email}}, {{contractor_phone}} ("Contractor").' },

  { t: 'h2', text: '1. Services' },
  { t: 'p', text: 'Contractor will provide commercial cleaning services at client sites offered by Cid Clean from time to time (each, a "Job"). Each Job offer describes the client site, the Scope of Work (the result to be delivered), the client\'s site-access window, and the rate for the Job. Contractor is free to accept or decline any Job offer, and declining a Job has no consequence.' },
  { t: 'p', text: 'Term. This Agreement is month to month. It begins on the Effective Date and renews automatically for successive one-month periods until either party ends it under Section 10.' },

  { t: 'h2', text: '2. Independent contractor relationship' },
  { t: 'bullet', text: 'Independent business. Contractor is an independent contractor and not an employee, partner, or agent of Cid Clean. Nothing in this Agreement or in the Cid Clean app creates an employment relationship.' },
  { t: 'bullet', text: 'Control of methods. Cid Clean defines the result to be delivered at each site (the client\'s Scope of Work). Contractor alone decides how, and by whom among its approved helpers, the work is performed. Cid Clean does not supervise Contractor\'s methods, set working hours, or require training, other than the client\'s site safety and access rules.' },
  { t: 'bullet', text: 'Client access windows. A client\'s access window (for example, after business hours) is a client site requirement, not a work schedule set by Cid Clean.' },
  { t: 'bullet', text: 'Other work. Contractor may provide services to other businesses, including other cleaning companies, subject only to Section 9 (Non-solicitation).' },
  { t: 'bullet', text: 'Profit or loss. Contractor is paid per completed service, not by the hour, and may realize a profit or loss depending on how it performs the work.' },
  { t: 'bullet', text: 'Helpers. Contractor may use its own helpers only if Cid Clean approves them in advance for client-site access. Contractor is solely responsible for its helpers\' pay, taxes, insurance, conduct, and compliance with this Agreement.' },
  { t: 'bullet', text: 'No benefits. Contractor and its helpers are not eligible for Cid Clean\'s employee benefits, unemployment compensation, or workers\' compensation coverage.' },

  { t: 'h2', text: '3. Tools, equipment and supplies' },
  { t: 'p', text: 'Contractor provides its own tools, equipment, cleaning chemicals, transportation, and phone, at its own cost. Consumables that the client supplies under its Scope of Work (such as restroom paper products, hand soap and trash liners) remain the client\'s property and may be used only at that site.' },

  { t: 'h2', text: '4. Service days – no hours tracking' },
  { t: 'bullet', text: 'No hours, clock-in or GPS. Cid Clean does not track Contractor\'s working hours or location. Contractor is not required to clock in or clock out.' },
  { t: 'bullet', text: 'Service-day record. For each Job, the Cid Clean app records a service day: the date, the client site, that Contractor attended, and that the work was completed satisfactorily according to the Scope of Work.' },
  { t: 'bullet', text: 'If Contractor has app access, Contractor marks the service day as completed and a Cid Clean administrator approves it.' },
  { t: 'bullet', text: 'If Contractor does not have app access, a Cid Clean administrator records and approves the service day.' },
  { t: 'bullet', text: 'Corrections. If a service day is not approved because the work does not meet the Scope of Work, Cid Clean will tell Contractor what needs correcting. Contractor will correct it at no extra charge at the next visit or within 1 business day, whichever is sooner, and the service day will then be approved.' },

  { t: 'h2', text: '5. Payment' },
  { t: 'bullet', text: 'Rates. Cid Clean pays Contractor the per-service-day rate stated in Schedule A or in the accepted Job offer for each approved service day.' },
  { t: 'bullet', text: 'Monthly statement and payment. Within 5 business days after the end of each calendar month, Cid Clean issues one monthly statement listing Contractor\'s approved service days for that month, each at the applicable per-service-day rate. Cid Clean pays the statement total within 7 days after the statement date. Contractor should report any error in a statement within 7 days of receiving it.' },
  { t: 'bullet', text: 'Taxes. Contractor is solely responsible for all federal, state and local taxes on amounts paid under this Agreement. Cid Clean will not withhold taxes, except backup withholding if required by the IRS, and will issue Form 1099-NEC as required.' },
  { t: 'bullet', text: 'Form W-9. Contractor must complete and sign Form W-9 (electronically in the Cid Clean app or on paper) before the first payment. Cid Clean keeps the signed W-9 for 4 years after this Agreement ends and then securely destroys it.' },

  { t: 'h2', text: '6. Insurance and licenses' },
  { t: 'p', text: 'Contractor is responsible for any business licenses, registrations and insurance that Contractor needs to operate its business. Cid Clean does not currently require Contractor to carry general liability or workers\' compensation insurance. If a specific client site requires particular coverage, Cid Clean will say so in the Job offer, and Contractor may decline that Job. Contractor may upload certificates of insurance it carries in the Cid Clean app.' },

  { t: 'h2', text: '7. Cid Clean app' },
  { t: 'bullet', text: 'Contractor must accept the Cid Clean Staff App Terms & Conditions, and each new version of them, to use the app. If Contractor does not accept a new version, Contractor cannot use the app and service days will be recorded by an administrator.' },
  { t: 'bullet', text: 'Contractor will keep its login private and will not let anyone else mark service days on its account.' },

  { t: 'h2', text: '8. Confidentiality and work photos' },
  { t: 'bullet', text: 'Confidential information includes client names, site addresses, alarm and door codes, keys and access devices, pricing and rates, and anything Contractor sees or learns at a client site. Contractor will use it only to perform Jobs and will not disclose it, during or after this Agreement.' },
  { t: 'bullet', text: 'Keys and access devices must be kept secure and returned within 2 business days after this Agreement ends or when Cid Clean requests them.' },
  { t: 'bullet', text: 'Work photos taken for Jobs are for Cid Clean\'s administrative use only (quality control and records). Contractor may not use work photos for any commercial purpose or post or share them on social media or anywhere outside the Cid Clean app.' },

  { t: 'h2', text: '9. Non-solicitation of clients and staff' },
  { t: 'p', text: 'To protect Cid Clean\'s legitimate business interests in its substantial relationships with specific existing clients and in its confidential information (section 542.335, Florida Statutes), during this Agreement and for 12 months after it ends, Contractor will not, directly or through others:' },
  { t: 'num', n: '1.', text: 'solicit or provide cleaning services to any Cid Clean client whose site Contractor serviced, or about which Contractor received confidential information, during the last 12 months of this Agreement; or' },
  { t: 'num', n: '2.', text: 'induce any Cid Clean client to end or reduce its business with Cid Clean, or induce any Cid Clean worker to stop working with Cid Clean.' },
  { t: 'p', text: 'Contractor agrees these restrictions are reasonable in time, area (the client sites concerned) and scope, and that Cid Clean may seek an injunction to enforce them in addition to any other remedy.' },

  { t: 'h2', text: '10. Conduct, warnings and termination' },
  { t: 'bullet', text: 'Standards. Contractor will follow each client\'s site safety, security and access rules and will not falsify service-day records.' },
  { t: 'bullet', text: 'Three warnings. If Contractor breaches this Agreement or the Staff App Terms (including falsifying records or repeated unsatisfactory work), Cid Clean will issue a written warning describing the issue. After three (3) written warnings, Cid Clean may terminate this Agreement by written notice.' },
  { t: 'bullet', text: 'Immediate termination. Cid Clean may terminate immediately, without prior warnings, for theft, violence or threats, harassment, use of alcohol or illegal drugs at a client site, conduct that endangers safety, or a client\'s written request that Contractor no longer service its site.' },
  { t: 'bullet', text: 'Termination for convenience. Although the Agreement renews monthly, either party may end it at any time, including mid-month, with 7 days\' written notice (email is sufficient). Otherwise it continues to renew each month.' },
  { t: 'bullet', text: 'On termination. Cid Clean issues a final statement for all approved service days through the termination date (including a partial month) with the next monthly statement and pays it on the normal schedule. Sections 5 (taxes), 8, 9, 11 and 12 survive.' },

  { t: 'h2', text: '11. Responsibility for damage' },
  { t: 'p', text: 'Contractor is responsible for loss or damage to client or Cid Clean property, and for injury to third parties, to the extent caused by the negligence or willful misconduct of Contractor or its helpers. Contractor will indemnify and hold harmless Cid Clean from third-party claims to that extent, and from any taxes, penalties or claims arising from Contractor\'s own tax obligations or its helpers\' pay. Contractor must report any damage or incident at a client site to Cid Clean the same day.' },

  { t: 'h2', text: '12. Governing law and disputes' },
  { t: 'bullet', text: 'This Agreement is governed by the laws of the State of Florida.' },
  { t: 'bullet', text: 'Venue: any lawsuit arising from this Agreement will be brought exclusively in the state courts located in Collier County, Florida.' },
  { t: 'bullet', text: 'Attorneys\' fees: the prevailing party in any dispute arising from this Agreement is entitled to recover its reasonable attorneys\' fees and costs, including on appeal.' },
  { t: 'bullet', text: 'JURY TRIAL WAIVER: EACH PARTY KNOWINGLY AND VOLUNTARILY WAIVES ANY RIGHT TO A TRIAL BY JURY IN ANY LAWSUIT ARISING FROM OR RELATED TO THIS AGREEMENT.' },

  { t: 'h2', text: '13. General' },
  { t: 'bullet', text: 'Entire agreement: this Agreement, Schedule A and accepted Job offers are the entire agreement between the parties about the services and replace prior understandings. Amendments must be in writing and accepted by both parties, which may be done electronically.' },
  { t: 'bullet', text: 'Notices must be in writing and may be sent by email to info@cidclean.com (Cid Clean) and to Contractor\'s email above.' },
  { t: 'bullet', text: 'Assignment: Contractor may not assign this Agreement without Cid Clean\'s written consent.' },
  { t: 'bullet', text: 'Severability; no waiver: if any provision is unenforceable, the rest remains in effect (and a court may narrow an overbroad restriction under section 542.335); failure to enforce a provision is not a waiver.' },
  { t: 'bullet', text: 'Electronic signatures: this Agreement may be signed electronically (E-SIGN Act; section 668.50, Florida Statutes). This Agreement is provided in English only.' },

  { t: 'h2', text: 'Schedule A – Rates' },
  { t: 'table3', head: ['Client site / Job type', 'Rate', 'Basis'], rows: [
    ['{{sched_site_1}}', '{{sched_rate_1}}', 'per approved service day'],
    ['{{sched_site_2}}', '{{sched_rate_2}}', 'per approved service day'],
  ] },

  { t: 'h2', text: 'Signatures' },
  { t: 'signatures' },
  { t: 'small', text: 'When signed electronically, an e-signature certificate page (name, verified email, date and time, IP address, browser, and consent to sign electronically) is attached as the last page.' },
];

/** Texto de la casilla de consentimiento del portal de firma del contratista (D-200, en inglés como el ICA). */
export const icaConsentText = () => 'I have read this Independent Contractor Agreement and I agree to sign it electronically.';
