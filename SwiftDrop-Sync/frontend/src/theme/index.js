// src/theme/index.js — design tokens
export const colors = {
  bg: '#0E1116', surface: '#161B22', surface2: '#1F2630', border: '#2A323D',
  text: '#F3F6FB', textDim: '#9AA6B2', primary: '#18C96C', primaryDk: '#0FA557',
  accent: '#3B82F6', warn: '#F59E0B', danger: '#EF4444', white: '#FFFFFF', pill: '#243042',
};
export const font = {
  regular: 'DMSans-Regular', medium: 'DMSans-Medium', light: 'DMSans-Light',
  display: 'Syne-Bold', displayX: 'Syne-ExtraBold', semi: 'Syne-SemiBold',
};
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const statusMeta = {
  pending:        { label: 'Pending',        color: '#9AA6B2' },
  finding_rider:  { label: 'Finding rider',  color: '#F59E0B' },
  rider_assigned: { label: 'Rider assigned', color: '#3B82F6' },
  rider_arrived:  { label: 'Rider arrived',  color: '#3B82F6' },
  picked_up:      { label: 'Picked up',      color: '#18C96C' },
  in_transit:     { label: 'In transit',     color: '#18C96C' },
  delivered:      { label: 'Delivered',      color: '#18C96C' },
  cancelled:      { label: 'Cancelled',      color: '#EF4444' },
  failed:         { label: 'Failed',         color: '#EF4444' },
};
export const naira = (kobo) => `₦${((kobo || 0) / 100).toLocaleString('en-NG')}`;
