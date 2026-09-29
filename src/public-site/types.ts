export const BUSINESS = {
  name: 'Fort Peck Auto',
  tagline: 'Auto Repair • Towing • Wheel Alignments • Used Auto Parts',
  phone: '406-653-1011',
  phoneHref: 'tel:+14066531011',
  location: 'Wolf Point, Montana',
  ebayStoreUrl: 'https://www.ebay.com/str/fortpeckautollc',
  partsDivision: 'Wolf Point Auto Parts & Supply',
  domain: 'fortpeckauto.com',
};

export const HOURS = [
  { day: 'Monday', time: '9:00 AM – 5:00 PM' },
  { day: 'Tuesday', time: '9:00 AM – 5:00 PM' },
  { day: 'Wednesday', time: '9:00 AM – 5:00 PM' },
  { day: 'Thursday', time: '9:00 AM – 5:00 PM' },
  { day: 'Friday', time: '9:00 AM – 5:00 PM' },
  { day: 'Saturday', time: null },
  { day: 'Sunday', time: null },
];

export type PageId =
  | 'home'
  | 'repair'
  | 'towing'
  | 'alignment'
  | 'parts'
  | 'hours'
  | 'contact'
  | 'find-a-part'
  | 'product'
  | 'portal';

export interface NavItem {
  id: PageId;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'repair', label: 'Auto Repair' },
  { id: 'towing', label: 'Towing' },
  { id: 'alignment', label: 'Alignments' },
  { id: 'parts', label: 'Parts & eBay Store' },
  { id: 'hours', label: 'Hours & Location' },
  { id: 'contact', label: 'Contact' },
  { id: 'portal', label: 'Customer Portal' },
];
