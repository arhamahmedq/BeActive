import { upsertDeviceToken } from './devices.repo'
import type { RegisterDeviceInput } from './devices.schema'

export async function registerDevice(userId: string, input: RegisterDeviceInput): Promise<void> {
  await upsertDeviceToken(userId, input.token, input.platform)
}
