import type { LocationType } from './response'

export interface CreateLocationPayload {
  name: string
  type: LocationType
  address?: string
  latitude?: number | null
  longitude?: number | null
}
