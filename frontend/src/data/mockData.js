import redSaree from '../assets/red-saree.png';
import palluSwatch from '../assets/pallu-swatch.png';
import borderSwatch from '../assets/border-swatch.png';
import bodySwatch from '../assets/body-swatch.png';
import silkSaree from '../assets/silk-saree.png';
import cottonSaree from '../assets/cotton-saree.png';
import bridalSaree from '../assets/bridal-saree.png';
import traditionalSaree from '../assets/traditional-saree.png';

export const batches = [
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'generating',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 3,
    borderCount: 3,
    bodyCount: 3,
    totalDesigns: 24,
    generatedDesigns: 8,
    extraCount: 21,
    thumbnails: [palluSwatch, borderSwatch, bodySwatch],
  },
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'completed',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 3,
    borderCount: 3,
    bodyCount: 3,
    totalDesigns: 24,
    generatedDesigns: 24,
    extraCount: 5,
    thumbnails: [palluSwatch, borderSwatch, bodySwatch],
  },
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'completed',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 3,
    borderCount: 3,
    bodyCount: 3,
    totalDesigns: 24,
    generatedDesigns: 24,
    extraCount: 1,
    thumbnails: [palluSwatch, borderSwatch, bodySwatch],
  },
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'completed',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 3,
    borderCount: 3,
    bodyCount: 3,
    totalDesigns: 24,
    generatedDesigns: 24,
    extraCount: 21,
    thumbnails: [palluSwatch, borderSwatch, bodySwatch],
  },
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'completed',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 3,
    borderCount: 3,
    bodyCount: 3,
    totalDesigns: 24,
    generatedDesigns: 24,
    extraCount: 21,
    thumbnails: [palluSwatch, borderSwatch, bodySwatch],
  },
  {
    id: 'FS-2025-06-09-12',
    name: 'Fusion Batch',
    status: 'completed',
    createdOn: '09 Jun 2025, 10.30 AM',
    palluCount: 1,
    borderCount: 0,
    bodyCount: 0,
    totalDesigns: 24,
    generatedDesigns: 24,
    extraCount: 0,
    thumbnails: [palluSwatch],
  },
];

export const generatedDesigns = Array.from({ length: 20 }, (_, i) => ({
  id: `FS-12-00${i + 1}`,
  name: 'Red saree with peacock design',
  image: redSaree,
  tags: ['P1', 'BR2', 'B3'],
  matchPercent: i % 3 === 0 ? '85% match' : i % 3 === 1 ? '72% match' : '93% match',
}));

export const materials = [
  { name: 'Banarasi Silk', details: 'Premium + Zari Weave', price: 4235, selected: true },
  { name: 'Kanchipuram Silk', details: 'Premium + Zari Weave', price: 3256 },
  { name: 'Tussar Silk', details: 'Premium + Zari Weave', price: 2500 },
  { name: 'Organza Silk', details: 'Premium + Zari Weave', price: 1500 },
];

export const uploadedComponents = {
  pallu: [
    { label: 'P1', image: palluSwatch },
    { label: 'P2', image: palluSwatch },
    { label: 'P3', image: palluSwatch },
  ],
  border: [
    { label: 'BR1', image: borderSwatch },
    { label: 'BR2', image: borderSwatch },
  ],
  body: [],
};

export const sareeCategories = [
  { name: 'Silk sarees', image: silkSaree },
  { name: 'Cotton sarees', image: cottonSaree },
  { name: 'Bridal sarees', image: bridalSaree },
  { name: 'Traditional sarees', image: traditionalSaree },
];

export const latestSarees = Array.from({ length: 16 }, (_, i) => ({
  id: `FS-12-00${i + 1}`,
  name: 'Red saree with peacock design',
  image: redSaree,
  tags: ['P1', 'BR2', 'B3'],
  matchPercent: `${Math.floor(70 + Math.random() * 25)}% match`,
}));
