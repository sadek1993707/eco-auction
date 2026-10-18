// Auto-generated from your database schema — do not edit by hand.
// Regenerates automatically whenever a table is created or altered.

export type AuctionBidsRow = {
  id: string
  userId: string
  carId: string
  bidderName: string
  amount: number | string
  createdAt: string
}

export type AuctionCarsRow = {
  id: string
  userId: string
  title: string
  make: string
  model: string
  year: number | string
  mileage: number | string
  transmission: string
  fuel: string
  condition: string
  location: string
  imageUrl: string
  startingBid: number | string
  auctionEndsAt: string
  description: string
  createdAt: string
}
