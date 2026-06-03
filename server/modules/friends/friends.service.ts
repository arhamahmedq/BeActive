import * as friendsRepo from './friends.repo'

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  return friendsRepo.getAcceptedFriendIds(userId)
}
