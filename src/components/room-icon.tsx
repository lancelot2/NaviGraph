import {
  Bed,
  Bath,
  Utensils,
  UtensilsCrossed,
  Briefcase,
  DoorOpen,
  Shirt,
  Car,
  Sofa,
  Package,
  Trees,
  Home,
  Refrigerator,
  Toilet,
  Warehouse,
  type LucideIcon,
} from "lucide-react"

// Keyword → icon rules (first match wins), covering FR + EN room names. Used
// when a room has no photo, so the graph node still reads at a glance.
const RULES: [RegExp, LucideIcon][] = [
  [/cuisin|kitchen/i, Utensils],
  [/salle ?[àa] ?manger|dining/i, UtensilsCrossed],
  [/bain|bath|douche|shower/i, Bath],
  [/toilet|\bwc\b|powder|lavabo/i, Toilet],
  [/chambre|bed ?room|bedroom/i, Bed],
  [/bureau|office|study|travail/i, Briefcase],
  [/entr[ée]e|entrance|foyer|hall|porch/i, DoorOpen],
  [/dressing|closet|\bwic\b|penderie|v[êe]tement/i, Shirt],
  [/garage|parking|voiture/i, Car],
  [/salon|living|great ?room|s[ée]jour|lounge/i, Sofa],
  [/pantry|rangement|storage|garde-manger|placard|cellier/i, Package],
  [/patio|outdoor|terrasse|jardin|balcon|ext[ée]rieur/i, Trees],
  [/buander|laundry|lingerie/i, Shirt],
  [/entrep[ôo]t|warehouse|hangar/i, Warehouse],
  [/frigo|refriger/i, Refrigerator],
]

export function roomIcon(name: string | null | undefined): LucideIcon {
  const n = (name ?? "").trim()
  for (const [re, Icon] of RULES) if (re.test(n)) return Icon
  return Home
}
