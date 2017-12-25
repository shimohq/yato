import test from 'ava'
import {EventEmitter} from 'events'
import CircuitBreaker, {State} from '../src/CircuitBreaker'

function factory (): CircuitBreaker {
  return new CircuitBreaker(new EventEmitter(), {
    errorThreshold: 0,
    sleepWindow: 0,
    volumeThreshold: 0,
    windowDuration: 0
  })
}

test('defaults to closed', (t) => {
  const circuitBreaker = factory()
  t.is(circuitBreaker.getState(), State.Closed)
})
