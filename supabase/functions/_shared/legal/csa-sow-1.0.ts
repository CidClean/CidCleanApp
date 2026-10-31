// Texto fuente del Scope of Work (Part A) y del Commercial Service Agreement (Part B), plantillas versión 1.0,
// transcrito de legal/rev3/4_SOW_and_Service_Agreement_EN.pdf (legal rev. 3, D-283) para no extraer el PDF en tiempo de
// ejecución. Sin la marca "Draft rev. 3 – final review". Los `{…}` de la plantilla son `{{llave}}`; las llaves son las
// de contract_editable_keys() (migración 20261030000013) más las automáticas (sow_no, csa_no, quote_no, quote_version,
// sow_version). Si cambia el texto legal, se agrega una plantilla nueva con otra versión: esta no se edita.
// Este archivo no contiene llaves de servicios.

export const TEMPLATE_VERSION = '1.0';

export type Bloque =
  | { t: 'title'; text: string }
  | { t: 'meta'; text: string }
  | { t: 'p'; text: string }
  | { t: 'small'; text: string }
  | { t: 'h1'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'bullet'; text: string }
  | { t: 'table2'; rows: [string, string][] }
  | { t: 'table3'; head: [string, string, string]; rows: [string, string, string][] }
  | { t: 'check'; text: string }
  | { t: 'signatures' }
  | { t: 'break' };

export const PLANTILLA: Bloque[] = [
  { t: 'title', text: 'Scope of Work (SOW) Template & Commercial Service Agreement Template' },
  { t: 'meta', text: 'Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · info@cidclean.com · (786) 250-1324' },
  { t: 'meta', text: 'SOW template version: 1.0 · Agreement template version: 1.0 · Effective date: {{effective_date}}' },
  { t: 'p', text: 'Part A (Scope of Work) is attached to each quote. Part B (Commercial Service Agreement) is signed separately by both parties; accepting a quote is not a contract. Fields in {curly braces} are completed for each client.' },

  { t: 'h1', text: 'Part A – Scope of Work' },
  { t: 'meta', text: 'SOW No.: {{sow_no}} · SOW version: {{sow_version}} · Related quote: {{quote_no}} version {{quote_version}} · Date: {{date}}' },
  { t: 'h2', text: 'A1. Parties and site' },
  { t: 'table2', rows: [
    ['Client (legal name)', '{{client_company}}'],
    ['Client contact / title', '{{client_contact}}'],
    ['Service site address', '{{site_address}}'],
    ['Approx. cleanable area', '{{area_sqft}} sq ft; {{floors_rooms}}'],
    ['Facility type', '{{facility_type}}'],
    ['Walkthrough date', '{{walkthrough_date}} (walkthrough photos on file)'],
  ] },
  { t: 'h2', text: 'A2. Service schedule' },
  { t: 'table2', rows: [
    ['Frequency', '{{frequency}}'],
    ['Service window', '{{service_window}}'],
    ['Start date', '{{start_date}}'],
    ['Holidays not serviced', '{{holidays}}'],
  ] },
  { t: 'h2', text: 'A3. Tasks by area' },
  { t: 'table3', head: ['Area', 'Task', 'Frequency'], rows: [
    ['{{a3_offices_area}}', 'Empty trash and replace liners; dust reachable horizontal surfaces; vacuum carpets; spot-clean glass', '{{a3_offices_freq}}'],
    ['{{a3_restrooms_area}}', 'Clean and disinfect toilets, urinals, sinks, counters; clean mirrors; refill dispensers (client-supplied consumables); mop floors', '{{a3_restrooms_freq}}'],
    ['{{a3_breakroom_area}}', 'Clean counters, sinks, exterior of appliances and tables; empty trash; mop floors', '{{a3_breakroom_freq}}'],
    ['{{a3_floors_area}}', 'Sweep and damp mop', '{{a3_floors_freq}}'],
    ['{{a3_entrances_area}}', 'Clean entry glass, dust, vacuum mats', '{{a3_entrances_freq}}'],
    ['{{a3_periodic_area}}', '{{a3_periodic_task}}', '{{a3_periodic_freq}}'],
    ['{{a3_addons_area}}', '{{a3_addons_task}}', '{{a3_addons_freq}}'],
  ] },
  { t: 'h2', text: 'A4. Exclusions' },
  { t: 'p', text: 'Unless listed above, the following are excluded: exterior window washing above ground level, biohazard or bodily-fluid remediation beyond routine restroom cleaning, mold remediation, hazardous materials, moving heavy furniture or equipment, cleaning inside client electronics or equipment, pest control, and any other work not listed in Section A3. Excluded work may be quoted separately.' },
  { t: 'h2', text: 'A5. Supplies and equipment' },
  { t: 'bullet', text: 'Cid Clean provides: cleaning chemicals, tools and equipment {{supplies_cc}}.' },
  { t: 'bullet', text: 'Client provides: {{supplies_client}}.' },
  { t: 'bullet', text: 'On-site storage: {{storage}}; client provides access to water and electricity.' },
  { t: 'h2', text: 'A6. Site access and security' },
  { t: 'bullet', text: 'Access method: {{access_method}}. Number of keys or fobs issued: {{keys_count}}.' },
  { t: 'bullet', text: 'Cid Clean will keep access credentials secure and return them at the end of service.' },
  { t: 'bullet', text: 'Restricted areas: {{restricted_areas}}.' },
  { t: 'bullet', text: 'Client site rules (safety, parking, sign-in) provided to Cid Clean in writing will be followed.' },
  { t: 'h2', text: 'A7. Staffing, quality and records' },
  { t: 'bullet', text: 'Services may be performed by Cid Clean employees and/or vetted independent contractors.' },
  { t: 'bullet', text: 'Cid Clean employees confirm arrival and departure through the Cid Clean app (time and location at clock-in/out). For independent contractors, the app records each completed service day (attendance and satisfactory completion); no hours or location are recorded for contractors.' },
  { t: 'bullet', text: "Work photos may be taken for Cid Clean's internal quality control and records only. They are used exclusively by Cid Clean administration and are never used commercially or on social media." },
  { t: 'bullet', text: 'Quality inspections: {{inspections}}. Report service issues within 24 hours to info@cidclean.com or (786) 250-1324; Cid Clean will correct qualifying issues at no charge at the next scheduled service or within 2 business days, whichever is sooner.' },
  { t: 'h2', text: 'A8. Pricing reference' },
  { t: 'p', text: 'Pricing is stated in the related quote {{quote_no}} version {{quote_version}}: {{price}}, {{tax_clause}}. Accepting the quote and this SOW does not create a contract; services begin only after both parties sign the Commercial Service Agreement. Changes to this SOW require a change order or new quote version accepted by both parties.' },
  { t: 'h2', text: 'A9. Client confirmation' },
  { t: 'check', text: 'I have read this Scope of Work (SOW {{sow_no}}, version {{sow_version}}).' },
  { t: 'p', text: 'Name: {{a9_name}} Title: {{a9_title}} Date/time: {{a9_datetime}} (Recorded electronically via the client portal – confirmation of reading only, not a contract signature.)' },

  { t: 'break' },
  { t: 'h1', text: 'Part B – Commercial Service Agreement' },
  { t: 'meta', text: 'Agreement No.: {{csa_no}} · Template version: 1.0 · Effective date of this Agreement: {{effective_date}}' },
  { t: 'p', text: 'This Commercial Service Agreement (the "Agreement") is entered into between Cid Clean LLC, a Florida limited liability company, 3727 Milano Lakes Cir, Naples, FL 34114 ("Cid Clean"), and {{client_legal_name}}, {{client_entity}}, {{client_address}} ("Client").' },
  { t: 'h2', text: '1. Services' },
  { t: 'p', text: 'Cid Clean will provide the cleaning services described in each Scope of Work ("SOW") and quote accepted by Client (together, the "Service Documents"), which are incorporated into this Agreement. If documents conflict, this Agreement controls, then the SOW, then the quote, unless an SOW or quote expressly states that it overrides a specific section of this Agreement.' },
  { t: 'h2', text: '2. Term and renewal' },
  { t: 'p', text: 'This Agreement starts on the Effective Date (or the service start date in the SOW, if later) and continues for an initial term of 12 months. After that, it renews automatically month to month until either party ends it under Section 9. Either party may give notice of non-renewal at least 30 days before the end of the initial term.' },
  { t: 'h2', text: '3. Fees, invoicing and payment' },
  { t: 'bullet', text: 'Fees are set in the quote accepted by Client and confirmed in the SOW.' },
  { t: 'bullet', text: "Invoicing: Cid Clean invoices monthly, at the beginning of each month, for that month's recurring services; one-time and additional services are invoiced when completed. Payment is due within 15 days of the invoice date by ACH or check, or by card, subject to a card processing fee of up to 3%, as permitted by law and card network rules." },
  { t: 'bullet', text: "Late payment: overdue amounts bear interest at 1.5% per month (18% per year) or the maximum rate allowed by law, whichever is less, from the due date until paid. If an invoice is more than 15 days overdue, Cid Clean may suspend services after 10 days' written notice." },
  { t: 'bullet', text: 'Taxes: Florida sales tax of 6% is added to non-residential cleaning services, and Client pays any other applicable sales or use taxes. Client must provide any valid exemption certificate before invoicing.' },
  { t: 'bullet', text: "Price adjustments: Cid Clean may adjust prices no more than once every 12 months with at least 30 days' written notice. If Client does not accept the adjustment, Client may terminate under Section 9 before it takes effect." },
  { t: 'bullet', text: 'Disputed invoices: Client must notify Cid Clean in writing of any good-faith dispute within 15 days of the invoice date and pay any undisputed portion on time.' },
  { t: 'bullet', text: "Collection costs: Client will reimburse reasonable costs of collecting overdue amounts, including attorneys' fees, as provided in Section 12." },
  { t: 'h2', text: '4. Changes to services' },
  { t: 'p', text: 'Additional, special or one-time services, or changes in scope, frequency or area, require a written change order or updated quote accepted by both parties (including through the client portal).' },
  { t: 'h2', text: '5. Client responsibilities' },
  { t: 'p', text: 'Client will: (a) provide safe access to the site during the service window; (b) provide water, electricity and reasonable storage for supplies; (c) tell Cid Clean in writing about hazards, sensitive areas, alarm procedures and site rules; (d) secure cash, valuables and confidential documents; and (e) designate a contact person for service matters.' },
  { t: 'h2', text: '6. Personnel and independent contractor status' },
  { t: 'bullet', text: "Cid Clean is an independent contractor to Client. Cid Clean alone hires, pays, supervises and directs its personnel (employees and subcontractors) and is responsible for their wages, taxes, and workers' compensation as required by law." },
  { t: 'bullet', text: "Non-solicitation: During the term and for 12 months after it ends, Client will not directly or indirectly hire or engage any Cid Clean employee or contractor who provided services at Client's site in the prior 12 months, except through general job postings not targeted at them. If Client does so, Client will pay Cid Clean a placement fee of $2,500 per person, which the parties agree is a reasonable estimate of Cid Clean's recruiting and training costs and not a penalty." },
  { t: 'bullet', text: "Background checks: Cid Clean does not guarantee background checks of personnel. If Client requires background checks for personnel assigned to its site, the parties will agree on them in the SOW, at Client's cost." },
  { t: 'h2', text: '7. Insurance' },
  { t: 'p', text: 'Cid Clean will maintain, at its cost, during the term of this Agreement:' },
  { t: 'bullet', text: 'Commercial general liability insurance with limits of at least $1,000,000 each occurrence, $1,000,000 general aggregate, $1,000,000 personal and advertising injury, and $100,000 damage to rented premises; and' },
  { t: 'bullet', text: "Workers' compensation insurance whenever required by Chapter 440, Florida Statutes (for a non-construction business, when it employs four or more employees, full- or part-time)." },
  { t: 'p', text: 'A certificate of insurance is available on request.' },
  { t: 'h2', text: '8. Damage, claims and limitation of liability' },
  { t: 'bullet', text: 'Reporting: Client must report any claimed property damage or loss in writing within 48 hours of discovery, with photos where possible, and allow Cid Clean to inspect before repair or replacement, except in an emergency. Claims not reported within 30 days of the service date are waived.' },
  { t: 'bullet', text: "Service issues: Client's remedy for services not performed according to the SOW is re-performance at no charge or, if re-performance is not possible, a credit for the affected service." },
  { t: 'bullet', text: "Mutual indemnification: Each party will defend, indemnify and hold harmless the other party and its members, officers and employees from third-party claims for bodily injury, death or damage to tangible property, to the extent caused by the negligence or willful misconduct of the indemnifying party or its personnel. Where both parties are at fault, responsibility is shared in proportion to each party's fault." },
  { t: 'bullet', text: "Limitation of liability: Except for (a) bodily injury or death, (b) gross negligence or willful misconduct, (c) indemnification for third-party claims, and (d) Client's payment obligations, each party's total liability under this Agreement is limited to the fees paid or payable by Client in the 12 months before the event giving rise to the claim." },
  { t: 'bullet', text: 'No indirect damages: Neither party is liable for indirect, incidental, consequential, special or punitive damages, or lost profits, even if advised of their possibility.' },
  { t: 'h2', text: '9. Termination' },
  { t: 'bullet', text: "For convenience: after the first 90 days, either party may terminate this Agreement at any time by giving 30 days' written notice, with no termination fee." },
  { t: 'bullet', text: 'For cause: either party may terminate on written notice if the other materially breaches and does not cure within 10 days after written notice (5 days for non-payment).' },
  { t: 'bullet', text: 'On termination: Client pays for services performed through the termination date; Cid Clean returns all keys, fobs and access credentials within 3 business days.' },
  { t: 'h2', text: '10. Confidentiality and data' },
  { t: 'p', text: "Each party will keep confidential the other's non-public information, including site security information, access codes, pricing and business information, and will use it only to perform this Agreement. Cid Clean handles personal information as described in its Privacy Policy at cidclean.com/privacy. Work photos are used exclusively by Cid Clean administration for quality control and records, are not shared with Client or third parties, and are never used commercially or on social media." },
  { t: 'h2', text: '11. Force majeure' },
  { t: 'p', text: 'Neither party is liable for delays or failures caused by events beyond its reasonable control, including hurricanes, tropical storms, flooding, government orders, utility outages, or site closures. Recurring services not performed for these reasons will be credited on the next invoice.' },
  { t: 'h2', text: '12. Governing law and disputes' },
  { t: 'bullet', text: 'This Agreement is governed by the laws of the State of Florida, without regard to conflict-of-laws rules.' },
  { t: 'bullet', text: 'Venue: any lawsuit arising from this Agreement will be brought exclusively in the state courts located in Collier County, Florida, and both parties consent to that jurisdiction.' },
  { t: 'bullet', text: "Attorneys' fees: in any dispute arising from this Agreement, including collection of unpaid amounts, the prevailing party is entitled to recover its reasonable attorneys' fees and costs, including on appeal." },
  { t: 'bullet', text: 'JURY TRIAL WAIVER: EACH PARTY KNOWINGLY AND VOLUNTARILY WAIVES ANY RIGHT TO A TRIAL BY JURY IN ANY LAWSUIT ARISING FROM OR RELATED TO THIS AGREEMENT.' },
  { t: 'h2', text: '13. General' },
  { t: 'bullet', text: 'Notices must be in writing and sent to the addresses above or by email (Cid Clean: info@cidclean.com; Client: {{client_email}}), effective upon confirmed delivery.' },
  { t: 'bullet', text: 'Entire agreement: this Agreement and the Service Documents are the entire agreement and replace prior proposals. Client purchase-order terms do not apply.' },
  { t: 'bullet', text: 'Amendments must be in writing and accepted by both parties, which may be done electronically.' },
  { t: 'bullet', text: 'Assignment: neither party may assign without the other\'s written consent, except to a successor in a merger or sale of the business.' },
  { t: 'bullet', text: 'Severability; no waiver; survival: if any provision is unenforceable, the rest remains in effect; failure to enforce is not a waiver; Sections 3, 6 (non-solicitation), 8, 10 and 12 survive termination.' },
  { t: 'bullet', text: 'Electronic signatures and counterparts: this Agreement may be signed electronically (E-SIGN Act; s. 668.50, Fla. Stat.) and in counterparts, each of which is an original.' },
  { t: 'bullet', text: 'Language: this Agreement is provided in English only.' },
  { t: 'h2', text: 'Signatures' },
  { t: 'signatures' },
  { t: 'small', text: 'When signed electronically, an e-signature certificate page (name, verified email, date and time, IP address, browser, and consent to sign electronically) is attached as the last page.' },
];

/** Texto de la casilla de consentimiento del portal de firma, aprobado (D-289). */
export const consentText = (client: string) =>
  `I agree to sign this agreement electronically, and I am authorized to sign on behalf of ${client}.`;
