/// <reference types="node" />
import {EventEmitter} from 'events'
import BucketList from './BucketList'

export enum State {Open = 'open', HalfOpen = 'halfOpen', Closed = 'closed'}

export interface IStateManagerOptions {
  volumeThreshold: number,
  errorThreshold: number,
  windowDuration: number,
  sleepWindow: number
}

export default class StateManager {
  private state: State = State.Closed

  constructor (private emitter: EventEmitter, private options: IStateManagerOptions) {
  }

  public getState (): State {
    return this.state
  }

  // HALF_OPEN -> OPEN/CLOSED  CLOSED -> OPEN  OPEN -> HALF_OPEN
  public updateState (bucketList: BucketList): void {
    const metrics = bucketList.getMetrics()

    // HALF_OPEN -> OPEN/CLOSED
    switch (this.state) {
      case State.HalfOpen: {
        // 最后一个 bucket 是否失败: 没有成功且有失败，则为失败。只要有成功就算成功
        const lastCommandFailed = bucketList.currentBucket.successes === 0 && metrics.hasError()

        if (lastCommandFailed) {
          this.setState(State.Open, metrics)
        } else {
          // clear old bucket.
          bucketList.reset()
          this.setState(State.Closed)
        }

        break
      }

      case State.Closed: {
        // CLOSED -> OPEN
        if (metrics.overThreshold(this.options.errorThreshold, this.options.volumeThreshold)) {
          this.setState(State.Open, metrics)

          setTimeout(() => {
            if (this.state === State.Open) {
              this.openHalf()
            }
          }, this.options.sleepWindow)
        }

        break
      }
    }
  }

  private setState (state: State, arg?: any) {
    this.state = state
    this.emitter.emit(state === State.Closed ? 'close' : state as string, arg)
  }

  private openHalf (): void {
    this.setState(State.HalfOpen)
  }
}
