import { BehaviorSubject } from 'rxjs'
import cloneDeep from 'lodash/cloneDeep'

export const createStore = () => {
  const s = {
    items: [],
    $: undefined,
    add: undefined,
    subscribe: undefined
  }

  s.$ = new BehaviorSubject(s.items)

  const add = (item) => {
    const newState = cloneDeep(s.items)
    newState.push(item)
    s.items = newState
    s.$.next(s.items)
  }

  s.add = add
  s.subscribe = (cb) => s.$.subscribe(cb)
  return s
}

export const create = title => ({ title })

