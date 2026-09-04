/** Thrown by repository methods that exist in the contract but have no implementation yet. */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`SupabaseRepository.${method} is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}
