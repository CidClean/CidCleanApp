// Páginas de ciudad (D-308, D-309): lo propio de cada ciudad sin inventar datos ni cifras.
export interface Location {
  slug: string;
  name: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  areas: string[];
  areasText: string;
  businesses: { h: string; p: string }[];
  local: { h: string; p: string[] }[];
  services: string[]; // slugs, en el orden en que se destacan
  nearby: string[];
  faqs: { q: string; a: string }[];
}

export const LOCATIONS: Location[] = [
  {
    slug: 'naples',
    name: 'Naples',
    title: 'Commercial Cleaning in Naples, FL | Cid Clean',
    description: 'Commercial cleaning in Naples, FL for offices, medical practices, retail stores, warehouses and gyms. Free walkthrough and a clear monthly quote.',
    h1: 'Commercial cleaning in Naples, FL',
    intro: [
      'Naples is home base for Cid Clean. We clean offices, medical and dental practices, shops, showrooms, warehouses and gyms across the city, on a schedule that fits each business.',
      'Every new client starts with a free walkthrough. We visit your space, listen to what you need and send a written monthly quote. No long sales process and no surprises on the invoice.',
    ],
    areas: ['Downtown and Fifth Avenue South', 'Third Street South and Old Naples', 'Tamiami Trail (US-41) corridor', 'Pine Ridge Road and Airport-Pulling Road', 'North Naples and Vanderbilt Beach Road', 'Immokalee Road', 'East Naples and Davis Boulevard', 'Golden Gate area'],
    areasText: 'We clean businesses all over Naples, from the shops and offices downtown to the medical and business parks along the main corridors and the warehouses in the industrial areas.',
    businesses: [
      { h: 'Professional offices', p: 'Law, accounting, wealth management, real estate and insurance offices are a big part of Naples business life. We keep reception areas, conference rooms and restrooms ready for clients every morning.' },
      { h: 'Medical and dental practices', p: 'Naples has many doctor, dental and therapy offices in medical plazas around the city. We clean waiting rooms, exam rooms and restrooms after the last patient leaves.' },
      { h: 'Retail and showrooms', p: 'From boutiques downtown to furniture, design and flooring showrooms along the main roads, we keep glass, floors and displays looking their best.' },
      { h: 'Warehouses and service businesses', p: 'Contractors, distributors and service companies with warehouse or flex space count on us for offices, restrooms, break rooms and swept floors.' },
    ],
    local: [
      {
        h: 'Cleaning for the Naples seasons',
        p: [
          'Business in Naples changes with the seasons. Winter and spring bring more residents and visitors, busier stores and fuller waiting rooms, which means more foot traffic, more sand and more restroom use. Summer is quieter for many businesses, but the rain and humidity bring their own work on entries and floors.',
          'Your plan can change with your business. Many clients add visits in the busy months and scale back when things slow down. Just tell us, and we will update your schedule and your quote.',
        ],
      },
      {
        h: 'Local and easy to reach',
        p: [
          'We are a Naples company, so when you call you talk to someone who knows the area. We are insured with general liability coverage, use eco-friendly products for everyday cleaning, and log every visit in our app with clock-in and clock-out times.',
        ],
      },
    ],
    services: ['office-cleaning', 'medical-office-cleaning', 'retail-showroom-cleaning', 'warehouse-industrial-cleaning', 'gym-fitness-cleaning'],
    nearby: ['bonita-springs', 'estero', 'marco-island'],
    faqs: [
      { q: 'Do you serve all of Naples?', a: 'Yes. We clean businesses throughout Naples, including downtown, North Naples, East Naples and the Golden Gate area. If you are not sure we cover your location, call us.' },
      { q: 'Is the walkthrough really free?', a: 'Yes. The walkthrough is free and there is no obligation. We use it to understand your space and give you an accurate monthly quote.' },
      { q: 'How fast can you start?', a: 'After you approve the quote and sign the service agreement, we set a start date with you. Call us if you need to start soon and we will tell you our earliest available date.' },
      { q: 'How much does commercial cleaning cost in Naples?', a: 'It depends on the type of space, size and frequency. Our estimator gives you a monthly range in a minute, and our guide on cleaning costs in Naples explains what affects the price.' },
    ],
  },
  {
    slug: 'bonita-springs',
    name: 'Bonita Springs',
    title: 'Commercial Cleaning in Bonita Springs, FL | Cid Clean',
    description: 'Commercial cleaning in Bonita Springs, FL: offices, medical offices, retail, warehouses and gyms. Free walkthrough, clear monthly quote, insured team.',
    h1: 'Commercial cleaning in Bonita Springs, FL',
    intro: [
      'Bonita Springs sits right between Naples and Fort Myers, and its businesses serve both. We clean offices, medical practices, stores, gyms and warehouses throughout Bonita Springs, a short drive north from our home base in Naples.',
      'Each new client starts with a free walkthrough. We look at your space, ask how your business runs and send a written monthly quote with the tasks, days and times.',
    ],
    areas: ['Bonita Beach Road', 'Old 41 Road and downtown Bonita', 'Tamiami Trail (US-41)', 'Imperial Parkway', 'Terry Street and Pennsylvania Avenue', 'Areas along I-75'],
    areasText: 'We clean businesses across Bonita Springs, from the shops and restaurants downtown to the offices and plazas along the main roads and the service businesses near I-75.',
    businesses: [
      { h: 'Offices and professional services', p: 'Real estate, title, insurance and financial offices along US-41 and Bonita Beach Road need clean, welcoming reception areas and restrooms for clients.' },
      { h: 'Medical and dental offices', p: 'Bonita Springs has many medical and dental practices that serve year-round and seasonal residents. We clean after hours so rooms are ready for the first patient.' },
      { h: 'Retail and showrooms', p: 'Shops in plazas and along the main roads count on clean floors and clear glass, especially when beach traffic brings in sand.' },
      { h: 'Gyms and service businesses', p: 'Fitness studios, gyms and contractors with warehouse space need steady cleaning of locker rooms, restrooms, break rooms and floors.' },
    ],
    local: [
      {
        h: 'Beach town, busy season',
        p: [
          'With the beach a few minutes away, sand finds its way into almost every business in Bonita Springs. Entry areas, floors and restrooms get extra attention in our plans here. In the winter months, when seasonal residents are back and traffic picks up, many businesses add visits to keep up with the foot traffic.',
          'Your plan is not fixed. If you need more help in the busy season and less in the summer, we adjust your schedule and quote with you.',
        ],
      },
      {
        h: 'Close to Naples, and to you',
        p: [
          'Because Bonita Springs is next door to Naples, it is part of our regular service area, not an add-on. We are insured with general liability coverage, use eco-friendly products, and log every visit in our app with clock-in and clock-out times.',
        ],
      },
    ],
    services: ['office-cleaning', 'medical-office-cleaning', 'retail-showroom-cleaning', 'gym-fitness-cleaning', 'warehouse-industrial-cleaning'],
    nearby: ['estero', 'naples', 'marco-island'],
    faqs: [
      { q: 'Is Bonita Springs part of your regular service area?', a: 'Yes. Bonita Springs is one of our four main service areas, together with Naples, Estero and Marco Island.' },
      { q: 'Do you charge extra for travel to Bonita Springs?', a: 'Your monthly price is set in your quote after the free walkthrough, and it includes everything for the agreed service. There are no surprise fees on the invoice.' },
      { q: 'Can you clean before we open?', a: 'Yes. We can clean after closing or early in the morning. We agree on days and times in the quote.' },
      { q: 'How do I get a price?', a: 'Use the estimator on our site for a monthly range, then book a free walkthrough. Your exact price is set after we see the space.' },
    ],
  },
  {
    slug: 'estero',
    name: 'Estero',
    title: 'Commercial Cleaning in Estero, FL | Cid Clean',
    description: 'Commercial cleaning in Estero, FL for offices, medical practices, retail, warehouses and gyms. Free walkthrough and a written monthly quote.',
    h1: 'Commercial cleaning in Estero, FL',
    intro: [
      'Estero has grown into a busy place to do business, with shopping centers, medical offices, office parks and service companies along its main roads. We clean them on schedules that fit each business, from a small suite to a large flex building.',
      'Getting started is simple: a free walkthrough, a written monthly quote, a service agreement and then cleaning on the days and times you choose.',
    ],
    areas: ['Coconut Point area', 'Corkscrew Road', 'Estero Parkway', 'Three Oaks Parkway', 'Tamiami Trail (US-41)', 'Ben Hill Griffin Parkway', 'Williams Road'],
    areasText: 'We clean businesses throughout Estero, from the shopping and dining areas to the medical buildings, office parks and flex spaces along the main roads.',
    businesses: [
      { h: 'Retail and shopping centers', p: 'Stores and showrooms in Estero shopping areas need clean floors, clear glass and fresh fitting rooms before the doors open.' },
      { h: 'Medical and dental offices', p: 'Estero has many medical buildings and practices. We clean waiting rooms, exam rooms and restrooms after hours.' },
      { h: 'Offices and office parks', p: 'Corporate suites, professional offices and coworking spaces count on us for clean desks, kitchens, conference rooms and restrooms.' },
      { h: 'Flex space and warehouses', p: 'Service companies, distributors and contractors with flex or warehouse space need offices, restrooms and floors kept in order.' },
    ],
    local: [
      {
        h: 'Newer buildings, high expectations',
        p: [
          'Many Estero businesses work in newer buildings with modern finishes, large windows and open floor plans. Those spaces look great when they are clean, and they show dust, fingerprints and streaks quickly when they are not. We pay attention to glass, stainless steel and hard floors so your space keeps looking new.',
          'Shopping areas and medical buildings see heavy traffic in the busy season. If you need more visits in the winter months, we adjust your schedule and quote with you.',
        ],
      },
      {
        h: 'One team, one point of contact',
        p: [
          'You have one person to call for changes, extra services or questions. We are insured with general liability coverage, use eco-friendly products for routine cleaning, and log every visit in our app with clock-in and clock-out times.',
        ],
      },
    ],
    services: ['retail-showroom-cleaning', 'medical-office-cleaning', 'office-cleaning', 'warehouse-industrial-cleaning', 'gym-fitness-cleaning'],
    nearby: ['bonita-springs', 'naples', 'marco-island'],
    faqs: [
      { q: 'Do you clean stores in Estero shopping centers?', a: 'Yes. We clean retail suites and showrooms in shopping centers and plazas, and we follow building rules about access and hours.' },
      { q: 'Do you clean medical offices in Estero?', a: 'Yes. We clean medical and dental offices, including waiting rooms, exam room surfaces, restrooms and staff areas. We do not handle regulated medical waste.' },
      { q: 'Is the walkthrough free in Estero?', a: 'Yes. The walkthrough is always free, with no obligation.' },
      { q: 'How often should my Estero business be cleaned?', a: 'It depends on your foot traffic and type of space. Our guide on cleaning frequency explains the common choices, and the estimator shows how frequency changes the price.' },
    ],
  },
  {
    slug: 'marco-island',
    name: 'Marco Island',
    title: 'Commercial Cleaning on Marco Island, FL | Cid Clean',
    description: 'Commercial cleaning on Marco Island, FL for offices, retail, medical offices and gyms. Free walkthrough, clear monthly quote, insured team.',
    h1: 'Commercial cleaning on Marco Island, FL',
    intro: [
      'Marco Island businesses serve residents, seasonal visitors and vacationers, often all on the same day. We clean offices, shops, medical offices and fitness studios on the island so they are ready for whoever walks through the door.',
      'Every new client starts with a free walkthrough on the island. We see your space, ask what you need and send a written monthly quote.',
    ],
    areas: ['Collier Boulevard', 'Bald Eagle Drive', 'North Barfield Drive', 'San Marco Road', 'Island shopping centers and plazas', 'Office and professional buildings'],
    areasText: 'We clean businesses across Marco Island, from the shops and offices along Collier Boulevard to the plazas and professional buildings around the island.',
    businesses: [
      { h: 'Real estate and property offices', p: 'Real estate, rental and property management offices are busy on the island. We keep their reception areas, offices and restrooms ready for clients.' },
      { h: 'Retail shops', p: 'Island boutiques, gift shops and specialty stores deal with sand and salt air every day. Clean floors and clear glass keep them inviting.' },
      { h: 'Medical and dental offices', p: 'Practices on the island serve full-time and seasonal residents. We clean after hours so every room is ready in the morning.' },
      { h: 'Fitness studios and clubs', p: 'Studios and fitness rooms need fresh locker rooms, restrooms and floors for members and guests.' },
    ],
    local: [
      {
        h: 'Sand, salt air and the season',
        p: [
          'On an island, sand comes in on every pair of shoes and salt air leaves a film on glass and metal faster than on the mainland. We plan extra attention for entries, floors, glass and fixtures. The busy season brings more people and more traffic, so many island businesses add visits in the winter and scale back in the summer.',
          'Getting to the island takes planning, so we schedule your visits on fixed days and times and keep to them.',
        ],
      },
      {
        h: 'Reliable, insured and accountable',
        p: [
          'We are insured with general liability coverage, use eco-friendly products for everyday cleaning, and log every visit in our app with clock-in and clock-out times. If something needs attention, you have one person to call.',
        ],
      },
    ],
    services: ['office-cleaning', 'retail-showroom-cleaning', 'medical-office-cleaning', 'gym-fitness-cleaning', 'warehouse-industrial-cleaning'],
    nearby: ['naples', 'estero', 'bonita-springs'],
    faqs: [
      { q: 'Do you really come out to Marco Island?', a: 'Yes. Marco Island is one of our four main service areas. We schedule island visits on fixed days and times.' },
      { q: 'Do you clean vacation rentals or condos?', a: 'No. We only do commercial cleaning: offices, stores, medical offices, gyms and similar business spaces. Condo association offices and other business spaces are welcome.' },
      { q: 'Is the walkthrough free on the island?', a: 'Yes. The walkthrough is free and there is no obligation.' },
      { q: 'How do I get a price?', a: 'Use our estimator for a monthly range, then book a free walkthrough. Your exact price is set after we see the space.' },
    ],
  },
];

export const locationBySlug = (slug: string) => LOCATIONS.find((l) => l.slug === slug);
