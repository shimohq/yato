export enum BucketCategory {
  Failures,
  Successes,
  Timeouts,
  ShortCircuits
}

export default class Bucket {
  failures: number = 0
  successes: number = 0
  timeouts: number = 0
  shortCircuits: number = 0

  runTimes: Array<number> = []

  get errorCount(): number {
    return this.failures + this.timeouts
  }

  get totalCount(): number {
    return this.errorCount + this.successes
  }
}
