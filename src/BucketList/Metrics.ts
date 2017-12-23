import Bucket from './Bucket'

export default class Metrics {
  private totalCount: number = 0
  private errorCount: number = 0
  private failures: number = 0
  private successes: number = 0
  private timeouts: number = 0
  private shortCircuits: number = 0

  public involve ({errorCount, totalCount, failures, timeouts, successes, shortCircuits}: Bucket): Metrics {
    this.errorCount += errorCount
    this.totalCount += totalCount
    this.failures += failures
    this.timeouts += timeouts
    this.successes += successes
    this.timeouts += shortCircuits

    return this
  }

  public hasError (): boolean {
    return this.errorCount > 0
  }

  public overThreshold (errorThreshold: number, volumeThreshold: number): boolean {
    // 超过指定请求数
    if (this.totalCount <= volumeThreshold) {
      return false
    }
    // 只有超过指定请求数，error 阈值才有意义
    return this.errorPercentage > errorThreshold
  }

  get errorPercentage (): number {
    return this.totalCount === 0 ? 0 : this.errorCount / this.totalCount * 100
  }
}

export function calculateMetrics (buckets: Bucket[]): Metrics {
  return buckets.reduce((metrics, bucket) => metrics.involve(bucket), new Metrics())
}
