/// <reference types="node" />
import {EventEmitter} from 'events'
import BucketList from './BucketList'

export enum State {Open = 'open', HalfOpen = 'halfOpen', Closed = 'closed'}

export interface IStateManagerOptions {
  volumeThreshold: number,
  errorThreshold: number,
  windowDuration: number
}

export default class StateManager {
  private _state: State = State.Closed

  constructor (private emitter: EventEmitter, private _options: IStateManagerOptions) {
  }

  public getState (): State {
    return this._state
  }

  public isOpen (): boolean {
    return this._state === State.Open
  }

  public isHalfOpen (): boolean {
    return this._state === State.HalfOpen
  }

  public isClosed (): boolean {
    return this._state === State.Closed
  }

  public openHalf (): void {
    this._setState(State.HalfOpen)
  }

  // HALF_OPEN -> OPEN/CLOSED  CLOSED -> OPEN  OPEN -> HALF_OPEN
  public updateState (buckets: BucketList): void {
    const metrics = buckets.getMetrics()

    // HALF_OPEN -> OPEN/CLOSED
    switch (this._state) {
      case State.HalfOpen: {
        // 最后一个 bucket 是否失败: 没有成功且有失败，则为失败。只要有成功就算成功
        const lastCommandFailed = buckets.currentBucket.successes === 0 && metrics.hasError()

        if (lastCommandFailed) {
          this._setState(State.Open, metrics)
        } else {
          this._setState(State.Closed)
        }

        break
      }

      case State.Closed: {
        // CLOSED -> OPEN
        if (metrics.overThreshold(this._options.errorThreshold, this._options.volumeThreshold)) {
          this._setState(State.Open, metrics)

          setTimeout(() => {
            if (this.isOpen()) {
              this.openHalf()
            }
          }, this._options.windowDuration)
        }

        break
      }
    }
  }

  private _setState (state: State, arg?: any) {
    this._state = state
    this.emitter.emit(state === State.Closed ? 'close' : state, arg)
  }
}
