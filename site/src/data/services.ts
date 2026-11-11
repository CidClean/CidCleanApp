// Páginas de servicio (D-309). Afirmaciones solo las de D-310: asegurado (general liability) y productos eco-friendly.
import type { ImageMetadata } from 'astro';
import office from '../assets/img/office.jpg';
import medical from '../assets/img/medical.jpg';
import retail from '../assets/img/retail.jpg';
import warehouse from '../assets/img/warehouse.jpg';
import gym from '../assets/img/gym.jpg';

export interface Block { h: string; p: string[]; list?: string[] }
export interface Service {
  slug: string;
  name: string;
  card: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  image: ImageMetadata;
  imageAlt: string;
  og: string;
  estimatorType: string;
  includes: { group: string; items: string[] }[];
  blocks: Block[];
  faqs: { q: string; a: string }[];
}

export const SERVICES: Service[] = [
  {
    slug: 'office-cleaning',
    name: 'Office cleaning',
    card: 'Desks, kitchens, restrooms and floors kept ready for your team and your visitors.',
    title: 'Office Cleaning in Naples, FL | Cid Clean',
    description: 'Scheduled office cleaning in Naples, Bonita Springs, Estero and Marco Island. Free walkthrough, clear monthly quote, insured team and eco-friendly products.',
    h1: 'Office cleaning in Naples, FL',
    intro: [
      'Your office is where clients form a first impression and where your team spends most of its week. We keep it clean on a schedule that fits your hours, so you can stop thinking about trash, smudged glass and restroom supplies.',
      'Cid Clean cleans professional offices of every size across Naples, Bonita Springs, Estero and Marco Island: law and accounting firms, real estate and insurance agencies, property management offices, small corporate suites and coworking spaces.',
    ],
    image: office,
    imageAlt: 'Bright, freshly cleaned open office with desks and large windows',
    og: 'office',
    estimatorType: 'office',
    includes: [
      { group: 'Work areas', items: ['Empty trash and recycling, replace liners', 'Dust desks, shelves, sills and electronics (without moving your papers)', 'Wipe and disinfect phones, door handles, light switches and other touch points', 'Clean glass partitions and entry doors'] },
      { group: 'Kitchens and break rooms', items: ['Wipe counters, tables and cabinet fronts', 'Clean sinks, microwave outside and inside, and appliance fronts', 'Restock paper towels and soap you provide'] },
      { group: 'Restrooms', items: ['Clean and disinfect toilets, urinals, sinks and counters', 'Polish mirrors and fixtures', 'Refill toilet paper, soap and hand towels', 'Mop floors with a disinfecting solution'] },
      { group: 'Floors', items: ['Vacuum carpets and rugs, with edges done regularly', 'Sweep and mop hard floors', 'Spot-clean spills and entry mats'] },
    ],
    blocks: [
      {
        h: 'A cleaning plan built around your office',
        p: [
          'No two offices run the same way. A two-room insurance agency that closes at five needs something different from a busy medical billing office with forty desks and a shared kitchen. That is why every plan starts with a free walkthrough. We look at how many people use the space, which rooms get the most traffic, what kind of floors you have, and when we can work without getting in your way.',
          'Most offices choose evening cleaning after the team leaves, but early-morning visits work well too. Smaller offices often do well with one or two visits a week, while busy offices with a full kitchen and lots of visitors usually need three or five. We will tell you honestly what we think you need, and the estimator on this site gives you a starting range before we even meet.',
        ],
      },
      {
        h: 'Products and care',
        p: [
          'We use eco-friendly cleaning products for everyday work, which keeps strong chemical smells out of the space your team breathes all day. Microfiber cloths and color-coded supplies keep restroom tools away from kitchens and desks. We are insured with general liability coverage, so you are protected while we work in your space.',
          'If you have specific instructions, like a server room we should skip, a conference room that needs extra attention before Monday meetings, or a certain way you want desks left, we write it into your plan so every visit follows it.',
        ],
      },
      {
        h: 'Every visit is recorded',
        p: [
          'Our team clocks in and out of every visit in our own app, so we always know when your office was cleaned and by whom. If something is missed, tell us and we fix it. You get one point of contact for questions, changes to the schedule and extra services like carpet spot treatment or a deeper clean before an inspection or an event.',
        ],
      },
    ],
    faqs: [
      { q: 'How much does office cleaning cost in Naples?', a: 'It depends mostly on the size of the office and how often we clean. Use our estimator for a range based on your square footage and frequency. Your exact monthly price is set after a free walkthrough, and it is written in your quote before you sign anything.' },
      { q: 'Do you clean after business hours?', a: 'Yes. Most of our office clients prefer evenings after the team leaves, and early mornings are also possible. We agree on the days and times in your quote and keep to them.' },
      { q: 'Do I need to provide supplies?', a: 'We bring our own cleaning products and equipment. Most offices provide the consumables their team uses, like toilet paper, paper towels, soap and trash liners, and we restock them on each visit. We can talk about other arrangements during the walkthrough.' },
      { q: 'Do I have to be there when you clean?', a: 'No. Many offices give us a key or an access code. We agree on how access works before the first visit, and every visit is logged with clock-in and clock-out times.' },
      { q: 'Can we change the schedule later?', a: 'Yes. If your office grows, moves or changes hours, tell us and we will adjust the plan and the quote with you.' },
    ],
  },
  {
    slug: 'medical-office-cleaning',
    name: 'Medical office cleaning',
    card: 'Careful cleaning for doctor and dental offices, exam rooms, waiting rooms and restrooms.',
    title: 'Medical & Dental Office Cleaning in Naples, FL | Cid Clean',
    description: 'Medical and dental office cleaning in Naples and Southwest Florida. Exam rooms, waiting areas and restrooms cleaned on your schedule. Free walkthrough.',
    h1: 'Medical and dental office cleaning in Naples, FL',
    intro: [
      'Patients notice everything: the waiting room chairs, the check-in counter, the restroom, the exam table. A medical or dental office has to look and feel clean at every hour it is open, and the cleaning has to happen without interrupting care.',
      'Cid Clean cleans doctor offices, dental practices, physical therapy clinics, chiropractic offices, med spas and other outpatient practices in Naples, Bonita Springs, Estero and Marco Island. We focus on the areas patients and staff touch most and follow the instructions your practice gives us.',
    ],
    image: medical,
    imageAlt: 'Clean, bright medical exam room with a treatment chair and spotless counters',
    og: 'medical',
    estimatorType: 'medical',
    includes: [
      { group: 'Waiting room and front desk', items: ['Wipe and disinfect chairs, armrests, tables and check-in counters', 'Clean entry glass, doors and handles', 'Dust décor, frames and display shelves', 'Vacuum and mop, with entry mats cleaned'] },
      { group: 'Exam and treatment rooms', items: ['Disinfect counters, door handles, light switches and other touch points', 'Clean sinks and fixtures', 'Empty regular trash and replace liners', 'Mop hard floors with a disinfecting solution'] },
      { group: 'Restrooms', items: ['Clean and disinfect toilets, sinks, counters and grab bars', 'Refill soap, paper and towels you provide', 'Polish mirrors and fixtures'] },
      { group: 'Staff areas', items: ['Break room counters, sinks and appliance fronts', 'Offices and workstations dusted and wiped', 'Trash and recycling emptied'] },
    ],
    blocks: [
      {
        h: 'What we do, and what we do not',
        p: [
          'We provide routine environmental cleaning for the non-clinical parts of your practice and the general surfaces of exam and treatment rooms. We do not handle sharps, biohazard containers or regulated medical waste; those stay with your licensed waste provider. We also do not touch instruments, medication or patient records. During the walkthrough we mark which rooms and surfaces are ours and which your clinical staff handles, and we put it in writing.',
          'If your practice uses a specific disinfectant or has its own infection-control instructions, tell us. We can use the product you require for designated surfaces and follow your written procedures.',
        ],
      },
      {
        h: 'Cleaning that fits patient hours',
        p: [
          'Most practices prefer cleaning after the last patient leaves, so rooms are ready first thing in the morning. Busy practices often choose five evenings a week; smaller offices may need fewer visits. Exam rooms and restrooms usually need the most attention, so we plan the visit around them.',
          'We use eco-friendly products for everyday cleaning, which is easier on patients who are sensitive to strong smells. Separate, color-coded cloths and mop heads are used for restrooms and for other areas, to avoid spreading germs from room to room.',
        ],
      },
      {
        h: 'Reliable and accountable',
        p: [
          'We are insured with general liability coverage. Every visit is recorded in our app with clock-in and clock-out times, so you always know when the office was cleaned. If your office manager needs a change, like an extra visit before an inspection or a different day during a holiday week, there is one person to call.',
        ],
      },
    ],
    faqs: [
      { q: 'Do you clean dental offices?', a: 'Yes. We clean dental practices, including waiting rooms, front desks, operatory surfaces outside the clinical work zone, sterilization room floors and counters as your team directs, restrooms and staff areas.' },
      { q: 'Do you remove medical waste?', a: 'No. Sharps, biohazard bags and regulated medical waste must stay with your licensed medical waste provider. We handle regular trash and recycling only.' },
      { q: 'Can you use the disinfectant our practice requires?', a: 'Yes. If you have a required product for certain surfaces, we can use it on those surfaces and follow your written instructions. We talk about this during the walkthrough.' },
      { q: 'How much does medical office cleaning cost?', a: 'Medical offices usually take more time per square foot than standard offices because of exam rooms and restrooms. Our estimator gives you a monthly range for your size and frequency, and the exact price is set after a free walkthrough.' },
      { q: 'Can you clean on weekends?', a: 'We can discuss weekend visits during the walkthrough. Most practices choose weekday evenings after the last patient.' },
    ],
  },
  {
    slug: 'retail-showroom-cleaning',
    name: 'Retail & showroom cleaning',
    card: 'Sparkling glass, clean floors and fitting rooms that make your products look their best.',
    title: 'Retail Store & Showroom Cleaning in Naples, FL | Cid Clean',
    description: 'Retail store and showroom cleaning in Naples, Bonita Springs, Estero and Marco Island. Glass, floors, fitting rooms and restrooms on your schedule.',
    h1: 'Retail store and showroom cleaning in Naples, FL',
    intro: [
      'In retail, the space is part of the product. Fingerprints on a display case, dust on a shelf or a dull floor can make good merchandise look tired. We keep stores and showrooms ready for customers before the doors open.',
      'Cid Clean cleans boutiques, specialty shops, furniture and design showrooms, flooring and kitchen showrooms, galleries and other retail spaces across Naples, Bonita Springs, Estero and Marco Island, from street-front shops to suites in shopping centers.',
    ],
    image: retail,
    imageAlt: 'Elegant retail showroom with polished floors and spotless glass displays',
    og: 'retail',
    estimatorType: 'retail',
    includes: [
      { group: 'Sales floor', items: ['Dust shelves, fixtures and displays (we work around merchandise as you direct)', 'Clean glass display cases, mirrors and storefront glass inside', 'Vacuum, sweep and mop floors; spot-clean high-traffic paths', 'Clean entry doors, handles and mats'] },
      { group: 'Fitting rooms and checkout', items: ['Wipe mirrors, benches and hooks', 'Clean and disinfect counters, card readers and touch points', 'Empty trash and replace liners'] },
      { group: 'Back of house', items: ['Restrooms cleaned and restocked with supplies you provide', 'Break room and stockroom floors', 'Office areas dusted and wiped'] },
    ],
    blocks: [
      {
        h: 'Clean before your customers arrive',
        p: [
          'Most stores want us there after closing or early in the morning, so the floor looks its best when the first customer walks in. In Southwest Florida, sand and rain come in on every pair of shoes, so floors and entry areas usually get the most attention. Glass is the other priority: storefronts, display cases and mirrors show every fingerprint.',
          'Your merchandise stays where you put it. During the walkthrough we agree on what we can move, what we only dust around, and anything delicate we should not touch at all.',
        ],
      },
      {
        h: 'Showrooms with large spaces',
        p: [
          'Furniture, flooring, lighting, kitchen and bath showrooms often have wide open floors and many display vignettes. We plan the work in zones so each visit covers the busiest areas, with a rotation for the rest. Lower-traffic showrooms may only need one visit a week; stores with steady foot traffic usually need more.',
          'Our estimator includes the minimum per visit, so even a small boutique gets a realistic range. If your showroom is very large, we recommend a free walkthrough to price it accurately.',
        ],
      },
      {
        h: 'Products and accountability',
        p: [
          'We use eco-friendly products, which keeps chemical smells off your sales floor and your merchandise. We are insured with general liability coverage, and every visit is logged in our app with clock-in and clock-out times. Need an extra clean before a sale, a holiday or an event? Ask us and we will add it.',
        ],
      },
    ],
    faqs: [
      { q: 'Can you clean before the store opens?', a: 'Yes. We can clean after closing or early in the morning. We agree on days and times in your quote so your store is ready before customers arrive.' },
      { q: 'Will you move our merchandise?', a: 'Only what you tell us to. During the walkthrough we agree on what can be moved, what we only dust around, and what we should not touch.' },
      { q: 'Do you clean outside storefront windows?', a: 'Our regular service covers the inside of the glass and reachable doors. If you need outside window cleaning, ask us during the walkthrough and we will tell you what we can include.' },
      { q: 'How much does retail cleaning cost?', a: 'It depends on size, foot traffic and how often you want cleaning. Our estimator shows a monthly range, including the minimum per visit for smaller stores. Your exact price is set after a free walkthrough.' },
      { q: 'Do you clean stores in shopping centers?', a: 'Yes. We clean suites in shopping centers and plazas as well as street-front shops, and we follow any building rules about access and hours.' },
    ],
  },
  {
    slug: 'warehouse-industrial-cleaning',
    name: 'Warehouse & industrial cleaning',
    card: 'Offices, restrooms, break rooms and floor areas in warehouses and light industrial spaces.',
    title: 'Warehouse & Light Industrial Cleaning in Naples, FL | Cid Clean',
    description: 'Warehouse and light industrial cleaning in Naples, Bonita Springs and Estero. Offices, restrooms, break rooms and floors on a set schedule. Free walkthrough.',
    h1: 'Warehouse and light industrial cleaning in Naples, FL',
    intro: [
      'Warehouses and light industrial buildings have two sides: the open floor where the work happens, and the offices, restrooms and break rooms your team uses every day. Both affect safety, morale and how your business looks to visiting customers and inspectors.',
      'Cid Clean cleans distribution and storage warehouses, flex spaces, contractor shops, light manufacturing and assembly spaces, and the offices attached to them, across Naples, Bonita Springs, Estero and nearby areas.',
    ],
    image: warehouse,
    imageAlt: 'Clean, organized warehouse with clear aisles and sealed concrete floors',
    og: 'warehouse',
    estimatorType: 'warehouse',
    includes: [
      { group: 'Offices and front area', items: ['Dust and wipe desks, counters and reception', 'Empty trash and recycling', 'Vacuum and mop office floors', 'Clean entry doors and glass'] },
      { group: 'Restrooms and locker areas', items: ['Clean and disinfect toilets, urinals, sinks and counters', 'Refill supplies you provide', 'Mop floors with a disinfecting solution'] },
      { group: 'Break rooms', items: ['Wipe tables, counters and appliance fronts', 'Clean sinks and microwaves', 'Empty trash and replace liners'] },
      { group: 'Warehouse floor (as agreed)', items: ['Sweep open aisles and walkways', 'Dust mop sealed concrete', 'Empty floor trash bins', 'Spot-clean spills that are safe for us to handle'] },
    ],
    blocks: [
      {
        h: 'Two rates for two kinds of space',
        p: [
          'Our estimator has separate options for warehouse and light industrial space. A storage warehouse with long open aisles takes much less time per square foot than a light industrial space with workstations, more people and more restrooms. Choose the one that best describes your building to get a fair starting range.',
          'For buildings over 25,000 square feet, the estimator still shows a range, but we strongly recommend a free walkthrough. Large buildings vary a lot, and we would rather price your space based on what we actually see.',
        ],
      },
      {
        h: 'Safety comes first',
        p: [
          'Our team works around your operations, not through them. During the walkthrough we agree on which zones are ours, which areas are off limits, and any safety rules for your site, like high-visibility vests or staying clear of loading docks and moving equipment. We do not operate your machinery, and we do not clean up hazardous materials or chemical spills; those need a specialized contractor.',
          'Many warehouses prefer cleaning after the last shift. If your building runs around the clock, we schedule the visit for the quietest window and focus on the areas people use most.',
        ],
      },
      {
        h: 'Clear records, steady service',
        p: [
          'Every visit is logged in our app with clock-in and clock-out times. We are insured with general liability coverage and use eco-friendly products for routine cleaning of offices, restrooms and break rooms. If you need a one-time deep clean before an audit, a move-in or a customer visit, ask us and we will quote it separately.',
        ],
      },
    ],
    faqs: [
      { q: 'Do you clean the warehouse floor or only the offices?', a: 'Both, depending on what you need. Many clients start with offices, restrooms and break rooms and add sweeping of aisles and walkways. We agree on the zones in your quote.' },
      { q: 'Do you use floor scrubbers?', a: 'Tell us about your floors during the walkthrough. We will explain what our regular service covers and what equipment your floor needs, and quote it clearly.' },
      { q: 'Can you clean hazardous spills?', a: 'No. Hazardous materials and chemical spills need a specialized contractor. We handle routine cleaning of spills that are safe for our team to handle.' },
      { q: 'How is warehouse cleaning priced?', a: 'By size, type of space and frequency. Open storage space costs less per square foot than light industrial space. Use the estimator for a range; for buildings over 25,000 sq ft we recommend a free walkthrough.' },
    ],
  },
  {
    slug: 'gym-fitness-cleaning',
    name: 'Gym & fitness cleaning',
    card: 'Locker rooms, showers, mats and equipment areas kept fresh for your members.',
    title: 'Gym & Fitness Center Cleaning in Naples, FL | Cid Clean',
    description: 'Gym, studio and fitness center cleaning in Naples, Bonita Springs, Estero and Marco Island. Locker rooms, showers, floors and touch points on your schedule.',
    h1: 'Gym and fitness center cleaning in Naples, FL',
    intro: [
      'People judge a gym by its locker room. Members expect fresh showers, clean floors and wiped-down touch points every time they walk in, and they notice quickly when something slips.',
      'Cid Clean cleans gyms, boutique fitness and yoga studios, functional training gyms, martial arts schools, personal training studios and community fitness rooms across Naples, Bonita Springs, Estero and Marco Island.',
    ],
    image: gym,
    imageAlt: 'Clean, bright fitness studio with rubber floors and neatly arranged equipment',
    og: 'gym',
    estimatorType: 'gym',
    includes: [
      { group: 'Workout floor', items: ['Vacuum and mop floors, including rubber flooring', 'Wipe benches, handles and equipment touch points as agreed', 'Clean mirrors and glass', 'Empty trash and replace liners'] },
      { group: 'Locker rooms and showers', items: ['Clean and disinfect toilets, sinks, counters and showers', 'Wipe lockers outside, benches and hooks', 'Mop floors with a disinfecting solution', 'Refill soap, paper and towels you provide'] },
      { group: 'Front desk and lounge', items: ['Disinfect check-in counters and touch points', 'Clean entry doors and glass', 'Dust and wipe seating areas'] },
    ],
    blocks: [
      {
        h: 'Built around peak hours',
        p: [
          'Gyms are busiest early in the morning and after work. We schedule cleaning for your quietest window, usually overnight, late evening or mid-day for studios with class schedules. Locker rooms and showers get the most time, because moisture and heavy use make them the first place members notice a problem.',
          'Most fitness businesses need frequent visits. A small studio with a few classes a day might choose two or three visits a week, while a gym open long hours usually does better with five. The estimator shows how the frequency changes your monthly range.',
        ],
      },
      {
        h: 'Equipment and touch points',
        p: [
          'Members should still wipe down equipment after use, but a regular deeper wipe of benches, handles and machines between sessions makes a real difference. During the walkthrough we agree on which equipment we clean and which products are safe for your upholstery, rubber and screens, following the guidance from your equipment makers when you have it.',
          'We use eco-friendly products for everyday cleaning, which keeps harsh chemical smells out of a space where people are breathing hard. Separate, color-coded cloths and mop heads keep locker-room tools away from the workout floor.',
        ],
      },
      {
        h: 'Accountable every visit',
        p: [
          'We are insured with general liability coverage, and every visit is logged in our app with clock-in and clock-out times. Running a challenge, an open house or a busy January? Ask us for extra visits and we will add them.',
        ],
      },
    ],
    faqs: [
      { q: 'Can you clean overnight?', a: 'Yes. We schedule cleaning in your quietest window, which for many gyms is late at night or before opening. We agree on days and times in your quote.' },
      { q: 'Do you clean the equipment?', a: 'We clean touch points and the equipment we agree on during the walkthrough, using products that are safe for each surface. Members should still wipe equipment after use.' },
      { q: 'Do you do laundry or restock towels?', a: 'We refill supplies you provide in restrooms and locker rooms. Towel laundry is not part of our regular service.' },
      { q: 'How much does gym cleaning cost?', a: 'It depends on size, hours and frequency. Gyms usually need more visits than offices. Use our estimator for a monthly range, and your exact price is set after a free walkthrough.' },
    ],
  },
];

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug);
