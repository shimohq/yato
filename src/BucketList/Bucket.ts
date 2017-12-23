export enum BucketCategory {
  Failures,
  Successes,
  Timeouts,
  ShortCircuits
}

export default class Bucket {
  public failures: number = 0
  public successes: number = 0
  public timeouts: number = 0
  public shortCircuits: number = 0

  public runTimes: number[] = []

  get errorCount (): number {
    return this.failures + this.timeouts
  }

  get totalCount (): number {
    return this.errorCount + this.successes
  }

  public increaseValue (category: BucketCategory) {
    switch (category) {
      case BucketCategory.Failures:
        this.failures += 1
        break
      case BucketCategory.ShortCircuits:
        this.shortCircuits += 1
        break
      case BucketCategory.Successes:
        this.successes += 1
        break
      case BucketCategory.Timeouts:
        this.timeouts += 1
        break
    }
  }
}
