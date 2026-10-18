import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'eco-cars-auction-zezndz4i',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_uoanhAsJCzbHNXX6wUaBTCKb83fEE9s_',
  authRequired: false,
  auth: { mode: 'managed' },
})
