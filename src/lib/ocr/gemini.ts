import 'server-only'
import { z } from 'zod'

const extractedLineSchema = z.object({
  raw_line_text: z.string().min(1),
  product_name_guess: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().nonnegative().nullable().optional(),
})

const extractedLinesSchema = z.array(extractedLineSchema)

export type ExtractedReceiptLine = z.infer<typeof extractedLineSchema>

/**
 * Ekstraksi terstruktur pakai Gemini API (keputusan produk: Gemini, bukan Google
 * Cloud Vision) — model diminta langsung mengembalikan JSON array item bon, bukan
 * raw text yang perlu di-parse manual. Lebih cepat dev, tapi CATATAN PRIVASI:
 * foto bon (berpotensi memuat info harga beli/supplier sensitif) dikirim ke API
 * pihak ketiga (Google). Pastikan ini didisclose ke pemilik toko saat onboarding.
 */
export async function extractReceiptWithGemini(imageBase64: string, mimeType: string): Promise<ExtractedReceiptLine[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum diset')

  const prompt = `Kamu membaca foto nota/bon pembelian suku cadang otomotif. Ekstrak setiap baris item
menjadi JSON array dengan bentuk persis:
[{"raw_line_text": string, "product_name_guess": string, "quantity": number, "unit_price": number | null}]
Balas HANYA JSON array tanpa markdown fence, tanpa penjelasan apa pun. Kalau ada baris yang tidak jelas
kuantitasnya, gunakan 1. Abaikan baris subtotal/total/pajak.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini tidak mengembalikan hasil ekstraksi')

  const cleaned = text.replace(/```json|```/g, '').trim()

  let rawParsed: unknown
  try {
    rawParsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Gemini mengembalikan teks yang bukan JSON valid — coba unggah ulang foto yang lebih jelas')
  }

  const validated = extractedLinesSchema.safeParse(rawParsed)
  if (!validated.success) {
    throw new Error(
      `Hasil ekstraksi Gemini tidak sesuai format yang diharapkan: ${validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }

  return validated.data
}
