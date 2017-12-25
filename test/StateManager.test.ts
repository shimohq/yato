import test from 'ava'
import {EventEmitter} from 'events'
import StateManager, {State} from '../src/StateManager'

function factory (): StateManager {
  return new StateManager(new EventEmitter(), {
    errorThreshold: 0,
    sleepWindow: 0,
    volumeThreshold: 0,
    windowDuration: 0
  })
}

test('defaults to closed', (t) => {
  const stateManager = factory()
  t.is(stateManager.getState(), State.Closed)
})
