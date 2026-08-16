import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

let configured = false
function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  configured = true
}

/**
 * Kirim push notification ke satu atau semua staf tenant (staffId null = broadcast).
 * Endpoint yang sudah revoke browser (410 Gone) ditandai is_active=false, bukan
 * dihapus, supaya riwayat pengiriman tetap bisa ditelusuri (§7 desain database).
 */
export async function sendPushNotification(params: {
  businessId: string
  staffId: string | null
  title: string
  body: string
}) {
  ensureConfigured()
  const admin = createAdminClient()

  let query = admin.from('push_subscriptions').select('id, staff_id, endpoint, keys').eq('is_active', true)

  if (params.staffId) {
    query = query.eq('staff_id', params.staffId)
  } else {
    const { data: staffIds } = await admin.from('staff').select('id').eq('business_id', params.businessId)
    query = query.in('staff_id', (staffIds ?? []).map((s) => s.id))
  }

  const { data: subscriptions } = await query
  if (!subscriptions) return

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify({ title: params.title, body: params.body })
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          await admin.from('push_subscriptions').update({ is_active: false }).eq('id', sub.id)
        }
      }
    })
  )
}
