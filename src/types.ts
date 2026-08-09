export interface MergedPlaylist {
  id: string
  name: string
  imageUrl: string | null
  trackCount: number
  externalUrl: string
  description: string
  tags: string[]
}
